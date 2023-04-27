import {
  Address,
  applyParamsToScript,
  concat,
  Data,
  fromHex,
  fromText,
  getAddressDetails,
  Lovelace,
  Lucid,
  MerkleTree,
  MintingPolicy,
  OutRef,
  PolicyId,
  sha256,
  SpendingValidator,
  toHex,
  toUnit,
  Tx,
  TxHash,
} from "../../deps.ts";
import { Metadata } from "./types.ts";
import * as D from "./types.ts";
import scripts from "./contract/plutus.json" assert { type: "json" };
import metadata from "./metadata.json" assert { type: "json" };
import merkleData from "./merkle_data.gen.json" assert { type: "json" }; // If this file doesn't exist, prepare metadata.json and run `deno task gen`

export class Contract {
  lucid: Lucid;
  instanceId?: string;
  policy!: MintingPolicy;
  policyId!: PolicyId;
  threadAddress!: Address;
  baseName!: string;
  controlValidator!: SpendingValidator;
  controlAddress!: Address;
  threadPolicy!: MintingPolicy;
  threadPolicyId!: PolicyId;
  seedPaymentValidator!: SpendingValidator;
  seedPaymentAddress!: Address;
  subTrees: MerkleTree[];

  constructor(lucid: Lucid, instanceId?: string) {
    this.lucid = lucid;
    this.instanceId = instanceId;

    this.subTrees = chunks(merkleData, 100).map((chunk) =>
      new MerkleTree(chunk.map((b) => fromHex(b)))
    );

    if (this.instanceId) {
      this._instantiate(this.instanceId);
    }
  }

  _instantiate(instanceId: string) {
    const struct = instanceIdToStruct(instanceId);

    this.threadPolicy = {
      type: "PlutusV2",
      script: applyParamsToScript<D.ThreadPolicyParams>(
        scripts.validators.find((v) => v.title === "thread_policy.mint")!
          .compiledCode,
        [
          {
            txHash: { hash: struct.txHash },
            outputIndex: BigInt(struct.outputIndex),
          },
        ],
        D.ThreadPolicyParams,
      ),
    };
    this.threadPolicyId = this.lucid.utils.mintingPolicyToId(
      this.threadPolicy,
    );

    this.controlValidator = {
      type: "PlutusV2",
      script:
        scripts.validators.find((v) => v.title === "metadata_control.spend")!
          .compiledCode,
    };
    this.controlAddress = this.lucid.utils.validatorToAddress(
      this.controlValidator,
    );

    this.seedPaymentValidator = {
      type: "PlutusV2",
      script: applyParamsToScript<D.SeedPaymentParams>(
        scripts.validators.find((v) => v.title === "seed_and_payment.spend")!
          .compiledCode,
        [this.threadPolicyId],
        D.SeedPaymentParams,
      ),
    };
    this.seedPaymentAddress = this.lucid.utils.validatorToAddress(
      this.seedPaymentValidator,
    );

    // minting policy and spending script (multi validator)
    this.policy = {
      type: "PlutusV2",
      script: applyParamsToScript<D.ThreadParams>(
        scripts.validators.find((v) => v.title === "minting_policy.mint")!
          .compiledCode,
        [
          this.threadPolicyId,
          fromAddress(this.controlAddress),
          BigInt(struct.totalLanes),
        ],
        D.ThreadParams,
      ),
    };
    this.policyId = this.lucid.utils.mintingPolicyToId(this.policy);
    this.threadAddress = this.lucid.utils.validatorToAddress(this.policy);

    this.baseName = struct.baseName;
  }

  /** (Right now limited to 10k collection mints) */
  async deploy(): Promise<{ txHash: TxHash; instanceId: string }> {
    if (this.instanceId) {
      throw instanceAlreadyDeployedError;
    }

    const [utxo] = await this.lucid.wallet.getUtxos();

    const assetName = fromText(metadata[0].name.replace(/\s/g, "").slice(0, 8));

    const instanceId = utxo.txHash + "-" + utxo.outputIndex + "-" + assetName +
      "-" + 100;
    this._instantiate(instanceId);
    console.log("Instance id:", instanceId);

    return {
      txHash: await this.lucid.newTx()
        .collectFrom([utxo])
        .mintAssets({
          [toUnit(this.threadPolicyId, fromText("Thread"))]: 100n,
          [toUnit(this.threadPolicyId, fromText("Payment"))]: 1n,
          [toUnit(this.threadPolicyId, fromText("Ownership"))]: 1n,
          [toUnit(this.threadPolicyId, fromText("MintExtra"))]: 1n,
        }, Data.to<D.Action>("Minting", D.Action))
        .compose([...Array(100)].reduce(
          (tx: Tx, _, index) =>
            tx.payToContract(this.threadAddress, {
              inline: Data.to<D.ThreadDatum>(
                {
                  base: BigInt(index * 100),
                  counter: 0n,
                  maxId: BigInt(index * 100 + 100),
                  merkleRoot: toHex(this.subTrees[index].rootHash()),
                  seed: null,
                },
                D.ThreadDatum,
              ),
            }, { [toUnit(this.threadPolicyId, fromText("Thread"))]: 1n }),
          this.lucid.newTx(),
        ))
        .attachMintingPolicy(this.threadPolicy)
        .complete()
        .then((tx) => tx.sign().complete())
        .then((tx) => tx.submit()),
      instanceId,
    };
  }

  async start(
    payments: { address: Address; amount: Lovelace }[],
  ): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }
    return await this.lucid.newTx()
      .payToContract(
        this.seedPaymentAddress,
        {
          inline: Data.to<D.Payments>(
            payments.map((payment) => ({
              address: fromAddress(payment.address),
              amount: payment.amount,
            })),
            D.Payments,
          ),
          scriptRef: this.policy,
        },
        {
          [toUnit(this.threadPolicyId, fromText("Payment"))]: 1n,
        },
      ).complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async hasStarted(): Promise<boolean> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.seedPaymentAddress,
      toUnit(this.threadPolicyId, fromText("Payment")),
    );
    return !!paymentUtxo;
  }

  /** Mint Royalty and Ip token. */
  async mintExtra(): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.seedPaymentAddress,
      toUnit(this.threadPolicyId, fromText("Payment")),
    );
    return await this.lucid.newTx()
      .readFrom([paymentUtxo])
      .mintAssets({
        [toUnit(this.policyId, fromText("Royalty"), 500)]: 1n,
        [toUnit(this.policyId, fromText("Ip"), 600)]: 1n,
      }, Data.to<D.Action>("MintingExtra", D.Action))
      .mintAssets({
        [toUnit(this.threadPolicyId, fromText("MintExtra"))]: -1n,
      }, Data.to<D.ThreadPolicyAction>("Burning", D.ThreadPolicyAction))
      .attachMintingPolicy(this.threadPolicy)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async mint(): Promise<{ id: number; txHash: TxHash }> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const utxo = randomArrayItem(await this.lucid.wallet.getUtxos());

    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.seedPaymentAddress,
      toUnit(this.threadPolicyId, fromText("Payment")),
    );

    const payments = (await this.lucid.datumOf<D.Payments>(
      paymentUtxo,
      D.Payments,
    )).reduce(
      (tx: Tx, payment) =>
        tx.payToAddress(toAddress(payment.address, this.lucid), {
          lovelace: payment.amount,
        }),
      this.lucid.newTx(),
    );

    const randomLane = hashToNumber(
      toHex(
        sha256(
          concat(
            hashOutRef({
              txHash: utxo.txHash,
              outputIndex: utxo.outputIndex,
            }),
            hashOutRef({
              txHash: paymentUtxo.txHash,
              outputIndex: paymentUtxo.outputIndex,
            }),
          ),
        ),
      ),
    ) % 100;

    const [threadUtxo] = await asyncFilter(
      await this.lucid.utxosAtWithUnit(
        this.threadAddress,
        toUnit(this.threadPolicyId, fromText("Thread")),
      ),
      async (utxo) => {
        const threadDatum = await this.lucid.datumOf<D.ThreadDatum>(
          utxo,
          D.ThreadDatum,
        );

        return BigInt(randomLane) === threadDatum.base / 100n &&
          threadDatum.base + threadDatum.counter < threadDatum.maxId;
      },
    );

    if (!threadUtxo) {
      throw new Error(
        "No NFT available. Try again or rotate your wallet to bring in new randomness.",
      );
    }

    const threadDatum = await this.lucid.datumOf<D.ThreadDatum>(
      threadUtxo,
      D.ThreadDatum,
    );

    const seed = threadDatum.seed
      ? Number(threadDatum.seed)
      : hashToNumber(toHex(sha256(
        concat(
          hashOutRef({ txHash: utxo.txHash, outputIndex: utxo.outputIndex }),
          hashOutRef({
            txHash: paymentUtxo.txHash,
            outputIndex: paymentUtxo.outputIndex,
          }),
        ),
      )));

    const id = randomInSequence(Number(threadDatum.counter), seed, 100) +
      Number(threadDatum.base);

    threadDatum.counter += 1n;
    threadDatum.seed = BigInt(seed);

    const proof: D.MerkleProof = this.subTrees[randomLane].getProof(
      fromHex(merkleData[id]),
    ).map((p) =>
      p.left ? { Left: [toHex(p.left)] } : { Right: [toHex(p.right!)] }
    );

    return {
      txHash: await this.lucid.newTx()
        .readFrom([paymentUtxo])
        .collectFrom([utxo])
        .collectFrom(
          [threadUtxo],
          Data.to<D.ThreadAction>({
            Spend: [{
              Progress: [{
                txHash: { hash: utxo.txHash },
                outputIndex: BigInt(utxo.outputIndex),
              }, proof],
            }],
          }, D.ThreadAction),
        )
        .mintAssets({
          [toUnit(this.policyId, this.baseName + fromNumber(id), 100)]: 1n,
          [toUnit(this.policyId, this.baseName + fromNumber(id), 222)]: 1n,
        }, Data.to<D.Action>("Minting", D.Action))
        .payToContract(
          this.threadAddress,
          { inline: Data.to<D.ThreadDatum>(threadDatum, D.ThreadDatum) },
          {
            [toUnit(this.threadPolicyId, fromText("Thread"))]: 1n,
          },
        )
        .payToContract(
          this.controlAddress,
          Data.to<D.DatumMetadata>({
            metadata: Data.castFrom<D.Metadata222>(
              Data.fromJson(metadata[id]),
              D.Metadata222,
            ),
            version: 1n,
            extra: Data.from(Data.void()),
          }, D.DatumMetadata),
          {
            [toUnit(this.policyId, this.baseName + fromNumber(id), 100)]: 1n,
          },
        )
        .compose(payments)
        .complete()
        .then((tx) => tx.sign().complete())
        .then((tx) => tx.submit()),
      id,
    };
  }

  async burn(id: number): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.policyId, this.baseName + fromNumber(id), 100),
    );

    return await this.lucid.newTx()
      .collectFrom([referenceUtxo], Data.void())
      .mintAssets({
        [toUnit(this.policyId, this.baseName + fromNumber(id), 100)]: -1n,
        [toUnit(this.policyId, this.baseName + fromNumber(id), 222)]: -1n,
      }, Data.to<D.Action>("Burning", D.Action))
      .attachMintingPolicy(this.policy)
      .attachSpendingValidator(this.controlValidator)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  /**
   * Destroy the initial deployed UTxO lanes to claim back the ADA and clean up the ledger.\
   * 15 lines will be destroyed per transaction.\
   * Only do this operation when all lanes reached their max supply!
   */
  async destroyLanes(): Promise<TxHash> {
    const utxos = await this.lucid.utxosAtWithUnit(
      this.threadAddress,
      toUnit(this.threadPolicyId, fromText("Thread")),
    );

    const [ownershipUtxo] = (await this.lucid.wallet.getUtxos()).filter(
      (utxo) =>
        Object.keys(utxo.assets).some((unit) =>
          unit === toUnit(this.threadPolicyId, fromText("Ownership"))
        ),
    );

    if (!ownershipUtxo) throw new Error("No owner found.");

    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.seedPaymentAddress,
      toUnit(this.threadPolicyId, fromText("Payment")),
    );

    if (utxos.length <= 0) throw new Error("All lanes already destroyed.");

    const batch = utxos.slice(0, 15);

    return await this.lucid.newTx()
      .readFrom([paymentUtxo])
      .collectFrom([ownershipUtxo])
      .collectFrom(
        batch,
        Data.to<D.ThreadAction>({ Spend: ["Destroy"] }, D.ThreadAction),
      )
      .mintAssets(
        {
          [toUnit(this.threadPolicyId, fromText("Thread"))]: -BigInt(
            batch.length,
          ),
        },
        Data.to<D.ThreadPolicyAction>("Burning", D.ThreadPolicyAction),
      )
      .attachMintingPolicy(this.threadPolicy)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  /**
   *  Destroy payment utxo, which holds information about the recipients and holds the minting script.
   *  Only destroy this when the mint is over and after destroying all lanes!
   */
  async destroyPayment(): Promise<TxHash> {
    const [paymentUtxo] = await this.lucid.utxosAtWithUnit(
      this.seedPaymentAddress,
      toUnit(this.threadPolicyId, fromText("Payment")),
    );

    if ((await this.getTotalLanes()) > 0) {
      throw new Error("Destroy all lanes first.");
    }

    return await this.lucid.newTx()
      .collectFrom([paymentUtxo], Data.void())
      .mintAssets({
        [toUnit(this.threadPolicyId, fromText("Payment"))]: -1n,
        [toUnit(this.threadPolicyId, fromText("Ownership"))]: -1n,
      }, Data.to<D.ThreadPolicyAction>("Burning", D.ThreadPolicyAction))
      .attachMintingPolicy(this.threadPolicy)
      .attachSpendingValidator(this.seedPaymentValidator)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async getTotalLanes(): Promise<number> {
    const utxos = await this.lucid.utxosAtWithUnit(
      this.threadAddress,
      toUnit(this.threadPolicyId, fromText("Thread")),
    );
    return utxos.length;
  }

  async getMetadata(id: number): Promise<Metadata | null> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }
    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.policyId, this.baseName + fromNumber(id), 100),
    );

    if (!referenceUtxo) return null;

    const datumMetadata = await this.lucid.datumOf<D.DatumMetadata>(
      referenceUtxo,
      D.DatumMetadata,
    );

    const metadata = Data.toJson(datumMetadata.metadata);
    return metadata;
  }
}

const instanceMissingError = new Error(
  "Contract needs to be initialized with an instance id.",
);

const instanceAlreadyDeployedError = new Error(
  "Contract is already deployed.",
);

function fromNumber(n: number | bigint): string {
  return fromText(n.toString());
}

function instanceIdToStruct(
  instanceId: string,
): OutRef & { baseName: string; totalLanes: number } {
  const [txHash, outputIndex, baseName, totalLanes] = instanceId.split("-");
  return {
    txHash,
    outputIndex: parseInt(outputIndex),
    baseName,
    totalLanes: parseInt(totalLanes),
  };
}

function fromAddress(address: Address): D.Address {
  // We do not support pointer addresses!

  const { paymentCredential, stakeCredential } = getAddressDetails(
    address,
  );

  if (!paymentCredential) throw new Error("Not a valid payment address.");

  return {
    paymentCredential: paymentCredential?.type === "Key"
      ? {
        PublicKeyCredential: [paymentCredential.hash],
      }
      : { ScriptCredential: [paymentCredential.hash] },
    stakeCredential: stakeCredential
      ? {
        Inline: [
          stakeCredential.type === "Key"
            ? {
              PublicKeyCredential: [stakeCredential.hash],
            }
            : { ScriptCredential: [stakeCredential.hash] },
        ],
      }
      : null,
  };
}

export function toAddress(address: D.Address, lucid: Lucid): Address {
  const paymentCredential = (() => {
    if ("PublicKeyCredential" in address.paymentCredential) {
      return lucid.utils.keyHashToCredential(
        address.paymentCredential.PublicKeyCredential[0],
      );
    } else {
      return lucid.utils.scriptHashToCredential(
        address.paymentCredential.ScriptCredential[0],
      );
    }
  })();
  const stakeCredential = (() => {
    if (!address.stakeCredential) return undefined;
    if ("Inline" in address.stakeCredential) {
      if ("PublicKeyCredential" in address.stakeCredential.Inline[0]) {
        return lucid.utils.keyHashToCredential(
          address.stakeCredential.Inline[0].PublicKeyCredential[0],
        );
      } else {
        return lucid.utils.scriptHashToCredential(
          address.stakeCredential.Inline[0].ScriptCredential[0],
        );
      }
    } else {
      return undefined;
    }
  })();
  return lucid.utils.credentialToAddress(paymentCredential, stakeCredential);
}

async function asyncFilter<T>(
  array: T[],
  predicate: (value: T, index: number, array: T[]) => unknown,
) {
  return await Promise.all(array.map(predicate))
    .then((results) => array.filter((_, index) => results[index]));
}

function randomInSequence(x: number, seed: number, range: number): number {
  return (23 * x + seed) % range;
}

function hashOutRef(outRef: OutRef): Uint8Array {
  return sha256(
    fromHex(
      Data.to<D.OutputReference>({
        txHash: { hash: outRef.txHash },
        outputIndex: BigInt(outRef.outputIndex),
      }, D.OutputReference),
    ),
  );
}

function hashToNumber(hash: string): number {
  return parseInt(hash.slice(0, 12), 16);
}

function randomArrayItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function chunks<T>(array: T[], size: number): T[][] {
  return Array.from(
    new Array(Math.ceil(array.length / size)),
    (_, i) => array.slice(i * size, i * size + size),
  );
}

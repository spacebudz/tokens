import {
  Address,
  applyParamsToScript,
  Constr,
  Data,
  Datum,
  fromText,
  getAddressDetails,
  Lucid,
  MintingPolicy,
  OutRef,
  PolicyId,
  SpendingValidator,
  toUnit,
  TxHash,
} from "../../deps.ts";
import { Metadata } from "./types.ts";
import * as D from "./types.ts";
import scripts from "./contract/plutus.json" assert { type: "json" };

export function fromAddress(address: Address): D.Address {
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

export class Contract {
  lucid: Lucid;
  instanceId?: string;
  policy!: MintingPolicy;
  policyId!: PolicyId;
  policyAddress!: Address;
  assetName!: string;
  controlValidator!: SpendingValidator;
  controlAddress!: Address;
  specificPolicy!: MintingPolicy;
  specificPolicyId!: PolicyId;
  maxSupply!: number | null;

  constructor(lucid: Lucid, instanceId?: string) {
    this.lucid = lucid;
    this.instanceId = instanceId;

    if (this.instanceId) {
      this._instantiate(this.instanceId);
    }
  }

  _instantiate(instanceId: string) {
    const struct = instanceIdToStruct(instanceId);

    this.specificPolicy = {
      type: "PlutusV2",
      script: applyParamsToScript<D.SpecifcParams>(
        scripts.validators.find((v) => v.title === "specific_policy.mint")!
          .compiledCode,
        [
          {
            txHash: { hash: struct.txHash },
            outputIndex: BigInt(struct.outputIndex),
          },
        ],
        D.SpecifcParams,
      ),
    };
    this.specificPolicyId = this.lucid.utils.mintingPolicyToId(
      this.specificPolicy,
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

    // minting policy and spending script (multi validator)
    this.policy = {
      type: "PlutusV2",
      script: applyParamsToScript<D.MintingParams>(
        scripts.validators.find((v) => v.title === "minting_policy.mint")!
          .compiledCode,
        [
          struct.maxSupply,
          struct.assetName,
          {
            policyId: this.specificPolicyId,
            assetName: fromText("Ownership") + struct.assetName,
          },
          { policyId: this.specificPolicyId, assetName: fromText("Thread") },
          fromAddress(this.controlAddress),
        ],
        D.MintingParams,
      ),
    };
    this.policyId = this.lucid.utils.mintingPolicyToId(this.policy);
    this.policyAddress = this.lucid.utils.validatorToAddress(this.policy);

    this.assetName = struct.assetName;
    this.maxSupply = struct.maxSupply ? Number(struct.maxSupply) : null;
  }

  async deploy(
    name: string,
    maxSupply?: number,
  ): Promise<{ txHash: TxHash; instanceId: string }> {
    if (this.instanceId) {
      throw instanceAlreadyDeployedError;
    }

    const [utxo] = await this.lucid.wallet.getUtxos();

    const assetName = fromText(name.replace(/\s/g, "").slice(0, 8));

    const instanceId = utxo.txHash + "-" + utxo.outputIndex + "-" + assetName +
      (maxSupply ? "-" + maxSupply : "");
    this._instantiate(instanceId);
    console.log("Instance id:", instanceId);

    return {
      txHash: await this.lucid.newTx()
        .collectFrom([utxo])
        .mintAssets({
          [toUnit(this.specificPolicyId, fromText("Ownership") + assetName)]:
            1n,
          [toUnit(this.specificPolicyId, fromText("Thread"))]: 1n,
        }, Data.to<D.Action>("Minting", D.Action))
        .payToContract(
          this.policyAddress,
          { inline: Data.to(0n) },
          {
            [toUnit(this.specificPolicyId, fromText("Thread"))]: 1n,
          },
        )
        .attachMintingPolicy(this.specificPolicy)
        .complete()
        .then((tx) => tx.sign().complete())
        .then((tx) => tx.submit()),
      instanceId,
    };
  }

  async mint(metadata: Metadata): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [idUtxo] = await this.lucid.utxosAtWithUnit(
      this.policyAddress,
      toUnit(this.specificPolicyId, fromText("Thread")),
    );

    const [ownershipUtxo] = (await this.lucid.wallet.getUtxos()).filter(
      (utxo) =>
        Object.keys(utxo.assets).some((unit) =>
          unit ===
            toUnit(
              this.specificPolicyId,
              fromText("Ownership") + this.assetName,
            )
        ),
    );

    if (!ownershipUtxo) throw new Error("No ownership.");

    const id = Data.from(await this.lucid.datumOf(idUtxo)) as bigint;

    if (this.maxSupply && id >= this.maxSupply) {
      throw new Error("Max supply reached.");
    }

    return await this.lucid.newTx()
      .collectFrom([ownershipUtxo])
      .collectFrom([idUtxo], Data.to(new Constr(1, [new Constr(0, [])])))
      .mintAssets({
        [toUnit(this.policyId, this.assetName + fromNumber(id), 100)]: 1n,
        [toUnit(this.policyId, this.assetName + fromNumber(id), 222)]: 1n,
      }, Data.to<D.Action>("Minting", D.Action))
      .payToContract(
        this.policyAddress,
        { inline: Data.to(id + 1n) },
        {
          [toUnit(this.specificPolicyId, fromText("Thread"))]: 1n,
        },
      )
      .payToContract(
        this.controlAddress,
        Data.to<D.DatumMetadata>({
          metadata: Data.castFrom<D.Metadata222>(
            Data.fromJson(metadata),
            D.Metadata222,
          ),
          version: 1n,
          extra: Data.from(Data.void()),
        }, D.DatumMetadata),
        {
          [toUnit(this.policyId, this.assetName + fromNumber(id), 100)]: 1n,
        },
      )
      .attachMintingPolicy(this.policy)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async burn(id: number): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.policyId, this.assetName + fromNumber(id), 100),
    );

    return await this.lucid.newTx()
      .collectFrom([referenceUtxo], Data.void())
      .mintAssets({
        [toUnit(this.policyId, this.assetName + fromNumber(id), 100)]: -1n,
        [toUnit(this.policyId, this.assetName + fromNumber(id), 222)]: -1n,
      }, Data.to<D.Action>("Burning", D.Action))
      .attachMintingPolicy(this.policy)
      .attachSpendingValidator(this.controlValidator)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async transferOwnership(address: Address, datum?: Datum): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    return await this.lucid.newTx()
      .compose(
        datum
          ? this.lucid.newTx().payToAddressWithData(address, datum, {
            [
              toUnit(
                this.specificPolicyId,
                fromText("Ownership") + this.assetName,
              )
            ]: 1n,
          })
          : this.lucid.newTx().payToAddress(address, {
            [
              toUnit(
                this.specificPolicyId,
                fromText("Ownership") + this.assetName,
              )
            ]: 1n,
          }),
      )
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async renounceOwnership(): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    return await this.lucid.newTx()
      .mintAssets({
        [
          toUnit(this.specificPolicyId, fromText("Ownership") + this.assetName)
        ]: -1n,
      }, Data.to<D.Action>("Burning", D.Action))
      .attachMintingPolicy(this.specificPolicy)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async getOwner(): Promise<Address> {
    const ownershipUtxo = await this.lucid.utxoByUnit(
      toUnit(this.specificPolicyId, fromText("Ownership") + this.assetName),
    );

    return ownershipUtxo.address;
  }

  async getNextId(): Promise<number> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }
    const [idUtxo] = await this.lucid.utxosAtWithUnit(
      this.policyAddress,
      toUnit(this.specificPolicyId, fromText("Thread")),
    );
    const id = Data.from(await this.lucid.datumOf(idUtxo)) as bigint;
    return Number(id);
  }

  getMaxSupply(): number | null {
    if (!this.instanceId) {
      throw instanceMissingError;
    }
    return this.maxSupply;
  }

  async getMetadata(id: number): Promise<Metadata | null> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }
    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.policyId, this.assetName + fromNumber(id), 100),
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
): OutRef & { assetName: string; maxSupply: bigint | null } {
  const [txHash, outputIndex, assetName, maxSupply] = instanceId.split("-");
  return {
    txHash,
    outputIndex: parseInt(outputIndex),
    assetName,
    maxSupply: maxSupply ? BigInt(maxSupply) : null,
  };
}

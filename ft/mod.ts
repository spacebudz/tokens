import {
  Address,
  applyParamsToScript,
  Data,
  Datum,
  fromText,
  Lucid,
  MintingPolicy,
  OutRef,
  PolicyId,
  SpendingValidator,
  toUnit,
  TxHash,
} from "../deps.ts";
import { Metadata } from "./types.ts";
import * as D from "./types.ts";
import scripts from "./contract/plutus.json" assert { type: "json" };

export class Contract {
  lucid: Lucid;
  instanceId?: string;
  policy!: MintingPolicy;
  policyId!: PolicyId;
  assetName!: string;
  ownershipPolicy!: MintingPolicy;
  ownershipPolicyId!: PolicyId;
  controlValidator!: SpendingValidator;
  controlAddress!: Address;

  constructor(lucid: Lucid, instanceId?: string) {
    this.lucid = lucid;
    this.instanceId = instanceId;

    if (this.instanceId) {
      this._instantiate(this.instanceId);
    }
  }

  _instantiate(instanceId: string) {
    const struct = instanceIdToStruct(instanceId);
    this.policy = {
      type: "PlutusV2",
      script: applyParamsToScript<D.MintingParams>(
        scripts.validators.find((v) => v.title === "minting_policy.mint")!
          .compiledCode,
        [
          {
            txHash: { hash: struct.txHash },
            outputIndex: BigInt(struct.outputIndex),
          },
          fromText("FT"),
        ],
        D.MintingParams,
      ),
    };
    this.policyId = this.lucid.utils.mintingPolicyToId(this.policy);

    this.ownershipPolicy = {
      type: "PlutusV2",
      script: applyParamsToScript<D.MintingParams>(
        scripts.validators.find((v) => v.title === "minting_policy.mint")!
          .compiledCode,
        [
          {
            txHash: { hash: struct.txHash },
            outputIndex: BigInt(struct.outputIndex),
          },
          fromText("Ownership"),
        ],
        D.MintingParams,
      ),
    };
    this.ownershipPolicyId = this.lucid.utils.mintingPolicyToId(
      this.ownershipPolicy,
    );

    this.controlValidator = {
      type: "PlutusV2",
      script: applyParamsToScript<D.ControlParams>(
        scripts.validators.find((v) => v.title === "metadata_control.spend")!
          .compiledCode,
        [{
          policyId: this.ownershipPolicyId,
          assetName: fromText("Ownership") + struct.assetName,
        }],
        D.ControlParams,
      ),
    };
    this.controlAddress = this.lucid.utils.validatorToAddress(
      this.controlValidator,
    );

    this.assetName = struct.assetName;
  }

  async deploy(
    totalSupply: bigint,
    metadata: Metadata,
  ): Promise<{ txHash: TxHash; instanceId: string }> {
    if (this.instanceId) {
      throw instanceAlreadyDeployedError;
    }

    const [utxo] = await this.lucid.wallet.getUtxos();

    const assetName = fromText(metadata.name.replace(/\s/g, "").slice(0, 8));

    const instanceId = utxo.txHash + "-" + utxo.outputIndex + "-" + assetName;
    this._instantiate(instanceId);
    console.log("Instance id:", instanceId);

    return {
      txHash: await this.lucid.newTx()
        .collectFrom([utxo])
        .mintAssets({
          [toUnit(this.policyId, assetName, 100)]: 1n,
          [toUnit(this.policyId, assetName, 333)]: totalSupply,
        }, Data.to<D.Action>("Minting", D.Action))
        .mintAssets(
          {
            [toUnit(this.ownershipPolicyId, fromText("Ownership") + assetName)]:
              1n,
          },
          Data.to<D.Action>("Minting", D.Action),
        )
        .payToContract(
          this.controlAddress,
          Data.to<D.DatumMetadata>({
            metadata: Data.castFrom<D.Metadata333>(
              Data.fromJson(metadata),
              D.Metadata333,
            ),
            version: 1n,
            extra: Data.from(Data.void()),
          }, D.DatumMetadata),
          {
            [toUnit(this.policyId, assetName, 100)]: 1n,
          },
        )
        .attachMintingPolicy(this.policy)
        .attachMintingPolicy(this.ownershipPolicy)
        .complete()
        .then((tx) => tx.sign().complete())
        .then((tx) => tx.submit()),
      instanceId,
    };
  }

  async burn(quantity: bigint): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const burnQuantity = quantity > 0 ? quantity * -1n : quantity;

    return await this.lucid.newTx()
      .mintAssets({
        [toUnit(this.policyId, this.assetName, 333)]: burnQuantity,
      }, Data.to<D.Action>("Burning", D.Action))
      .attachMintingPolicy(this.policy)
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
                this.ownershipPolicyId,
                fromText("Ownership") + this.assetName,
              )
            ]: 1n,
          })
          : this.lucid.newTx().payToAddress(address, {
            [
              toUnit(
                this.ownershipPolicyId,
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
          toUnit(this.ownershipPolicyId, fromText("Ownership") + this.assetName)
        ]: -1n,
      }, Data.to<D.Action>("Burning", D.Action))
      .attachMintingPolicy(this.ownershipPolicy)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async changeMetadata(metadata: Metadata): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.policyId, this.assetName, 100),
    );

    const [ownershipUtxo] = (await this.lucid.wallet.getUtxos()).filter(
      (utxo) =>
        Object.keys(utxo.assets).some((unit) =>
          unit ===
            toUnit(
              this.ownershipPolicyId,
              fromText("Ownership") + this.assetName,
            )
        ),
    );

    if (!ownershipUtxo) throw new Error("No ownership.");

    return await this.lucid.newTx()
      .collectFrom([ownershipUtxo])
      .collectFrom([referenceUtxo], Data.void())
      .payToContract(
        this.controlAddress,
        Data.to<D.DatumMetadata>({
          metadata: Data.castFrom<D.Metadata333>(
            Data.fromJson(metadata),
            D.Metadata333,
          ),
          version: 1n,
          extra: Data.from(Data.void()),
        }, D.DatumMetadata),
        {
          [toUnit(this.policyId, this.assetName, 100)]: 1n,
        },
      )
      .attachSpendingValidator(this.controlValidator)
      .complete()
      .then((tx) => tx.sign().complete())
      .then((tx) => tx.submit());
  }

  async getMetadata(): Promise<Metadata> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }
    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.policyId, this.assetName, 100),
    );

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

function instanceIdToStruct(
  instanceId: string,
): OutRef & { assetName: string } {
  const [txHash, outputIndex, assetName] = instanceId.split("-");
  return {
    txHash,
    outputIndex: parseInt(outputIndex),
    assetName,
  };
}

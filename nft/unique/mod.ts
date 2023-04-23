import {
  Address,
  applyParamsToScript,
  Data,
  fromText,
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

export class Contract {
  lucid: Lucid;
  instanceId?: string;
  policy!: MintingPolicy;
  policyId!: PolicyId;
  assetName!: string;
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
        ],
        D.MintingParams,
      ),
    };
    this.policyId = this.lucid.utils.mintingPolicyToId(this.policy);

    this.controlValidator = {
      type: "PlutusV2",
      script:
        scripts.validators.find((v) => v.title === "metadata_control.spend")!
          .compiledCode,
    };
    this.controlAddress = this.lucid.utils.validatorToAddress(
      this.controlValidator,
    );

    this.assetName = struct.assetName;
  }

  async deploy(
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
          [toUnit(this.policyId, assetName, 222)]: 1n,
        }, Data.to<D.Action>("Minting", D.Action))
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
            [toUnit(this.policyId, assetName, 100)]: 1n,
          },
        )
        .attachMintingPolicy(this.policy)
        .complete()
        .then((tx) => tx.sign().complete())
        .then((tx) => tx.submit()),
      instanceId,
    };
  }

  async burn(): Promise<TxHash> {
    if (!this.instanceId) {
      throw instanceMissingError;
    }

    const [referenceUtxo] = await this.lucid.utxosAtWithUnit(
      this.controlAddress,
      toUnit(this.policyId, this.assetName, 100),
    );

    return await this.lucid.newTx()
      .collectFrom([referenceUtxo], Data.void())
      .mintAssets({
        [toUnit(this.policyId, this.assetName, 100)]: -1n,
        [toUnit(this.policyId, this.assetName, 222)]: -1n,
      }, Data.to<D.Action>("Burning", D.Action))
      .attachMintingPolicy(this.policy)
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

import { Data } from "../deps.ts";

export const OutputReference = Data.Object({
  txHash: Data.Object({ hash: Data.Bytes({ minLength: 32, maxLength: 32 }) }),
  outputIndex: Data.Integer(),
});
export type OutputReference = Data.Static<typeof OutputReference>;

export const Action = Data.Enum([
  Data.Literal("Minting"),
  Data.Literal("Burning"),
]);
export type Action = Data.Static<typeof Action>;

export const Metadata333 = Data.Map(Data.Bytes(), Data.Any());
export type Metadata333 = Data.Static<typeof Metadata333>;

export const DatumMetadata = Data.Object({
  metadata: Metadata333,
  version: Data.Integer({ minimum: 1, maximum: 1 }),
  extra: Data.Any(),
});
export type DatumMetadata = Data.Static<typeof DatumMetadata>;

export const ControlToken = Data.Object({
  policyId: Data.Bytes({ minLength: 28, maxLength: 28 }),
  assetName: Data.Bytes({ maxLength: 32 }),
});

export const MintingParams = Data.Tuple([OutputReference, Data.Bytes()]);
export type MintingParams = Data.Static<typeof MintingParams>;

export const ControlParams = Data.Tuple([ControlToken]);
export type ControlParams = Data.Static<typeof ControlParams>;

export type Metadata = {
  name: string;
  description: string;
  ticker?: string;
  url?: string;
  logo?: string;
  decimals?: number;
};

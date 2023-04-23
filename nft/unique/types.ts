import { Data } from "../../deps.ts";

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

export const Metadata222 = Data.Map(Data.Bytes(), Data.Any());
export type Metadata222 = Data.Static<typeof Metadata222>;

export const DatumMetadata = Data.Object({
  metadata: Metadata222,
  version: Data.Integer({ minimum: 1, maximum: 1 }),
  extra: Data.Any(),
});
export type DatumMetadata = Data.Static<typeof DatumMetadata>;

export const MintingParams = Data.Tuple([OutputReference]);
export type MintingParams = Data.Static<typeof MintingParams>;

type FileDetails = {
  name?: string;
  mediaType: string;
  src: string;
};

export type Metadata = {
  name: string;
  image: string;
  mediaType?: string;
  description?: string;
  files?: FileDetails[];
};

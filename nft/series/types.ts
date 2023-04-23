import { Data } from "../../deps.ts";

export const OutputReference = Data.Object({
  txHash: Data.Object({ hash: Data.Bytes({ minLength: 32, maxLength: 32 }) }),
  outputIndex: Data.Integer(),
});
export type OutputReference = Data.Static<typeof OutputReference>;

export const Credential = Data.Enum([
  Data.Object({
    PublicKeyCredential: Data.Tuple([
      Data.Bytes({ minLength: 28, maxLength: 28 }),
    ]),
  }),
  Data.Object({
    ScriptCredential: Data.Tuple([
      Data.Bytes({ minLength: 28, maxLength: 28 }),
    ]),
  }),
]);
export type Credential = Data.Static<typeof Credential>;

export const Address = Data.Object({
  paymentCredential: Credential,
  stakeCredential: Data.Nullable(Data.Enum([
    Data.Object({ Inline: Data.Tuple([Credential]) }),
    Data.Object({
      Pointer: Data.Tuple([Data.Object({
        slotNumber: Data.Integer(),
        transactionIndex: Data.Integer(),
        certificateIndex: Data.Integer(),
      })]),
    }),
  ])),
});
export type Address = Data.Static<typeof Address>;

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

export const SpecificToken = Data.Object({
  policyId: Data.Bytes({ minLength: 28, maxLength: 28 }),
  assetName: Data.Bytes({ maxLength: 32 }),
});
export type SpecificToken = Data.Static<typeof SpecificToken>;

export const Counter = Data.Object({ id: Data.Integer() });
export type Counter = Data.Static<typeof Counter>;

export const MintingParams = Data.Tuple([
  Data.Nullable(Data.Integer()),
  Data.Bytes({ maxLength: 32 }),
  SpecificToken,
  SpecificToken,
  Address,
]);
export type MintingParams = Data.Static<typeof MintingParams>;

export const SpecifcParams = Data.Tuple([OutputReference]);
export type SpecifcParams = Data.Static<typeof SpecifcParams>;

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

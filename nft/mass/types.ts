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

export const MerkleProof = Data.Array(Data.Enum([
  Data.Object({
    Left: Data.Tuple([Data.Bytes({ minLength: 32, maxLength: 32 })]),
  }),
  Data.Object({
    Right: Data.Tuple([Data.Bytes({ minLength: 32, maxLength: 32 })]),
  }),
]));
export type MerkleProof = Data.Static<typeof MerkleProof>;

export const Action = Data.Enum([
  Data.Literal("Minting"),
  Data.Literal("MintingExtra"),
  Data.Literal("Burning"),
]);
export type Action = Data.Static<typeof Action>;

export const ThreadPolicyAction = Data.Enum([
  Data.Literal("Minting"),
  Data.Literal("Burning"),
]);
export type ThreadPolicyAction = Data.Static<typeof ThreadPolicyAction>;

export const ThreadAction = Data.Enum([
  Data.Literal("_"),
  Data.Object({
    Spend: Data.Tuple([Data.Enum([
      Data.Object({ Progress: Data.Tuple([OutputReference, MerkleProof]) }),
      Data.Literal("Destroy"),
    ])]),
  }),
]);
export type ThreadAction = Data.Static<typeof ThreadAction>;

export const Metadata222 = Data.Map(Data.Bytes(), Data.Any());
export type Metadata222 = Data.Static<typeof Metadata222>;

export const DatumMetadata = Data.Object({
  metadata: Metadata222,
  version: Data.Integer({ minimum: 1, maximum: 1 }),
  extra: Data.Any(),
});
export type DatumMetadata = Data.Static<typeof DatumMetadata>;

export const Payments = Data.Array(Data.Object({
  address: Address,
  amount: Data.Integer(),
}));
export type Payments = Data.Static<typeof Payments>;

export const ThreadDatum = Data.Object({
  base: Data.Integer(),
  counter: Data.Integer(),
  maxId: Data.Integer(),
  merkleRoot: Data.Bytes({ minLength: 32, maxLength: 32 }),
  seed: Data.Nullable(Data.Integer()),
});
export type ThreadDatum = Data.Static<typeof ThreadDatum>;

export const ThreadParams = Data.Tuple([
  Data.Bytes({ minLength: 28, maxLength: 28 }),
  Address,
  Data.Integer(),
]);
export type ThreadParams = Data.Static<typeof ThreadParams>;

export const ThreadPolicyParams = Data.Tuple([OutputReference]);
export type ThreadPolicyParams = Data.Static<typeof ThreadPolicyParams>;

export const SeedPaymentParams = Data.Tuple([
  Data.Bytes({ minLength: 28, maxLength: 28 }),
]);
export type SeedPaymentParams = Data.Static<typeof SeedPaymentParams>;

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

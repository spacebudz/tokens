use aiken/dict.{Dict}

pub type Metadata =
  Dict<ByteArray, Data>

pub type DatumMetadata {
  metadata: Metadata,
  version: Int,
  extra: Data,
}

use aiken/dict.{Dict}
use aiken/transaction.{OutputReference}
use aiken/transaction/credential.{Address}
use merkle.{MerkleProof, MerkleRoot}

pub type Metadata =
  Dict<ByteArray, Data>

pub type DatumMetadata {
  metadata: Metadata,
  version: Int,
  extra: Data,
}

pub type Payment {
  address: Address,
  amount: Int,
}

pub type Payments =
  List<Payment>

pub type ThreadDatum {
  base: Int,
  counter: Int,
  max_id: Int,
  merkle_root: MerkleRoot,
  seed: Option<Int>,
}

pub type ThreadAction {
  Progress(OutputReference, MerkleProof)
  Destroy
}

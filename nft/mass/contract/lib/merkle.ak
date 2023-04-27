use aiken/hash.{Hash, Sha2_256}
use utils

pub type ProofItem {
  Left(ByteArray)
  Right(ByteArray)
}

pub type MerkleProof =
  List<ProofItem>

pub type MerkleRoot =
  ByteArray

pub fn is_valid(entry: ByteArray, root: MerkleRoot, proof: MerkleProof) -> Bool {
  let hash =
    hash.sha2_256(entry)
  do_is_valid(hash, proof) == root
}

fn do_is_valid(hash: Hash<Sha2_256, a>, proof: MerkleProof) -> Hash<Sha2_256, a> {
  when proof is {
    [] ->
      hash
    [Left(l), ..tail] ->
      do_is_valid(utils.combine_hash(l, hash), tail)
    [Right(r), ..tail] ->
      do_is_valid(utils.combine_hash(hash, r), tail)
  }
}

test is_valid1() {
  let entry =
    #"00"
  let root =
    #"705b97f57e40f8c5e0f699932a4791b0c794cc0056af16cc0edb5142cf1eccfa"
  let proof =
    [
      Right(#"4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a"),
      Right(#"79ebc2b9806bb51e5d69e3f6c8bdb9903035c0128a5cb570d6662a37e8797091"),
    ]
  is_valid(entry, root, proof)
}

use aiken/bytearray
use aiken/cbor
use aiken/hash.{Hash, Sha2_256}
use aiken/int
use aiken/list
use aiken/transaction.{OutputReference}

pub fn from_hexadecimal(self: ByteArray) -> Int {
  bytearray.foldl(self, fn(byte, acc) { acc * 256 + byte }, 0)
}

test from_hexadecimal1() {
  from_hexadecimal(#"aaaaaaaa") == 2863311530
}

test from_hexadecimal2() {
  from_hexadecimal(#"ff") == 255
}

test from_hexadecimal3() {
  from_hexadecimal(#"af56bc") == 11491004
}

test from_hexadecimal4() {
  from_hexadecimal(#"aabbccddeeff") == 187723572702975
}

test from_hexadecimal5() {
  from_hexadecimal(#"00") == 0
}

pub fn to_utf8(n: Int) -> ByteArray {
  let from_digit =
    fn(d) { bytearray.push(#[], d + 48) }

  if n / 10 == 0 {
    from_digit(n)
  } else if n < 0 {
    bytearray.push(to_utf8(n * -1), 45)
  } else {
    bytearray.concat(to_utf8(n / 10), from_digit(n % 10))
  }
}

test to_utf8_1() {
  to_utf8(109) == #"313039"
}

test to_utf8_2() {
  to_utf8(-1) == #"2d31"
}

test to_utf8_3() {
  to_utf8(0) == #"30"
}

pub fn hash_output_reference(
  output_reference: OutputReference,
) -> Hash<Sha2_256, a> {
  output_reference
    |> cbor.serialise
    |> hash.sha2_256
}

/// Takes the first 6 bytes and converts them into an integer
pub fn hash_to_int(hash: Hash<Sha2_256, a>) -> Int {
  hash
    |> bytearray.take(6)
    |> from_hexadecimal
}

/// As long as x stays between [0, range) this function is a bijection
/// seed allows to change the sequence order
pub fn random_in_sequence(x: Int, seed: Int, range: Int) -> Int {
  ( 23 * x + seed ) % range
}

test random_in_sequence1() {
  let l =
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  l
    |> list.map(fn(x) { random_in_sequence(x, 489320, list.length(l)) })
    |> list.sort(int.compare)
    |> fn(l2) { l == l2 }
}

test random_in_sequence2() {
  let l =
    [0, 1, 2, 3, 4]
  l
    |> list.map(fn(x) { random_in_sequence(x, 0, list.length(l)) })
    |> list.sort(int.compare)
    |> fn(l2) { l == l2 }
}

pub fn combine_hash(
  hash1: Hash<Sha2_256, a>,
  hash2: Hash<Sha2_256, a>,
) -> Hash<Sha2_256, a> {
  hash.sha2_256(bytearray.concat(hash1, hash2))
}

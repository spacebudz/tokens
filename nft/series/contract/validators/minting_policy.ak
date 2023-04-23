use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/transaction.{DatumHash,
  InlineDatum, Input, Mint, ScriptContext, Spend}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{AssetName, PolicyId}
use constants
use types.{DatumMetadata}

type Action {
  Minting
  Burning
}

type SpecificToken {
  policy_id: PolicyId,
  asset_name: AssetName,
}

fn get_self_input(ctx: ScriptContext, thread_token: SpecificToken) -> Input {
  expect Spend(output_reference) =
    ctx.purpose
  expect Some(input) =
    list.find(
      ctx.transaction.inputs,
      fn(input) { input.output_reference == output_reference },
    )

  let has_thread_token =
    value.quantity_of(
      input.output.value,
      thread_token.policy_id,
      thread_token.asset_name,
    ) >= 1

  if has_thread_token {
    input
  } else {
    error
  }
}

fn int_to_bytearray(n: Int) -> ByteArray {
  when n is {
    0 ->
      #"30"
    1 ->
      #"31"
    2 ->
      #"32"
    3 ->
      #"33"
    4 ->
      #"34"
    5 ->
      #"35"
    6 ->
      #"36"
    7 ->
      #"37"
    8 ->
      #"38"
    9 ->
      #"39"
    n ->
      bytearray.concat(int_to_bytearray(n / 10), int_to_bytearray(n % 10))
  }
}

validator(
  max_supply: Option<Int>,
  asset_name: AssetName,
  ownership_token: SpecificToken,
  thread_token: SpecificToken,
  control_address: Address,
) {
  fn mint(action: Action, ctx: ScriptContext) -> Bool {
    expect Mint(self_policy_id) =
      ctx.purpose

    when action is {
      Minting -> {
        expect Some(_) =
          list.find(
            ctx.transaction.inputs,
            fn(input) {
              when input.output.address.payment_credential is {
                ScriptCredential(script_hash) ->
                  script_hash == self_policy_id
                _ ->
                  False
              } && value.quantity_of(
                input.output.value,
                thread_token.policy_id,
                thread_token.asset_name,
              ) >= 1
            },
          )
        True
      }
      Burning ->
        list.all(
          value.flatten(ctx.transaction.mint),
          fn(asset) {
            let (policy_id, _, quantity) =
              asset
            if self_policy_id == policy_id {
              quantity < 0
            } else {
              True
            }
          },
        )
    }
  }

  fn spend(id: Int, _redeemer: Void, ctx: ScriptContext) -> Bool {
    let self_input =
      get_self_input(ctx, thread_token)

    let outputs =
      ctx.transaction.outputs

    expect Some(_) =
      list.find(
        ctx.transaction.inputs,
        fn(input) {
          value.quantity_of(
            input.output.value,
            ownership_token.policy_id,
            ownership_token.asset_name,
          ) >= 1
        },
      )

    expect ScriptCredential(self_hash) =
      self_input.output.address.payment_credential

    expect [
      (ref_policy_id, ref_name, ref_quantity),
      (user_policy_id, user_name, user_quantity),
    ] =
      value.flatten(ctx.transaction.mint)

    let asset_name_with_id =
      bytearray.concat(asset_name, int_to_bytearray(id))

    let ref_name_without_label =
      bytearray.drop(ref_name, constants.label_length)

    let correct_policies =
      user_policy_id == self_hash && ref_policy_id == self_hash

    let correct_prefixes =
      bytearray.take(ref_name, constants.label_length) == constants.label100 && bytearray.take(
        user_name,
        constants.label_length,
      ) == constants.label222

    let identical_names =
      ref_name_without_label == bytearray.drop(
        user_name,
        constants.label_length,
      ) && ref_name_without_label == asset_name_with_id

    let minting_quantities =
      user_quantity == 1 && ref_quantity == 1

    let valid_supply =
      when max_supply is {
        Some(s) ->
          id < s
        None ->
          True
      }

    let has_increased_id = {
      expect [output] =
        list.filter(
          outputs,
          fn(output) {
            output.address == Address {
              payment_credential: ScriptCredential(self_hash),
              stake_credential: None,
            }
          },
        )
      expect increased_id: Int = {
        expect InlineDatum(increased_id) =
          output.datum
        increased_id
      }
      increased_id == id + 1 && value.without_lovelace(output.value) == value.from_asset(
        thread_token.policy_id,
        thread_token.asset_name,
        1,
      )
    }

    let has_correct_metadata = {
      expect [output] =
        list.filter(outputs, fn(output) { output.address == control_address })
      expect _: DatumMetadata = {
        expect DatumHash(h) =
          output.datum
        expect Some(metadata_schema) =
          dict.get(ctx.transaction.datums, h)
        metadata_schema
      }
      value.without_lovelace(output.value) == value.from_asset(
        ref_policy_id,
        ref_name,
        1,
      )
    }

    correct_policies && correct_prefixes && identical_names && minting_quantities && valid_supply && has_increased_id && has_correct_metadata
  }
}

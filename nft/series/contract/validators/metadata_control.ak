use aiken/bytearray
use aiken/list
use aiken/transaction.{Input, ScriptContext, Spend}
use aiken/transaction/value
use constants
use types.{DatumMetadata}

fn get_self_input(ctx: ScriptContext) -> Input {
  expect Spend(output_reference) =
    ctx.purpose
  expect Some(input) =
    list.find(
      ctx.transaction.inputs,
      fn(input) { input.output_reference == output_reference },
    )
  input
}

validator {
  fn spend(_datum: DatumMetadata, _redeemer: Void, ctx: ScriptContext) -> Bool {
    let self_input =
      get_self_input(ctx)

    expect [
      (ref_policy_id, ref_name, ref_quantity),
      (user_policy_id, user_name, user_quantity),
    ] =
      value.flatten(ctx.transaction.mint)

    expect [(self_policy_id, self_name, _)] =
      value.flatten(value.without_lovelace(self_input.output.value))

    let correct_policies =
      user_policy_id == self_policy_id && ref_policy_id == self_policy_id
    let correct_prefixes =
      bytearray.take(ref_name, constants.label_length) == constants.label100 && bytearray.take(
        user_name,
        constants.label_length,
      ) == constants.label222
    let identical_names =
      bytearray.drop(ref_name, constants.label_length) == bytearray.drop(
        user_name,
        constants.label_length,
      ) && ref_name == self_name
    let burning_quantities =
      user_quantity == -1 && ref_quantity == -1

    correct_policies && correct_prefixes && identical_names && burning_quantities
  }
}

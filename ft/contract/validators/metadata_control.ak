use aiken/dict.{Dict}
use aiken/list
use aiken/transaction.{ScriptContext}
use aiken/transaction/value.{AssetName, PolicyId}

type ControlToken {
  policy_id: PolicyId,
  asset_name: AssetName,
}

type Metadata =
  Dict<ByteArray, Data>

type DatumMetadata {
  metadata: Metadata,
  version: Int,
  extra: Data,
}

validator(control_token: ControlToken) {
  fn spend(_datum: DatumMetadata, _redeemer: Void, ctx: ScriptContext) -> Bool {
    when
      list.find(
        ctx.transaction.inputs,
        fn(input) {
          value.quantity_of(
            input.output.value,
            control_token.policy_id,
            control_token.asset_name,
          ) >= 1
        },
      )
    is {
      Some(_) ->
        True
      None ->
        False
    }
  }
}

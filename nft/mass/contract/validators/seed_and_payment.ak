use aiken/transaction.{ScriptContext}
use aiken/transaction/value.{PolicyId}
use constants
use types.{Payments}

validator(thread_policy_id: PolicyId) {
  fn spend(_datum: Payments, _redeemer: Void, ctx: ScriptContext) -> Bool {
    value.zero()
      |> value.add(value.from_asset(thread_policy_id, constants.payment_name, -1))
      |> value.add(value.from_asset(thread_policy_id, constants.owner_name, -1))
      |> fn(minted) { value.without_lovelace(ctx.transaction.mint) == minted }
  }
}

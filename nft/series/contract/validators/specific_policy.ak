use aiken/list
use aiken/transaction.{Mint, OutputReference, ScriptContext}
use aiken/transaction/value

type Action {
  Minting
  Burning
}

validator(output_reference: OutputReference) {
  fn mint(action: Action, ctx: ScriptContext) -> Bool {
    expect Mint(policy_id) =
      ctx.purpose

    when action is {
      Minting -> {
        expect Some(_) =
          list.find(
            ctx.transaction.inputs,
            fn(input) { input.output_reference == output_reference },
          )
        True
      }
      Burning ->
        list.all(
          value.flatten(ctx.transaction.mint),
          fn(asset) {
            let (policy_id1, _, quantity) =
              asset
            if policy_id == policy_id1 {
              quantity < 0
            } else {
              True
            }
          },
        )
    }
  }
}

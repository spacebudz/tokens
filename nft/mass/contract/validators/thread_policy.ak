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
      Minting ->
        list.any(
          ctx.transaction.inputs,
          fn(input) { input.output_reference == output_reference },
        )
      Burning ->
        ctx.transaction.mint
          |> value.flatten
          |> list.all(
               fn(asset) {
                 if policy_id == asset.1st {
                   asset.3rd < 0
                 } else {
                   True
                 }
               },
             )
    }
  }
}

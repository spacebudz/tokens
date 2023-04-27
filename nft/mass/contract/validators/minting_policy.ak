use aiken/bytearray
use aiken/dict
use aiken/list
use aiken/transaction.{DatumHash,
  InlineDatum, Input, Mint, ScriptContext, Spend}
use aiken/transaction/credential.{Address, ScriptCredential}
use aiken/transaction/value.{PolicyId}
use constants
use merkle
use types.{Destroy, Payments, Progress, ThreadAction, ThreadDatum}
use utils

type Action {
  Minting
  MintingExtra
  Burning
}

fn get_self_input(ctx: ScriptContext, thread_policy_id: PolicyId) -> Input {
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
      thread_policy_id,
      constants.thread_name,
    ) >= 1

  if has_thread_token {
    input
  } else {
    error
  }
}

validator(
  thread_policy_id: PolicyId,
  control_address: Address,
  total_lanes: Int,
) {
  fn mint(action: Action, ctx: ScriptContext) -> Bool {
    expect Mint(self_policy_id) =
      ctx.purpose

    when action is {
      Minting ->
        list.any(
          ctx.transaction.inputs,
          fn(input) {
            list.and(
              [
                when input.output.address.payment_credential is {
                  ScriptCredential(script_hash) ->
                    script_hash == self_policy_id
                  _ ->
                    False
                },
                value.quantity_of(
                  input.output.value,
                  thread_policy_id,
                  constants.thread_name,
                ) >= 1,
              ],
            )
          },
        )
      MintingExtra ->
        value.zero()
          |> value.add(value.from_asset(self_policy_id, constants.royalty_name, 1))
          |> value.add(value.from_asset(self_policy_id, constants.ip_name, 1))
          |> value.add(
               value.from_asset(thread_policy_id, constants.mint_extra_name, -1),
             )
          |> fn(minted) { value.without_lovelace(ctx.transaction.mint) == minted }
      Burning ->
        ctx.transaction.mint
          |> value.flatten
          |> list.all(
               fn(asset) {
                 if self_policy_id == asset.1st {
                   asset.3rd < 0
                 } else {
                   True
                 }
               },
             )
    }
  }

  fn spend(datum: ThreadDatum, action: ThreadAction, ctx: ScriptContext) -> Bool {
    let inputs =
      ctx.transaction.inputs
    let outputs =
      ctx.transaction.outputs
    let mint =
      ctx.transaction.mint

    when action is {
      Progress(user_output_reference, merkle_proof) -> {
        let self_input =
          get_self_input(ctx, thread_policy_id)

        expect Some(_) =
          list.find(
            inputs,
            fn(input) { input.output_reference == user_output_reference },
          )

        expect Some(payment_input) =
          list.find(
            ctx.transaction.reference_inputs,
            fn(input) {
              value.quantity_of(
                input.output.value,
                thread_policy_id,
                constants.payment_name,
              ) >= 1
            },
          )

        expect payments: Payments = {
          expect InlineDatum(d) =
            payment_input.output.datum
          d
        }

        expect ScriptCredential(self_hash) =
          self_input.output.address.payment_credential

        expect [
          (ref_policy_id, ref_name, ref_quantity),
          (user_policy_id, user_name, user_quantity),
        ] =
          value.flatten(mint)

        let seed =
          when datum.seed is {
            Some(s) ->
              s
            None ->
              user_output_reference
                |> utils.hash_output_reference
                |> utils.combine_hash(
                     utils.hash_output_reference(payment_input.output_reference),
                   )
                |> utils.hash_to_int
          }

        let valid_lane =
          user_output_reference
            |> utils.hash_output_reference
            |> utils.combine_hash(
                 utils.hash_output_reference(payment_input.output_reference),
               )
            |> utils.hash_to_int
            |> fn(n) { n % total_lanes == datum.base / total_lanes }

        let valid_policies =
          user_policy_id == self_hash && ref_policy_id == self_hash

        let valid_quantities =
          user_quantity == 1 && ref_quantity == 1

        let valid_id =
          datum.base + datum.counter < datum.max_id

        let valid_payment =
          list.all(
            payments,
            fn(payment) {
              list.any(
                outputs,
                fn(output) {
                  output.address == payment.address && output.value == value.from_lovelace(
                    payment.amount,
                  )
                },
              )
            },
          )

        let valid_thread = {
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
          expect new_datum: ThreadDatum = {
            expect InlineDatum(thread_datum) =
              output.datum
            thread_datum
          }

          list.and(
            [
              new_datum.seed == Some(seed),
              new_datum.counter == datum.counter + 1,
              new_datum.base == datum.base,
              new_datum.max_id == datum.max_id,
              new_datum.merkle_root == datum.merkle_root,
              value.without_lovelace(output.value) == value.from_asset(
                thread_policy_id,
                constants.thread_name,
                1,
              ),
            ],
          )
        }

        let valid_metadata = {
          expect [output] =
            list.filter(
              outputs,
              fn(output) { output.address == control_address },
            )
          let random_id =
            utils.random_in_sequence(
              datum.counter,
              seed,
              datum.max_id - datum.base,
            ) + datum.base

          expect DatumHash(metadata_hash) =
            output.datum
          expect Some(_) =
            dict.get(ctx.transaction.datums, metadata_hash)

          let merkle_entry =
            metadata_hash
              |> bytearray.concat(ref_name)
              |> bytearray.concat(user_name)
              |> bytearray.concat(utils.to_utf8(random_id))

          value.without_lovelace(output.value) == value.from_asset(
            ref_policy_id,
            ref_name,
            ref_quantity,
          ) && merkle.is_valid(merkle_entry, datum.merkle_root, merkle_proof)
        }

        list.and(
          [
            valid_policies,
            valid_quantities,
            valid_id,
            valid_lane,
            valid_payment,
            valid_thread,
            valid_metadata,
          ],
        )
      }
      Destroy ->
        list.and(
          [
            value.quantity_of(mint, thread_policy_id, constants.thread_name) < 0,
            list.any(
              inputs,
              fn(input) {
                value.quantity_of(
                  input.output.value,
                  thread_policy_id,
                  constants.owner_name,
                ) >= 1
              },
            ),
            list.all(
              outputs,
              fn(output) {
                value.quantity_of(
                  output.value,
                  thread_policy_id,
                  constants.thread_name,
                ) == 0
              },
            ),
            datum.base + datum.counter == datum.max_id,
          ],
        )
    }
  }
}

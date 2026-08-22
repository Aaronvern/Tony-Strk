# PaywallAnonymizer

> ⚠️ **Reviewed in-repo against the pool source, not externally audited.**
> An anonymizer contract is the application team's code to own. Route it
> through an audit before it holds anyone else's money.

A STRK20 anonymizer (helper) contract that lets an agent satisfy a paywall
without identifying itself.

```
withdraw from pool  ->  pay the merchant  ->  change to an open note
```

All of it atomic. A revert anywhere aborts the pool transaction and no funds
move.

## Why it exists

`pay` in the MCP server does a pool `withdraw`: sender-anonymous, but it just
moves tokens. A paywall needs more than that — the merchant has to be able to
verify a specific resource was paid for, and the buyer needs their change back
without it becoming a public balance tied to them.

So `privacy_invoke` pays the merchant in full, emits a receipt keyed on an
opaque `resource_hash`, and returns the change to an open note. The merchant
can match a payment to an entitlement and grant access. It never learns who
bought it.

It also matters for a second reason: `privacy_invoke` runs **on-chain**, so
this path needs no proving service. The hosted mainnet prover URL is still
unpublished, which is what blocks the SDK route.

## Interface

```cairo
fn privacy_invoke(
    ref self: T,
    merchant: ContractAddress,      // who gets paid
    token: ContractAddress,         // the ERC20 to pay in
    price: u128,                    // what the merchant receives, exactly
    resource_hash: felt252,         // opaque id of what was bought
    change_note_id: Option<felt252>,// open note for the change, or None
) -> Span<OpenNoteDeposit>;
```

There is deliberately **no `funding` parameter**. How much the pool withdrew is
read from the token balance. A declared amount is a liability in a contract
anyone can call: declare it high and the helper approves the pool for tokens it
does not hold, declare it low and the remainder is abandoned here for the next
caller to sweep.

### The two modes

The pool counts open notes: `EmitOpenNoteCreated` increments a counter, each
applied deposit decrements it, and `_apply_actions` asserts it is zero at the
end. So the two halves have to agree, and `change_note_id` is how the caller
says which case this is:

| `change_note_id` | Action list | Requirement | Returns |
| --- | --- | --- | --- |
| `Some(id)` | created an open note | remainder must be non-zero | one `OpenNoteDeposit` |
| `None` | created no open note | payment must be exact | empty span |

Get it wrong and it reverts here with a legible error, rather than downstream
as `UNDEPOSITED_OPEN_NOTES` or silently as stranded funds.

### Calldata

`Option` carries a variant index, so the last argument serializes as
`[0, note_id]` for `Some` and `[1]` for `None`. A dapp sending the open-note
placeholder through the Wallet API writes `["0", "${openNoteIds[0]}"]`.

## Design notes

- **Nothing declared is trusted.** Funding and change are both measured from
  balances.
- **Both sides of the transfer are measured.** `transfer`'s return value is not
  evidence: the merchant's balance must rise by exactly `price` and the
  helper's must fall by exactly `price`. A fee-on-transfer token therefore
  reverts rather than silently leaving the merchant short while the buyer
  believes the resource is paid for. Equivalent to `starkware_utils`'
  `strict_transfer`, with felt252 error codes instead of `ByteArray` panics.
- **That same check is the re-entrancy guard.** A token whose `transfer` calls
  back in and moves more of the helper's balance changes the delta, and the
  delta must be exactly `price`. Both hostile cases have tests.
- **Approve, don't transfer.** The pool pulls the change itself when applying
  deposits.
- **Stateless and permissionless.** Nothing is held across transactions, so
  there is nothing for an uninvited caller to take, and no pool address needs
  pinning. A *stateful* helper would need both.
- **The receipt is public on purpose.** Nothing in it identifies the payer.
- **The merchant may not be the helper or the pool.** Paying the helper makes
  both deltas cancel; paying the pool burns the funds into its balance with no
  note to show for it.

## Build and test

```bash
cd contracts
scarb build      # sierra + casm in target/dev
snforge test     # 17 tests
```

Toolchain: Scarb 2.20, Starknet Foundry 0.63. `privacy` resolves from
[`starkware-libs/starknet-privacy`](https://github.com/starkware-libs/starknet-privacy)
over git, so a clean checkout builds without the vendored SDK.

The suite covers the happy paths, the receipt, every input guard, both
mode-mismatch cases, and two hostile ERC20s (`src/test_contracts/`): one that
skims a fee off every transfer, one that re-enters `privacy_invoke` mid-transfer
to try to spend the funding twice.

## Before this goes near mainnet

- [ ] **Confirm the screening policy for this contract's address.** The pool's
      default `OpenNoteScreeningPolicy` is `Required`, and under it a helper
      that returns deposits makes *its own address* the transaction's screening
      subject — which then needs a screener attestation, and collides with any
      other screening subject in the same transaction
      (`MULTIPLE_SCREENING_SUBJECTS`). Only the pool's **app governor** can set
      a helper to `Exempt` or `Delegated`. The `None` path returns no deposits
      and is not affected.
- [ ] External audit
- [ ] Test against the real pool on Sepolia, not just mocks
- [ ] Confirm calldata ordering matches what the dapp sends via the Wallet API

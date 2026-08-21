# PaywallAnonymizer

> ⚠️ **Draft. Not reviewed, not audited. Do not deploy to mainnet.**
>
> An anonymizer contract is the application team's code to own, review and
> audit. This is a starting point for that review, not a finished artefact.

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
    merchant: ContractAddress,   // who gets paid
    token: ContractAddress,      // the ERC20 to pay in
    funding: u128,               // what the pool withdrew for this call
    price: u128,                 // what the merchant receives, exactly
    resource_hash: felt252,      // opaque id of what was bought
    change_note_id: felt252,     // open note to credit with funding - price
) -> Span<OpenNoteDeposit>;
```

Returns one `OpenNoteDeposit` for the change, or an **empty span** when
`funding == price` — which is valid and means "credit nothing".

## Design notes

- **Both sides of the transfer are measured.** `transfer`'s return value is not
  trusted: the merchant's balance must rise by exactly `price` and the helper's
  must fall by exactly `price`. A fee-on-transfer token therefore reverts
  rather than silently leaving the merchant short while the buyer believes the
  resource is paid for.
- **Approve, don't transfer.** The pool pulls the change itself when applying
  deposits.
- **Stateless and permissionless.** Nothing is held across transactions, so
  there is nothing for an uninvited caller to take, and no pool address needs
  pinning. A *stateful* helper would need both.
- **The receipt is public on purpose.** Nothing in it identifies the payer.

## Build and test

```bash
cd contracts
scarb build      # sierra + casm in target/dev
snforge test     # 6 tests
```

Toolchain: Scarb 2.20, Starknet Foundry 0.63. `privacy` resolves from
[`starkware-libs/starknet-privacy`](https://github.com/starkware-libs/starknet-privacy)
over git, so a clean checkout builds without the vendored SDK.

## Before this goes near mainnet

- [ ] Team review
- [ ] Run the `cairo-security` skill over it
- [ ] External audit
- [ ] Test against the real pool on Sepolia, not just the mock ERC20
- [ ] Confirm calldata ordering matches what the dapp sends via the Wallet API

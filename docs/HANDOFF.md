# Handoff — 2026-08-24

> Product shape: **local-first**. The MCP server binds `127.0.0.1`, there is no
> hosted deployment, and OHTTP is off until real relay values exist. That was
> settled by #17 and supersedes the remote-MCP plan in `docs/PLAN.md`.

Where Tony Strk actually stands, what is proven versus claimed, and what to do
next. Deadline **2026-08-31 23:59 UTC**, so seven days.

## The scoreboard

`strk20.json` is the entry. It currently reads:

```json
{ "transactions": [], "contracts": [], "demo_video": "", "demo_url": "https://tony-strk.vercel.app" }
```

To be scored at all the hub needs **three mainnet transactions that touched the
STRK20 pool**, a **3-minute demo video**, and a **live demo**. Sepolia does not
count. Of 99 projects only 11 had mainnet and 4 had a video, so clearing both
puts the project in a small group.

## What is proven

Proven means verified on-chain or by a passing test, not asserted.

- **`browse` through real Tor.** `IsTor:true`, different exit IPs across runs. A
  402 surfaces as `paymentRequired` in `structuredContent` — the seam the
  payment half is supposed to plug into.
- **The anonymizer contract.** Deployed on Sepolia at
  `0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d`
  (class `0x39cd30ef…`). A real payment settled in
  [`0x94c9a566…82cf5`](https://sepolia.voyager.online/tx/0x94c9a56632651bff50ae2e5096394de0c96e1f405900d1c82e1a27e5882cf5):
  pool withdrew 0.1 STRK to the helper, merchant received exactly 0.05,
  `PaywallPaid` emitted on the resource hash, 0.05 change pulled into an open
  note, helper left holding nothing. 17 snforge tests, including two hostile
  ERC20s (fee-on-transfer, re-entrant).
- **Tests.** web 4, server 44, Cairo 17 — 65 in total, green on Linux.
- **SSRF hardening on `browse`** (#17): private, loopback, cloud-metadata and
  credential-bearing URLs rejected, redirect targets checked, response size and
  time capped, IPv6 translation prefixes handled.

## What is not

- **`pay` has never moved money.** Every test uses a fake wallet.
- **The two halves do not connect.** No merchant, no 402 handshake, no payment
  page. `browse` finds a paywall; nothing pays it.
- **Nothing is deployed, by design now.** #17 removed `railway.json` and made
  the server local-only. `demo_url` still points at the Vercel landing page,
  which now reads "LOCAL MAP · NO FETCH · NO WALLET · NO PAYMENT" and states it
  does not send the request, use a wallet, or process a payment.

  **This is a scoring tension worth a decision.** The page is maximally honest,
  and honesty has been the right instinct on this project. But the hub weights
  "working mainnet" at 30% and requires a live demo, and a public page that
  disclaims everything gives a judge nothing to see. The mainnet transactions
  below do not fix that on their own — something has to *show* them.

## The finding that shapes the plan

**The anonymizer cannot be exercised on mainnet today.** Both routes are closed:

1. **SDK route** — the mainnet proving service URL is unpublished. Three issues
   asking for it are open and unanswered (#121, #124, #135). Do not open a
   fourth.
2. **Wallet route** — Ready does not implement the private-DeFi actions.
   Probed on Sepolia against a wallet advertising Wallet API 0.10.3:

   | Action | Result |
   | --- | --- |
   | `deposit`, `withdraw` (self and contract), `transfer` (concrete amount) | accepted |
   | `transfer` with `amount: "OPEN"` | `INVALID_REQUEST_PAYLOAD` |
   | `invoke` | `INVALID_REQUEST_PAYLOAD` |

   A concrete-amount transfer is accepted, so the action type works and it is
   the `"OPEN"` literal that is refused. `invoke` fails alone, with no open note
   present, so it is independently unsupported. Reproduce with
   `web/app/spike/wallet` → "Probe payload shapes".

This is an ecosystem gap, not a defect in the contract. **Mainnet pool
transactions are still reachable**: `deposit`, `transfer` and `withdraw` all
touch the pool and Ready does all three. That is how the rival projects with
verified mainnet hashes got them.

## Next steps, in order of what moves the score

1. **Three mainnet pool transactions via Ready.** Shield, private transfer,
   unshield. Each costs the flat pool fee (2 STRK on Sepolia; read mainnet's
   from `get_fee_amount`, it was 4 STRK when the official skill was written).
   Put the hashes in `strk20.json` and `docs/TRANSACTIONS.md`.
2. **Deploy the anonymizer to mainnet.** A declare + deploy is not a pool
   transaction, but it fills the empty `contracts` array and feeds the hub's
   assessment, which explicitly rewards deployed Cairo. Does not need `invoke`.
3. **The 3-minute video.**
4. **A live demo that does not disclaim itself.**

## Settled since

- **#17 merged** — local MCP, Keychain wallet, SSRF policy, Railway removed.
  Its Keychain tests failed on Linux because the platform check ran at store
  construction, before the injected `exec` the tests supply; the check now sits
  in the real backend, so the store is testable anywhere and a Linux caller that
  actually reaches for the Keychain still gets a clear error.
- **#18 merged** — per-gateway OHTTP relays and pinned key configs. Resolved
  against #17 by keeping OHTTP off by default (`OHTTP_ENABLED === "true"` to opt
  in) while staying configurable.
- `.env.example` had `OHTTP_RELAY_URL` declared twice after the merge; the
  browse-side variables are now `OHTTP_BROWSE_GATEWAY_*` and are **not read by
  any code** yet.

## Still open

- **The demo surface.** See the scoring tension above.
- **`docs/PLAN.md`** still describes the remote architecture and is marked
  superseded rather than rewritten.

## Gotchas that cost real time

- **Note maturity.** Proofs build against `latest - 12`, but a dry run
  simulates against live state. A note younger than 12 blocks makes the dry run
  pass and the submission revert with `NOTE_NOT_FOUND`, raised by `use_note`
  inside the prover's *virtual* block. Wait ~6 minutes after funding.
- **The paymaster refuses to broadcast a reverting transaction**, so failed
  attempts cost nothing and leave no hash on-chain — which also means they
  cannot be traced in an explorer.
- **The SdkWallet path has no surplus sink.** Note selection is naive and takes
  a whole note, so a small withdraw from a large note leaves a surplus the
  builder refuses. The STRK20 action vocabulary has no surplus action; add an
  explicit `transfer` or `withdraw` back to the payer.
- **Review against the deployed class, not upstream `main`.** The
  `OpenNoteScreeningPolicy` caveat in an earlier review does not apply to either
  live pool — `get_open_note_screening_policy` exists on neither the Sepolia
  (`0x56ab118a…`) nor the mainnet (`0x67dddd89…`) deployment.
- **starknet.js pads gas price 1.5× as well as amount**, so a large declare
  fails with "Resources bounds … exceed balance". Trim the price to ~1.15× of
  the live block price. Both bound fields must be `bigint` or the fee hash
  concatenates them.
- **RPC**: drpc's Sepolia endpoint lacks `starknet_specVersion` and
  `getClassHashAt`. Use `https://starknet-sepolia-rpc.publicnode.com`.
- **sncast 0.63** renamed the Ready account type to `--type ready`.
- **The faucet** binds its proof-of-work to the address as it normalizes it
  (lowercase, padded), and has a 24h per-address cooldown.
- **`npm run typecheck` is a no-op** — there is no `tsconfig.json`.

## Security note

`0x077F1679D6B758f63b33Ac3eba46c33b0218185156efc9041cB4ba1A2162FC87` is
**Aaron's real wallet**, deployed on both Sepolia and mainnet, holding ~49.87
STRK on mainnet. Its key is in `.env` in plaintext. It was described in earlier
notes as a burned testnet key; that was wrong. Never `sncast account import` it
— that writes the key to `~/.starknet_accounts/` outside the repo and outside
`.gitignore`. Deploy with starknet.js, which signs from memory.

The Ready wallet holds a **different** account,
`0x2b33a28cccde91013a8508d4353682291dffe967a147442f0226c9ecc7b401c`, funded with
100 Sepolia STRK and registered in the pool.

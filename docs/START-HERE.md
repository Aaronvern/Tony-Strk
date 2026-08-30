# Start Here

Everything you need to understand Tony Stark and start contributing. ~10 minutes.

---

## 1. What we're building

**A local-only MCP server that lets an AI agent fetch public URLs through Tor and
settle a compatible x402 paywall with shielded STRK20 funds on Sepolia or
Mainnet.**

An agent (Claude, Cursor, whatever) connects to the loopback HTTP endpoint. The
active `browse` tool is a stateless HTTP fetcher, not a disposable browser: it
does not execute JavaScript, accept logins, or preserve cookies. `pay` becomes
usable after the local wallet is ready, and `pay_paywall` also requires a
trusted helper configuration.

The payment tool is available after a local wallet and trusted anonymizer are
configured. The problem: AI agents are starting to spend money for people, and
that leaves a trail two ways — the payment (a card the issuer watches, or a
transparent wallet whose balance and full history are public forever) and the
browsing (an IP that identifies the person). The more autonomous the agent, the
more of your life becomes a public log.

We're building it for StarkWare's **STRK20 Private Sprint** (deadline **Aug 31**). It's their own suggested build #11, *Private AI Agent Payments*.

**Judging:** 30% STRK20 integration depth · 30% working mainnet product · 25% innovation · 15% docs/open-source. So the payment path is where the points are — the browser is the demo vehicle.

---

## 2. How it works

```
   AI agent (MCP client on this machine)
            │  browse · pay_paywall
            ▼
   ┌──────────────────────┐
   │  Tony Stark server   │  127.0.0.1:8787
   └──────────┬───────────┘
             │ validate public HTTP(S) URL
             ▼
       Tor HTTP fetcher ──► Tor ──► website
             │                        (sees Tor egress)
             └── optional wallet path ──► Starknet
```

The current server is one local process. It keeps no browser session or request
log, but it does not claim separate browsing/payment worker isolation. The MCP
transport is Streamable HTTP on loopback.

### The payment, technically

STRK20 is a **shielded pool**. You deposit a normal ERC-20 and it becomes an encrypted *note* — a commitment only you can decrypt with your viewing key. Moving value between notes is a ZK-proved state transition: the chain verifies the maths without learning balances, amounts, or parties.

Four actions we compose:

| Action | What it does | Visibility |
|---|---|---|
| `deposit` | shield — public ERC-20 → encrypted note | **visible event** |
| `transfer` | private send, pool user → pool user | fully private |
| `withdraw` | unshield to an external address | sender-anonymous |
| `invoke` | call another contract from inside the pool | — |

**The key asymmetry:** deposits and withdrawals are visible; everything between them is not. Privacy here is *unlinkability inside a crowd*, not invisibility. "Address A deposited" is public. "User A paid service B" is not.

### Who proves, and who submits — these are different

Generating the ZK proof is expensive. The local path asks StarkWare's hosted
prover and signs with the key held by the local wallet store. A future
non-custodial path could instead ask the user's wallet to prove and sign
(`wallet_strk20PrepareInvoke` → a SNIP-36 proof). Do not describe the current
local path as keyless or non-custodial.

**Then it has to be submitted, and that's a separate problem.** The SDK's `execute()` returns `{callAndProof, registry}` — proved, not submitted. Getting it on-chain means calling `apply_actions` **with the proof attached to the transaction**, and a plain starknet.js `Account` has no way to attach it. Only two things can:

| Path | How |
|---|---|
| **AVNU paymaster** | `apply_action`; or **`invoke_and_apply_action` when a deposit is involved** — the ERC-20 `approve` must run as the *user*, and under `apply_action` the executing account is the paymaster |
| **Explicit public relay fallback** | submits the proven call from the configured public account when AVNU sponsorship is unavailable; that account and payment timing are visible on-chain |
| STRK20-aware wallet | `WalletAccountV6.executeWithProof` |

**The paymaster is the private-submission path, not only a gasless nicety** —
for a server-side agent it keeps the submitting account out of the transaction.
When sponsorship is unavailable, the explicit public-relay fallback can submit
the proof, but its account and payment timing are visible on-chain.

### Two constraints that shape everything

The prover reads **finalized** state, and the sequencer only accepts proofs
whose base block is **12 blocks old**. A new deployment, top-up, or shielded
note must mature before the next proof, so a shielded transfer per page-view is
not an immediate operation.

The planned product shape is therefore: prepaid shielded balance → usage metered **off-chain** → settlement in **batches**. That metering and batching layer is not implemented in the active server.

The AVNU path uses `sponsored_private` mode, where the fee is paid *from inside
the pool*. The verified Mainnet runs used the explicit public-relay fallback
because AVNU had no remaining sponsorship credits; those runs therefore expose
the submitting account and payment timing.

---

## 3. The privacy model

A user can be identified through **five independent channels**. You're only as private as the leakiest one — which is why on-chain privacy alone isn't a product.

| # | Channel | Closed by |
|---|---|---|
| 1 | Network (IP) | Tor egress for every browse request; no direct fallback ✅ *verified* |
| 2 | Fetch state (cookies, persistence) | Stateless HTTP fetch; no browser, cookie jar, or login support |
| 3 | On-chain (balance, graph) | STRK20 shielded notes, ZK-proved |
| 4 | The on-ramp (funding) | shared pool's anonymity set, time-separated |
| 5 | The operator | Local-only, self-hosted process; no OHTTP relay/gateway is configured |

**What the active server claims:** a destination sees a Tor exit rather than the host IP, and the app does not persist browsing state. It does not promise a fresh Tor circuit per request, browser-fingerprint uniformity, operator blinding, or anonymous logged-in browsing.

**What we don't claim:** that deposits are invisible, that a payee can't see an amount, or that logged-in browsing is anonymous. Overclaiming is how a privacy project gets taken apart in Q&A — please keep this discipline in anything you write.

Current guarantees and residual risks: [`PRIVACY-STACK.md`](PRIVACY-STACK.md). Current architecture: [`local-mcp-hardening-design.md`](superpowers/specs/2026-08-21-local-mcp-hardening-design.md). The older [`THREAT-MODEL.md`](THREAT-MODEL.md) is archived with the superseded remote-browser proposal.

### Not a mixer

Every deposit is screened against sanctions lists before a proof is issued — mandatory, not bypassable even by self-hosting. The pool has a governance-set auditor key, and the user holds a viewing key to disclose their own history voluntarily. **Private by default, compliant by design.**

---

## 4. Where we are

| Item | State |
|---|---|
| Toolchain (Node 24, `starknet@10.7.0`) | ✅ verified |
| Headless STRK20 wallet API | ✅ proven — all 4 methods, no browser |
| Hosted prover + discovery | ✅ live and synced; an OHTTP key is advertised, but OHTTP is not configured locally |
| Privacy pool contracts | ✅ verified on-chain, both networks |
| Anonymous browsing | ✅ local MCP → Tor returns `IsTor:true` |
| Sepolia account | ✅ funded + deployed |
| Real ZK proof from the hosted prover | ✅ proving works |
| Submission via AVNU paymaster | ✅ works |
| **Shielded deposit on-chain** | ✅ **3 STRK shielded** |
| **Sanctions screening** | ✅ **passed** |
| Local wallet lifecycle | ✅ create → fund → deploy → paymaster → shield → mature |
| x402 v2 merchant + payer | ✅ deterministic flow through `pay_paywall` |
| Joined MCP-to-merchant test | ✅ HTTP 402 → settlement → protected content |
| Live x402 verifier | ✅ preflight; `--live` is opt-in and spends STRK on the configured network |
| Mainnet paywall settlement | ✅ three live MCP x402 runs on 2026-08-30 through STRK20 + `PaywallAnonymizer`; public-relay fallback made the submitting account and timing visible ([transaction record](TRANSACTIONS.md)) |

**The Sepolia shield path works end to end** — SDK → hosted prover → ZK proof → paymaster → pool → Starknet:

```
tx 0x3e74d521285a305781153653c71f785f386acb10b409dcb60e2178a32489349
```

Screening was the one link nobody could test from outside — it runs *inside* the prover during a deposit — and it passed. Every hard unknown in the design is now closed; what remains is ordinary engineering.

Reassuring side note: the pool holds **~212,000 STRK** across its users. That's the anonymity set we hide in — a real crowd, not a ghost town.

**Known risks:** anonymity-set size still bounds how strong our privacy claim can be; the Sepolia fee quote (below) is not a Mainnet cost, and the Mainnet public-relay fallback exposes submitting account and timing; the demo video and a permanent merchant deployment remain unfinished.

---

## 5. Get running (5 minutes)

```bash
git clone git@github.com:Aaronvern/Tony-Strk.git && cd Tony-Strk
nvm use          # Node 24 — required by the privacy SDK
npm install
npm run setup    # clones + builds the privacy SDK (it isn't published to npm)

npm run spike:services   # verifies every external dependency is live
npm run spike:wallet     # drives the STRK20 wallet API headlessly
```

`spike:services` checks the prover, discovery, advertised OHTTP keys, both pool contracts on-chain, and that the discovery service actually serves our pool. Seeing an OHTTP key verifies service capability; it does not configure a relay/gateway or establish operator blinding for this app.

For browsing and the verified Mainnet payment path:

```bash
sudo apt install tor    # SOCKS5 on 127.0.0.1:9050
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server
# in another terminal
npm run verify:mcp
# → {"IsTor":true,"IP":"<a Tor exit>"}
```

No `.env` is needed for browsing. If a gitignored root `.env` exists, Node
loads it; otherwise safe defaults apply. On macOS, keep wallet and AVNU
credentials in Keychain. Configure a trusted
`PAYWALL_ANONYMIZER_ADDRESS` before starting the MCP payment path. The live
Mainnet path uses `NETWORK=mainnet` and, when AVNU sponsorship is unavailable,
the explicit `PUBLIC_PRIVACY_RELAY=true` fallback with real STRK; its public
submitting account and payment timing are visible on-chain.

---

## 6. Gotchas that will cost you a day

1. **`starknet@10.7.0` exactly.** npm's `latest` resolves to 10.0.2, which predates the STRK20 API entirely.
2. **The deployed pool class hashes differ from the SDK README.** The live pools run a newer revision than the docs claim — pin to the deployment, not the table.
3. **Node 24 or nothing** — the privacy SDK requires Node 24.
4. **Starknet accounts must be deployed** before they can sign; an address exists counterfactually and fails confusingly until then.
5. **The privacy SDK isn't on npm** — install from GitHub Packages or a git SHA.
6. **A first shield must cover the fee.** The AVNU path settles its fee from
   the pool; the public-relay path needs public gas as well. Shield enough
   public STRK for the desired private balance and current pool fee, and read
   the fee from the external stack.
7. **Prove against `latest - 12`, never `latest`.** The sequencer rejects a proof whose base block is too recent (`The proof block number … is too recent`). This 12-block maturity rule is a hard failure, not a warning.
8. **Pool fees are network and service values**, not UI constants. Do not model
   per-payment economics on a Sepolia quote.
9. **The viewing key must be ≤ `CURVE.n / 2`** — half the curve order. A raw Poseidon digest overflows it about half the time → `PRIVATE_KEY_NOT_CANONICAL`. (The client package derives it from a passphrase, so this only bites on the raw-SDK path.)
10. **Errors surface from the prover, not the chain.** A failed action reverts inside the prover's *virtual* block, so the tx hash in the error doesn't exist on Starknet — don't look it up on an explorer. Decode the felt in the revert reason instead.
11. **Never claim more privacy than we've verified.** If it's not in the "verified" table above, it's not a claim.

---

## 7. Roadmap and rehearsals

Ordered by what the score rewards. See [`BUILD-STEPS.md`](BUILD-STEPS.md) for the full task list with owners.

The payment layer is a **real dependency you can build against** rather than a
stub — `wallet_shield` and `pay_paywall` use the same configured `SdkWallet`,
and three live Mainnet MCP x402 runs completed through the STRK20 pool and
`PaywallAnonymizer` on 2026-08-30. Those runs used the explicit public-relay
fallback because AVNU sponsorship had no remaining credits; see
[`TRANSACTIONS.md`](TRANSACTIONS.md) for hashes and receipt blocks. The items
below are labelled so roadmap work is not confused with active capabilities.

- **Roadmap — MCP follow-up** — add `balance` / `topup` only when their wallet behavior is specified; metering and worker isolation are not implemented.
- **Rehearsal — live paywall** — start the merchant behind a temporary public
  HTTPS tunnel, run `verify:x402` for preflight, then use `--live` only with
  mature notes and the intended network. Mainnet public-relay runs reveal the
  submitting account and payment timing.
- **Roadmap — browsing follow-up** — keep the current Tor HTTP fetcher hardened; add a browser worker only if JavaScript-rendered pages become a demonstrated requirement.
- **Roadmap — viewing-key `reveal`** — decrypt and display the user's own spend history. Cheap to build, big narrative payoff.

**Coordinate before starting** so we don't collide — the money path is currently in progress.

---

## 8. The rest of the docs

| Doc | What's in it |
|---|---|
| [`local-mcp-hardening-design.md`](superpowers/specs/2026-08-21-local-mcp-hardening-design.md) | current local architecture and security boundaries |
| [`PRIVACY-STACK.md`](PRIVACY-STACK.md) | current guarantees, planned layers, and residual leaks |
| [`PLAN.md`](PLAN.md) | archived remote MCP architecture proposal — superseded |
| [`THREAT-MODEL.md`](THREAT-MODEL.md) | archived threat model for the superseded proposal |
| [`SPIKE-RESULTS.md`](SPIKE-RESULTS.md) | what we verified first-hand, with evidence |
| [`BUILD-STEPS.md`](BUILD-STEPS.md) | step-by-step task list |
| [`READING-LIST.md`](READING-LIST.md) | annotated background reading |

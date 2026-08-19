# Start Here

Everything you need to understand Tony Stark and start contributing. ~10 minutes.

---

## 1. What we're building

**A remote MCP server that gives any AI agent two abilities: browse the web without revealing who the user is, and pay for things without the payment being traceable to them.**

It isn't an app — it's infrastructure. An agent (Claude, Cursor, whatever) connects over MCP and gains a disposable browser and a private wallet.

The problem: AI agents are starting to spend money for people, and that leaves a trail two ways — the payment (a card the issuer watches, or a transparent wallet whose balance and full history are public forever) and the browsing (an IP that identifies the person). The more autonomous the agent, the more of your life becomes a public log.

We're building it for StarkWare's **STRK20 Private Sprint** (deadline **Aug 31**). It's their own suggested build #11, *Private AI Agent Payments*.

**Judging:** 30% STRK20 integration depth · 30% working mainnet product · 25% innovation · 15% docs/open-source. So the payment path is where the points are — the browser is the demo vehicle.

---

## 2. How it works

```
   AI agent (MCP client)
            │  browse · extract · balance · topup · pay · reveal
            ▼
   ┌──────────────────────┐
   │  Tony Stark server   │
   └──────────┬───────────┘
        ┌─────┴──────┐   ← trust boundary: these two share NO identifier
        ▼            ▼
  Browser worker   Payment worker
  Obscura + Tor    STRK20 shielded pool
        │            │
        ▼            ▼
   the website    Starknet
  (sees a Tor    (sees encrypted
   exit, not you)  notes, not a graph)
```

**The split is the whole design.** The half that browses and the half that pays share no identifier, so no single component — including one we run — ever holds both halves of the link.

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

Generating the ZK proof is expensive and we don't do it. Either the user's wallet proves (`wallet_strk20PrepareInvoke` → a SNIP-36 proof) or we ask StarkWare's hosted prover. Either way we assemble intents and never hold keys — that's what keeps us non-custodial.

**Then it has to be submitted, and that's a separate problem.** The SDK's `execute()` returns `{callAndProof, registry}` — proved, not submitted. Getting it on-chain means calling `apply_actions` **with the proof attached to the transaction**, and a plain starknet.js `Account` has no way to attach it. Only two things can:

| Path | How |
|---|---|
| **AVNU paymaster** | `apply_action`; or **`invoke_and_apply_action` when a deposit is involved** — the ERC-20 `approve` must run as the *user*, and under `apply_action` the executing account is the paymaster |
| STRK20-aware wallet | `WalletAccountV6.executeWithProof` |

**So the paymaster is load-bearing, not a gasless nicety** — for a server-side agent it's how you transact at all. It still gives us fee privacy; that's now a bonus rather than the reason we chose it.

### Two constraints that shape everything

The prover reads **finalized** state, and the sequencer only accepts proofs whose base block is **≥10 blocks old**. So a shielded transfer per page-view is physically impossible.

Hence: prepaid shielded balance → usage metered **off-chain** → settlement in **batches**. Not a workaround — the enforced delay also breaks timing correlation for free.

Fees go through AVNU's paymaster in `sponsored_private` mode, where the fee is paid *from inside the pool*, so paying gas doesn't produce a transparent transaction pointing back at the payer.

---

## 3. The privacy model

A user can be identified through **five independent channels**. You're only as private as the leakiest one — which is why on-chain privacy alone isn't a product.

| # | Channel | Closed by |
|---|---|---|
| 1 | Network (IP, TLS) | Tor egress, fresh circuit per task ✅ *verified* |
| 2 | Browser (cookies, persistence) | Obscura `--stealth`, fresh context per task, no logins |
| 3 | On-chain (balance, graph) | STRK20 shielded notes, ZK-proved |
| 4 | The on-ramp (funding) | shared pool's anonymity set, time-separated |
| 5 | The operators (**including us**) | OHTTP, client-side keys, worker isolation, self-hostable |

**What we claim:** no single party — website, chain, payee, service operator, or us — can attribute the activity to the user.

**What we don't claim:** that deposits are invisible, that a payee can't see an amount, or that logged-in browsing is anonymous. Overclaiming is how a privacy project gets taken apart in Q&A — please keep this discipline in anything you write.

Full detail: [`PRIVACY-STACK.md`](PRIVACY-STACK.md). Adversaries and the hard questions: [`THREAT-MODEL.md`](THREAT-MODEL.md).

### Not a mixer

Every deposit is screened against sanctions lists before a proof is issued — mandatory, not bypassable even by self-hosting. The pool has a governance-set auditor key, and the user holds a viewing key to disclose their own history voluntarily. **Private by default, compliant by design.**

---

## 4. Where we are

| Item | State |
|---|---|
| Toolchain (Node 24, `starknet@10.7.0`) | ✅ verified |
| Headless STRK20 wallet API | ✅ proven — all 4 methods, no browser |
| Hosted prover + discovery | ✅ live, synced, OHTTP verified official |
| Privacy pool contracts | ✅ verified on-chain, both networks |
| Anonymous browsing | ✅ Obscura → Tor returns `IsTor:true` |
| Sepolia account | ✅ funded + deployed, can sign |
| **Real ZK proof from the hosted prover** | ✅ **proving works** — `apply_actions`, facts present |
| Submitting a proven tx | ⬜ needs the AVNU paymaster ← **next** |
| Shielded deposit (screening) + private transfer | ⬜ blocked on submission |
| MCP server, hero loop, mainnet | ⬜ to build |

Until that shielded transfer lands, treat everything as provisional.

**Known risks:** deposit screening is untestable from outside (it runs inside the prover during a deposit, so it's one step behind submission); anonymity-set size means our privacy is only as strong as the shared pool's participation; ~11 days left, and if we slip, the *browsing* layer gets cut, not the payment path.

---

## 5. Get running (5 minutes)

```bash
git clone git@github.com:Aaronvern/Tony-Strk.git && cd Tony-Strk
nvm use          # Node 24 — required by ohttp-ts
npm install

npm run spike:services   # verifies every external dependency is live
npm run spike:wallet     # drives the STRK20 wallet API headlessly
```

`spike:services` is the one to run first. It checks the prover, discovery, OHTTP keys, both pool contracts on-chain, and that the discovery service actually serves our pool — **including a control** proving it rejects a pool it doesn't index, so a pass means something.

For browsing:

```bash
sudo apt install tor    # SOCKS5 on 127.0.0.1:9050
# download Obscura: github.com/h4ckf0r0day/obscura/releases
obscura --stealth --proxy socks5://127.0.0.1:9050 \
        fetch https://check.torproject.org/api/ip --dump text
# → {"IsTor":true,...}
```

**Secrets:** everything reads from env (`ACCOUNT_PRIVATE_KEY`), never from a committed file. `.env` is gitignored. **Testnet keys only** — the mainnet key stays in the wallet and signs through it.

---

## 6. Gotchas that will cost you a day

1. **`starknet@10.7.0` exactly.** npm's `latest` resolves to 10.0.2, which predates the STRK20 API entirely.
2. **The deployed pool class hashes differ from the SDK README.** The live pools run a newer revision than the docs claim — pin to the deployment, not the table.
3. **Node 24 or nothing** — `ohttp-ts` needs its WebCrypto.
4. **Starknet accounts must be deployed** before they can sign; an address exists counterfactually and fails confusingly until then.
5. **The privacy SDK isn't on npm** — install from GitHub Packages or a git SHA.
6. **The viewing key must be ≤ `CURVE.n / 2`** — half the curve order. A raw Poseidon digest overflows it about half the time and the pool rejects it with `PRIVATE_KEY_NOT_CANONICAL`.
7. **Errors surface from the prover, not the chain.** A failed action reverts inside the prover's *virtual* block, so the tx hash in the error doesn't exist on Starknet — don't look it up on an explorer. Decode the felt in the revert reason instead.
8. **Never claim more privacy than we've verified.** If it's not in the "verified" table above, it's not a claim.

---

## 7. What to pick up

Ordered by what the score rewards. See [`BUILD-STEPS.md`](BUILD-STEPS.md) for the full task list with owners.

- **MCP server skeleton** — transport, tool registry, `node:sqlite` metering ledger (no identity column), worker isolation. Good first task; independent of the money path.
- **The STRK20 paywall endpoint** — a small service that returns 402 with a price and unlocks on payment. This is the hero demo's other half.
- **Browser worker** — drive Obscura over CDP, fresh context + circuit per task, `browse`/`extract` tools.
- **Viewing-key `reveal`** — decrypt and display the user's own spend history. Cheap to build, big narrative payoff.

**Coordinate before starting** so we don't collide — the money path is currently in progress.

---

## 8. The rest of the docs

| Doc | What's in it |
|---|---|
| [`PLAN.md`](PLAN.md) | product, architecture, scope, schedule |
| [`PRIVACY-STACK.md`](PRIVACY-STACK.md) | how it's private — the five channels in depth |
| [`THREAT-MODEL.md`](THREAT-MODEL.md) | adversaries, precise claims, judge Q&A |
| [`SPIKE-RESULTS.md`](SPIKE-RESULTS.md) | what we verified first-hand, with evidence |
| [`BUILD-STEPS.md`](BUILD-STEPS.md) | step-by-step task list |
| [`READING-LIST.md`](READING-LIST.md) | annotated background reading |

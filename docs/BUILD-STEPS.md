# Tony Stark — Step-by-Step Build Guide

The ordered list of what actually has to happen, who does it, and how you know each step is done. Sequenced so the **riskiest thing is proven first** and you're never blocked waiting on anyone.

Legend: **[YOU]** = needs a human (accounts, keys, money, org access) · **[ME]** = I can do it · **[BOTH]**

---

## Phase 0 — Get on the board (Day 1, ~1 hour)

Do this first: the leaderboard ranks by *most recent push*, so existing early and pushing daily is worth real points.

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 1 | ✅ Create the **public GitHub repo** | [YOU] | `Aaronvern/Tony-Strk` |
| 2 | ✅ Commit docs + README | [ME] | pushed |
| 3 | ✅ **Submit the application PR / registry entry** — the hackathon entry is registered | [BOTH] | registry entry merged; push the prepared `strk20.json` before the deadline |
| 4 | ✅ Pin toolchain: **Node 24**, `starknet@10.7.0` (`latest` = 10.0.2 is too old) | [ME] | `.nvmrc` + lockfile committed |

✅ Step 3 was the actual entry; the application/registry record is now present.

---

## Phase 1 — Prove the money path on Sepolia (Days 1–4) ← **the critical phase**

Everything else is normal engineering; *this* is the part that must work. We use StarkWare's live hosted infra, so no self-hosting and nothing to wait for.

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 5 | ✅ **Sepolia account** funded + **deployed** (`scripts/faucet.mjs`, `scripts/deploy-account.mjs`) | [BOTH] | 5 STRK, account live, can sign |
| 6 | ✅ Hosted infra verified: prover `transaction-prover.alpha-sepolia.sw-dev.io`, discovery `discovery-service.alpha-sepolia.sw-dev.io` | [ME] | `npm run spike:services` passes |
| 7 | ✅ **Pool addresses** recovered + verified on-chain, both networks | [ME] | in `.env.example` |
| 8 | ✅ **Prove an action** against the hosted prover | [ME] | real proof returned, facts present |
| 9 | ✅ **AVNU paymaster wired** (`SdkWallet` + `AvnuPaymaster`) — needs `AVNU_API_KEY` from portal.avnu.fi | [ME] | proven tx lands on-chain |
| 10 | ✅ **Shielded 3 STRK — screening passed** ([`0x3e74d5…`](https://sepolia.starkscan.co/tx/0x3e74d521285a305781153653c71f785f386acb10b409dcb60e2178a32489349)) | [ME] | on-chain ✅ |
| 11 | ⬜ **Private transfer**, then read the private balance back via discovery | [ME] | balance moves, nothing leaks on the explorer |

✅ **Phase 1's gate is passed** — the money path works end to end. Everything downstream is ordinary engineering.

✅ **Gate:** when step 10 passes, the product is real. If the SDK fights us here, we learn it on Day 2, not Day 15.

---

## Phase 2 — The MCP server skeleton (Days 4–8)

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 12 | Scaffold the **remote MCP server** (auth, transport, tool registry) | [ME] | Claude connects and lists tools |
| 13 | Wallet adapter **behind an interface** (configured network now, Ready-extension later) | [ME] | one swappable module |
| 14 | Tools: **`topup`** + **`balance`** backed by real shielded funds | [ME] | works from a live Claude session |
| 15 | **Metering ledger** — keyed on a funded session credential, **never** a user identity | [ME] | usage debits credit |
| 16 | **Worker isolation** — browsing and payment separated, no shared ID | [ME] | no join key exists, by construction |

---

## Phase 3 — The payment loop (Days 8–11) ← *the hero demo*

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 17 | Build our own **STRK20-priced paywalled endpoint** (returns 402 + a price) | [ME] | returns 402 until paid |
| 18 | **`pay` tool** — private transfer unlocks the content | [ME] | agent pays → content returns |
| 19 | **AVNU paymaster** (`sponsored_private`) for gasless, fee-private settlement | [ME] | tx lands with no user-paid gas |
| 20 | **Batched settlement queue** respecting the ~10-block rule | [ME] | no per-click on-chain tx |

✅ **Gate:** an agent autonomously buys something and nothing on-chain points at the user.

---

## Phase 4 — Anonymous browsing (Days 11–14)

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 21 | **Obscura + Tor** (`--proxy socks5://…`), fresh browser context + circuit per task, torn down after | [ME] | site logs show a Tor exit, not you |
| 22 | **`browse` / `extract`** tools | [ME] | agent reads a page end-to-end |
| 23 | **"What the site sees vs. who you are"** comparison view | [ME] | demo-ready visual |
| 24 | *(stretch)* **Agent Wallet policy** — per-site caps, allowlist, daily cap | [ME] | over-limit spend is refused |

Scope discipline: library defaults for fingerprinting, Tor not residential proxies. Hours saved here go into Phase 3.

---

## Phase 5 — Mainnet (Days 15–16) ← **the 30% criterion**

The server-side Mainnet proving route is verified. Three complete MCP x402 runs
used it successfully on Aug 30.

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 25 | ✅ Install **Ready/Argent X**, enable privacy, and fund the guardian-free account with real STRK | [YOU] | Mainnet account deployed and funded |
| 26 | ✅ Prove server-side Mainnet actions (Route B) | [ME] | real STRK20 proofs execute through the Mainnet pool |
| 27 | ✅ **Three real Mainnet MCP x402 runs** through STRK20 + `PaywallAnonymizer` | [BOTH] | three distinct hashes, `PaywallPaid` receipts, and HTTP 200 protected content |
| 28 | ✅ Point the hero demo at Mainnet | [ME] | Mainnet product flow is live |
| 29 | ✅ Use the hosted Mainnet prover | [ME] | proofs generated for the verified Mainnet route |

✅ **Gate:** three real Mainnet MCP x402 transaction hashes a judge can verify.

---

## Phase 6 — Win the other 40% (Days 17–18)

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 30 | ✅ Document protocol viewing-key disclosure | [ME] | disclosure boundary is explicit |
| 31 | ✅ **README + architecture diagram + threat model** (15% of the score) | [ME] | a stranger can run it |
| 32 | ✅ **3-minute demo video** | [BOTH] | 2:58 production video published |
| 33 | ✅ Harden error handling, retries, and receipt sequencing | [ME] | 192 app tests and 17 contract tests pass |
| 34 | ✅ **Final push before the deadline** (leaderboard = most recent push) | [ME] | submission package published |

---

## Submission inputs

1. **Public GitHub repo** + registry entry — ✅ recorded
2. **Sepolia account + testnet STRK** — ✅ used for early verification
3. **Ready wallet + real Mainnet STRK** — ✅ used for the verified runs
4. **Hosted Mainnet prover access** — ✅ used for the verified runs

## The daily rhythm

Push *something* every day — the leaderboard rewards it and "build in public" is a rule. Even docs count.

## The one number to watch

**Phase 5, step 27.** Three Mainnet MCP x402 runs completed on 2026-08-30 through the STRK20 pool and `PaywallAnonymizer`, with real proofs and receipts.

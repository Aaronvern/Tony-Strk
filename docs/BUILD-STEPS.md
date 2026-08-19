# Tony Stark — Step-by-Step Build Guide

The ordered list of what actually has to happen, who does it, and how you know each step is done. Sequenced so the **riskiest thing is proven first** and you're never blocked waiting on anyone.

Legend: **[YOU]** = needs a human (accounts, keys, money, org access) · **[ME]** = I can do it · **[BOTH]**

---

## Phase 0 — Get on the board (Day 1, ~1 hour)

Do this first: the leaderboard ranks by *most recent push*, so existing early and pushing daily is worth real points.

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 1 | Create the **public GitHub repo** (`tony-stark`) | [YOU] | repo exists, public |
| 2 | Commit the `docs/` we already wrote + a real README | [ME] | pushed |
| 3 | **Submit the application PR** — the hackathon entry | [BOTH] | PR open, tracked by StarkWare |
| 4 | Pin toolchain: **Node 24**, `starknet@10.7.0` (`latest` = 10.0.2 is too old) | [ME] | `.nvmrc` + lockfile committed |

⚠️ Step 3 is the actual entry. Nothing else counts until it's in.

---

## Phase 1 — Prove the money path on Sepolia (Days 1–4) ← **the critical phase**

Everything else is normal engineering; *this* is the part that must work. We use StarkWare's live hosted infra, so no self-hosting and nothing to wait for.

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 5 | Create a **Sepolia account** + fund with testnet STRK (faucet) | [YOU] | address has a balance |
| 6 | Wire the SDK to hosted infra: prover `https://transaction-prover.alpha-sepolia.sw-dev.io`, discovery `https://discovery-service.alpha-sepolia.sw-dev.io` | [ME] | `/health` OK from our code |
| 7 | Find the **Sepolia pool address** (SDK repo/config; else ask organizers) | [ME] | address in `.env` |
| 8 | **Register the viewing key** (`SetViewingKey`) — wait ~10 blocks after account deploy | [ME] | tx accepted |
| 9 | **Shield: deposit STRK into the pool** (needs a screening signature — it's mandatory) | [ME] | `Deposit` event on-chain |
| 10 | **Private transfer** between two accounts | [ME] | tx accepted, balance moves, nothing leaks on explorer |
| 11 | **Read private balance** back via discovery | [ME] | `strk20Balances` returns the right number |

✅ **Gate:** when step 10 passes, the product is real. If the SDK fights us here, we learn it on Day 2, not Day 15.

---

## Phase 2 — The MCP server skeleton (Days 4–8)

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 12 | Scaffold the **remote MCP server** (auth, transport, tool registry) | [ME] | Claude connects and lists tools |
| 13 | Wallet adapter **behind an interface** (Sepolia-hosted now, Ready-extension later) | [ME] | one swappable module |
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

Mainnet proving is auth-gated, so we go **through the wallet** (which legitimately holds the credentials).

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 25 | Install **Ready/Argent X**, enable privacy, fund with **a small amount of real STRK** | [YOU] | mainnet wallet ready |
| 26 | Prove server-side mainnet proving (Route B). Fallback: drive the Ready extension — needs a **separate** Chromium+Playwright, since Obscura can't load extensions | [ME] | `wallet_strk20PrepareInvoke` returns a real proof |
| 27 | **One real mainnet shielded transfer** | [BOTH] | tx hash on Starkscan |
| 28 | Point the hero demo at mainnet; label mainnet vs. devnet **honestly** | [ME] | no devnet shown as mainnet |
| 29 | *(parallel, from Day 1)* Request **mainnet prover access** via Proof of Privacy | [YOU] | grant received (fallback) |

✅ **Gate:** a real mainnet tx hash you can show a judge.

---

## Phase 6 — Win the other 40% (Days 17–18)

| # | Step | Who | Done when |
| --- | --- | --- | --- |
| 30 | **`reveal` tool** — viewing-key selective disclosure ("private by default, auditable on demand") | [ME] | user decrypts own history |
| 31 | **README + architecture diagram + threat model** (15% of the score) | [ME] | a stranger can run it |
| 32 | **2-minute demo video** | [BOTH] | recorded |
| 33 | Harden: error handling, retries, the 10-block sequencing | [ME] | demo survives a rehearsal |
| 34 | **Final push before the deadline** (leaderboard = most recent push) | [ME] | pushed Aug 31 |

---

## What I need from you (the blocking list)

1. **Public GitHub repo** + the application PR (Phase 0) — *today*
2. **Sepolia account + testnet STRK** (Phase 1) — *today, unblocks everything*
3. **Ready wallet + a small amount of real mainnet STRK** (Phase 5) — by ~Day 14
4. **Request Proof of Privacy mainnet access** — start Day 1, it's the fallback
5. **Team size + your TS comfort** — decides how much I hand off vs. build

## The daily rhythm

Push *something* every day — the leaderboard rewards it and "build in public" is a rule. Even docs count.

## The one number to watch

**Phase 1, step 10.** A private transfer working on Sepolia means the product is real. Until then, treat everything else as provisional.

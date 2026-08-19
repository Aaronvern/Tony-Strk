# Tony Stark — Product Plan

> An anonymous browsing-and-paying agent, exposed as a remote MCP server, built on Starknet's STRK20 privacy stack.
> **"The web sees the suit. Nobody sees the man inside."**

Status: **planning + feasibility spike complete.** This doc is the source of truth for scope and sequencing.
Last updated: 2026-08-14.

---

## 1. What it is

A **remote MCP server that gives any AI agent two powers**:

1. **Browse the web anonymously** — a cloud headless browser that exits through Tor/proxy, so target sites never see the user's IP, device, or identity.
2. **Pay on the web anonymously** — a private wallet that settles in **shielded STRK20**, so neither the chain, the payee, nor the operator can link a payment to the user or their history.

Any MCP client (Claude, Cursor, etc.) connects and composes these into: *"research this, and buy access to whatever you need — without exposing me."*

This is StarkWare's own suggested build **#11 — Private AI Agent Payments** ("agents pay for APIs, compute, and services without turning every payment into a public workflow map") plus their named **"Agent Wallet"** primitive (policy controls + permissions).

---

## 2. Hackathon fit (STRK20 Private Sprint)

**Rules:** apply with one PR · build in public · integrate STRK20 privacy · ship a **working product on mainnet by Aug 31** · most-recent push tops the leaderboard.

**Judging → how we win each axis:**

| Weight | Criterion | Our answer |
| --- | --- | --- |
| 30% | **STRK20 integration depth** | shield/unshield, confidential transfer, metered debit from shielded balance, viewing-key disclosure, AVNU `sponsored_private` gasless paymaster. Multiple real uses, not a token gesture. |
| 30% | **Working mainnet product** | live remote MCP server doing real shielded payments on mainnet. Reliability > feature count. |
| 25% | **Innovation** | "MCP-native anonymous browsing agent with a private wallet" is a category, not a dapp — and it's their own #11. |
| 15% | **Docs / open-source quality** | this plan, an architecture diagram, a README, and a 2-min demo video, all built in public from day 1. |

Leaderboard mechanic ⇒ **ship a thin slice early, push every day.** Going dark loses the top spot.

---

## 3. The three privacies (the conceptual core)

The product is only defensible if anonymity is **end-to-end** across three unlinkable identities:

| Identity | Hidden from | Mechanism |
| --- | --- | --- |
| **Network** (IP, fingerprint) | the websites | headless browser behind Tor/proxy, ephemeral sessions |
| **Financial** (balance, spend graph) | the chain + payees | STRK20 shielded transfers + AVNU `sponsored_private` paymaster |
| **Behavioral** (who did what) | **us, the operator** | ephemeral sessions, no user↔session map; the privacy SDK talks to prover/discovery over **OHTTP** so even the proving operator can't correlate the user; viewing keys held by the user |

The third row is the differentiator most "privacy" products fail — and here the protocol itself (OHTTP to the services) backs the claim, so it isn't just our promise.

---

## 4. The two payment layers

The privacy lives in **shielded STRK20 on Starknet**. There are three payable surfaces, and **only the first two are private** — see `THREAT-MODEL.md` §4.5. Blurring this is the fastest way to get punctured by a judge.

- **Layer A — pay for Tony Stark (private, on-theme).** User funds a **shielded prepaid balance**; the server meters usage (browser minutes, bandwidth, payment ops) off-chain and settles against it in batches, gaslessly via the AVNU `sponsored_private` paymaster. Fully private STRK20.
- **Layer B — pay Starknet-native / STRK20 services (private, on-theme).** The agent pays a Starknet endpoint priced in STRK20 via a private `transfer` (pool-native payee → fully private) or `withdraw` (external address → sender-anonymous). **The hero demo stands up its own STRK20-denominated paywalled endpoint**, so the whole loop stays private and on-Starknet. This is "the agent pays for what it needs, anonymously."
- **Layer C — the open x402 agent-web (transparent, optional, may cut).** The wider agent-payable web (13k+ endpoints) settles in **USDC on Base — transparent, not Starknet.** Impressive for reach, but **not private**; if shown at all it's labeled "transparent agentic commerce," and the only privacy claimed is that the *funding* stays shielded. Not part of the core pitch.

**Critical constraint from the SDK (confirmed in spike):** the prover reads *finalized* state and the sequencer accepts a proof only when its base block is ≥10 blocks old, so **you cannot do a real shielded transfer per page-view.** Design consequence: micro-usage is metered *off-chain* against the shielded prepaid balance; actual on-chain shielded settlements happen in **batches** (Layer A) and as **discrete payments** (Layer B), never per click.

---

## 5. Architecture

Four components with clean boundaries:

1. **Remote MCP server** (the interface) — exposes tools an AI client calls:
   - `browse(url)` / `extract(selector)` — drive the anonymous browser
   - `balance()` / `topup(amount)` — Layer A shielded prepaid balance
   - `pay(recipient, amount)` — Layer B confidential outbound payment
   - `policy(rules)` — Agent Wallet controls (per-site cap, domain allowlist, daily cap)
   - `reveal(viewingKey)` — decrypt the user's own spend history (selective disclosure)
2. **Browser worker pool** (eyes/hands) — **Obscura** (Rust headless engine, Apache-2.0, CDP-compatible), each session in a fresh browser context behind a rotating Tor circuit (`--proxy socks5://`), torn down after use, zero cross-session state. `--stealth` gives a self-consistent fingerprint with no automation tells (plus TLS impersonation and tracker blocking when built with the `stealth` feature), and it emits DOM→Markdown natively for the agent. It is **not** per-session fingerprint randomization — see `PRIVACY-STACK.md` §2.5 for what we do and don't claim. Chosen over headless Chromium because **30 MB and instant startup** (vs 200 MB / ~2 s) is what makes a genuinely fresh browser *per task* affordable rather than aspirational — the privacy model depends on never reusing a session. We drive it over CDP from our own MCP server rather than proxying Obscura's built-in MCP, so the isolation boundary stays ours.
3. **Wallet / payment service** (the money) — drives the **STRK20 Wallet API** (`starknet@10.7.0`, `WalletAccountV6`), so **keys, notes and proving stay in the user's wallet** (Ready/Argent X or Xverse). We assemble `STRK20_ACTION[]` intents; the wallet returns `{call, proof}` from `strk20PrepareInvoke` (SNIP-36) and we submit via `executeWithProof`. We never custody the spending key or viewing key. Covers shield (`DEPOSIT`), private send (`TRANSFER`), unshield (`WITHDRAW`), `strk20Balances`, and the AVNU `sponsored_private` paymaster. The spec even defines a `PRIVACY_LEAK` error — the wallet refuses privacy-leaking operations.
3b. **Shadow-account manager** (⚠️ **roadmap, not MVP**) — would derive a **fresh unlinkable shadow account per task/site** (`strk20ShadowAccountCommitment(dappName, nonce)`) and use the **partial commitment** to credit a user **without learning which account or linking them**. **Spike 2 found this method is absent from the shipping Ready wallet v5.33.8**, so the MVP does not depend on it; revisit if wallet support lands or once we run our own wallet adapter.
4. **Agent Wallet policy engine** — **Ready session keys + SNIP-9 outside execution**: the user grants a policy-scoped session key (per-site cap, domain allowlist, daily cap, expiry, kill switch); the agent spends autonomously *within* it, gaslessly via the paymaster. This is how §7's `policy` tool is enforced without us holding funds.
5. **Metering ledger** — counts usage, debits Layer A. Meters a *funded session credential*, not a person, and is **isolated from the browsing worker** (no shared identifier links "browsed X" to "paid Y") — never needs the user's identity.

**Task flow:** agent → `browse(url)` → server checks session is funded → browser worker fetches via proxy → returns content → hits a paywall → agent calls `pay(...)` → wallet does a shielded transfer via paymaster → content unlocks → ledger debits the session. Nothing links the user to the site or the payment.

### How it maps to the STRK20 SDK (verified in spike)

```ts
import { Account, RpcProvider } from "starknet";
import { createPrivateTransfers, IndexerDiscoveryProvider } from "@starkware-libs/starknet-privacy-sdk";

const transfers = createPrivateTransfers({
  account,
  viewingKeyProvider: { getViewingKey: () => viewingKey },
  provingProvider,                                   // proving service (see §6)
  discoveryProvider: new IndexerDiscoveryProvider(discoveryUrl, poolAddress),
  poolContractAddress: poolAddress,
});

await transfers.build({ autoDiscover: { notes: "refresh", channels: "refresh" }, autoSelectNotes: "naive" })
  .with(STRK).transfer({ recipient, amount }).surplusTo(self).execute();
```

- **shield/unshield** = pool deposit/withdraw; **private send** = `.transfer()`.
- **gasless private fees** = `new AvnuPaymaster({ url, apiKey, feeMode: { mode: "sponsored_private", poolFeeToken } })` (SNIP-29; natively supported by AVNU's paymaster).
- **private swaps** (optional, for "pay in the token the service wants") = Ekubo swap **anonymizer**; private lending via Vesu anonymizer.
- **discovery is stateless** — rebuild the registry each session; no persistence.

---

## 6. Feasibility verdict (spike results, 2026-08-14)

**Usable — with one hard external dependency.**

| Check | Result |
| --- | --- |
| Mainnet RPC | ✅ Multiple public endpoints return `SN_MAIN` (Lava, dRPC, Cartridge, PublicNode). |
| Privacy SDK exists & quality | ✅ `@starkware-libs/starknet-privacy-sdk` v0.14.3-rc.5 — clean high-level API, good docs, stateless model, paymaster + viewing keys built in. |
| SDK deps install | ✅ `npm ci` adds 365 pkgs cleanly. **Needs Node ≥ 24** (ohttp-ts); we're on 22 → bump. |
| SDK distribution | ⚠️ **Not on npmjs.** Ships via GitHub Packages (needs a GH token) or `npm i "starkware-libs/starknet-privacy#<sha>"`. |
| AVNU gasless-private paymaster | ✅ Real, open-source, natively supports the privacy-pool `sponsored_private` flow. |
| **Mainnet proving on a headless server** | ⚠️ **Solved via wallet-delegation, not self-hosting.** The raw SDK's Proving Service needs a Pathfinder full node (infeasible in 18 days). The realistic path is the **Privacy Wallet API**: a released wallet (**Ready/Argent X**, **Xverse**) does viewing-key mgmt + proving. Client-side S-two proving is also real. No public hosted-prover URL is documented. |

**The one thing that gates the whole project (updated after the Day-1 spike — see `SPIKE-RESULTS.md`):** we will **not** self-host the Pathfinder-based Proving Service. Proving is **delegated to the user's wallet** via the STRK20 Wallet API, so we never run a full node and never touch keys — which *strengthens* the operator-trust story (`THREAT-MODEL.md` §3).

**Spike 2 settled this (see `SPIKE-RESULTS.md` §8–§11):**
- **Headless is proven by execution.** `WalletWithStarknetFeatures` is a plain object whose whole surface is one `request()` fn; we implemented it in Node 24 and ran all four STRK20 methods through `WalletAccountV6` with **no browser**.
- **The hosted infrastructure exists and is live.** StarkWare's **Sepolia** prover (`transaction-prover.alpha-sepolia.sw-dev.io`) and discovery (`discovery-service.alpha-sepolia.sw-dev.io`) are up, synced (~5s lag), OHTTP-enabled, and verified as official (their `/ohttp-keys` byte-matches the pinned key in the SDK repo's demo env).

**⇒ Route B (our own server-side wallet adapter + hosted prover/discovery) is the build path** — fully headless, no Pathfinder, no blocking dependency, immediate iteration on Sepolia.
**⇒ For mainnet, test Route B first.** *(Corrected: Ready's production endpoints are **not** auth-gated as first believed — they answer unauthenticated JSON-RPC like the Sepolia ones; see `SPIKE-RESULTS.md` §10.)* If a real proof completes server-side on mainnet, we get the fully-headless product with no wallet in the loop. If it doesn't — or if we're asked not to use that infrastructure — **Route A** (drive the Ready wallet extension) is the fallback. Keep the wallet adapter behind an interface so this is a config swap, not a rewrite.

⚠️ **Route A now carries a cost.** Obscura is a native Rust engine and **cannot load Chrome extensions**, so Route A would require standing up a *separate* headless Chromium + Playwright purely to host the Ready extension. That's a second browser stack for one job. It doesn't change the browsing decision (Obscura is right for browsing), but it does raise the price of the fallback — one more reason to prove Route B early.

⇒ **Actions:** (1) Human: request hosted prover/discovery + the mainnet **pool address** from the Proof of Privacy program / builders group as a fallback to the wallet path. (2) Agent: prototype the **wallet-delegated** flow (Ready/Xverse) as the primary mainnet route. Until either is proven, develop on a **local devnet** (the repo fully supports devnet), then flip to mainnet.

---

## 7. Scope

**Hero use case (the one demo we polish):** an AI research/procurement agent that must buy a **premium data feed** without exposing its principal — it browses anonymously, hits *our own* STRK20-denominated Starknet paywall, pays privately, returns the answer, and the user hits `reveal` to audit the spend with their viewing key. Browse-anonymous → pay-private → audit-on-demand, in one flow.

**MVP (must ship on mainnet):**
- Remote MCP server with `browse`, `extract`, `topup`, `balance`, `pay`, `reveal`.
- Keys + proving **client-side** via Ready/Argent X (or Xverse) — we never custody them.
- Layer A: shielded prepaid balance + off-chain metering + batched settlement, gasless via `sponsored_private` paymaster.
- Layer B: the hero loop — a **STRK20-denominated Starknet paywall endpoint we build** + a private `transfer` to unlock it.
- Obscura + Tor browsing worker; "what the site sees vs. who you are" reveal.
- Viewing-key `reveal` UI.

**Stretch:** Agent Wallet `policy` (Ready session keys); Ekubo private-swap-to-pay; multi-token. **Transparent/off-theme, likely cut:** x402/Base agent-web breadth.

**Explicitly cut:** custom fingerprint hardening (library defaults), residential proxies (Tor is enough), **self-hosted Pathfinder prover (delegate proving to the wallet)**, high-scale metering (in-memory ledger).

---

## 8. Schedule — 12 days remaining (as of Aug 19; deadline Aug 31)

The sprint was announced Aug 13 as 18 days. We entered on Aug 19, so the plan below is re-anchored to real calendar dates. Leaderboard ranks by most-recent push, so **something ships every day.**

**Already done**
- ✅ Public repo, README, docs, toolchain pinned (Node 24, `starknet@10.7.0`)
- ✅ Feasibility verified: headless STRK20 wallet API, hosted prover + discovery live, pool addresses recovered and verified on-chain
- ✅ Anonymous browsing proven end-to-end (Obscura → Tor, `IsTor:true`)

**Remaining**
- **Aug 19–20 — the money path.** Sepolia account + faucet, register viewing key, **shielded deposit (tests screening)**, private transfer. *This is the gate: until it passes, everything else is provisional.*
- **Aug 21–23 — MCP server.** Skeleton + `topup`/`balance` on real shielded funds; metering ledger on `node:sqlite`; browsing/payment worker isolation.
- **Aug 24–26 — the hero loop.** Our own STRK20-priced paywall + `pay` tool + AVNU `sponsored_private` paymaster + batched settlement.
- **Aug 27–28 — browsing.** `browse`/`extract` over Obscura CDP + Tor; the "what the site sees vs. who you are" reveal.
- **Aug 29–30 — mainnet + polish.** Real mainnet shielded transfer (tx hash on Starkscan), viewing-key `reveal`, architecture diagram, 2-min demo video.
- **Aug 31 — buffer + final push.**

**If we slip,** the browsing layer is what gets cut, not the payment path — 60% of the score is STRK20 depth plus a working mainnet product. Note we can develop entirely against StarkWare's hosted **Sepolia** infrastructure, so we are never blocked waiting on anyone.

---

## 9. Risks & mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Mainnet proving in a **headless** agent (wallet-delegated path assumes a browser wallet session) | **High** | Spike the Ready/Xverse programmatic API Day 1; fallback = request a hosted prover/discovery endpoint from Proof of Privacy. Build on devnet meanwhile — mainnet is a swap, not a rewrite. See `THREAT-MODEL.md` §8. |
| **Overclaiming privacy on x402/Layer C** (transparent Base USDC) | **High** | Hard rule: privacy claims cover Layer A + B (STRK20/Starknet) only; x402 labeled transparent or cut. `THREAT-MODEL.md` §4.5. |
| Prover latency + 10-block sequencing | Med | Meter off-chain; settle in batches; hide waits behind spinners. Never per-click on-chain. |
| Real funds on mainnet | Med | Small amounts only; test the full loop on devnet first; human funds + holds keys. |
| SDK is RC (0.14.3-rc.5), paymaster wire format not covered by a live e2e | Med | Pin the tag from the compatibility matrix; validate paymaster against a local AVNU paymaster early. |
| Overspending time on the browser | Med | Hard scope cap (§7); browser is the demo vehicle, payments are the score. |
| Node 24 / GH Packages friction | Low | Bump Node; use git-SHA install or a GH token. Characterized. |

---

## 10. Open dependencies (need from organizers)

**Primary path — wallet-delegated (no organizer blocker):**
1. **Ready/Argent X** (or **Xverse**) with the **Privacy Wallet API** enabled — the proving + viewing-key backend and the session-key policy engine.
2. Mainnet **shared privacy pool address** + STRK20 token/fee-token addresses (from `strk20-by-example.org` `/sdk/*` pages).
3. AVNU **paymaster URL + API key** for `sponsored_private`.

**Fallback path — hosted infra (needs a request):**
4. Hosted mainnet **prover + discovery** endpoint + **compliance public key** from StarkWare's **Proof of Privacy** program (proof.starknet.io) / builders group — only if we want a fully headless server without driving a wallet.

**Nice to have:** the hackathon **starter kit** repo + **"agent skills"** (may include the pool address / endpoints).

---

## 11. Immediate next actions

- [ ] Human: install **Ready/Argent X** with the Privacy Wallet API; request the Proof-of-Privacy hosted endpoints as a fallback.
- [ ] Human: confirm team size + TS/Starknet comfort (decides how much I build vs. hand off).
- [ ] Agent: on go — scaffold the public repo (MCP server skeleton + README + this plan), bring up local devnet, land a devnet private transfer via the SDK, **and spike the wallet-delegated proving path** as the Day-1 proofs.

---

## 12. Why we win (moat, in one line)

Every competitor does at most one leg: Coinbase x402+AgentKit and **Paybox** pay the agent-web but are **transparent, no anonymous browsing**; Skyfire/Payman/Nevermined are **identity-first (the opposite of anonymity)**; Railgun/Aztec do payment privacy but are **middleware, not agent-browsing MCP, and not on Starknet**. Tony Stark is the only one combining **anonymous browsing + shielded STRK20 payment + MCP-native** — and it's StarkWare's own suggested build #11. We claim novelty only on that triple, never on a single axis.

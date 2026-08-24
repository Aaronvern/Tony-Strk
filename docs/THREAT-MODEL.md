# Tony Stark — Threat Model & Bulletproofing

> **Archived / superseded (2026-08-21).** This threat model describes the
> earlier remote browser-worker and hosted-tier proposal. Do not use its claims
> for the active server. See the [README](../README.md),
> [current privacy stack](PRIVACY-STACK.md), and
> [Local MCP hardening design](superpowers/specs/2026-08-21-local-mcp-hardening-design.md)
> for the loopback-only Tor HTTP fetcher and its current boundaries.

This document preserves the historical proposal and its analysis; it is not an authoritative statement of current behavior.

Every mechanism cited here was verified first-hand against the `starkware-libs/starknet-privacy` source on 2026-08-14.

---

## 1. Adversaries and our defense

A privacy product is only as strong as its weakest observer. There are seven.

| # | Adversary | What they'd learn if we did nothing | Our defense |
| --- | --- | --- | --- |
| 1 | **The websites** the agent visits | user's IP, device fingerprint, identity, that *this person* viewed *this page* | headless browser exits via Tor/proxy; ephemeral session per task; HTTPS-only; **no logins** (out of scope by design) |
| 2 | **On-chain observers** | balances, amounts, who-paid-whom | STRK20 shielded notes (encrypted, Poseidon/ECDH). Deposits & withdrawals are visible *endpoints*; the links between them are hidden inside the anonymity set |
| 3 | **The payee** (service being paid) | which user paid them, and links to the user's other spend | **sender-anonymous**: an external payment is a pool `withdraw` — the payee sees an amount arrive but cannot tell which shielded user sent it. Pool-native payees get a fully private `transfer` |
| 4 | **The prover / discovery operator** | could correlate a user's IP with the notes/proofs they request | **OHTTP (RFC 9458)** — HPKE-encapsulated, passed on both the proving and discovery providers, on by default. Contents are blinded. **IP is only blinded once `OHTTP_RELAY_URL` is set**: without the relay/gateway split the gateway still sees the connection |
| 5 | **US — the Tony Stark operator** | *everything*: URLs browsed + content + who funded + what was paid | **the central design problem — see §3.** Client-side keys, worker isolation, no-log ephemeral sessions, Tor egress on the browser worker, and a self-hostable open-source server |
| 6 | **A timing correlator** watching both a site access and an on-chain withdraw | could link "accessed X at T" to "withdraw at T+ε" | decouple access from settlement: prepaid credits, **batched** settlement, and the protocol's own proof-timing delay already break tight coupling (§5) |
| 7 | **Anonymity-set collapse** (a near-empty pool) | if only one user deposited near a withdraw, statistical linking | **only ever use the canonical shared STRK20 pool** — never deploy our own. Privacy scales with the shared set; a private pool of one is not private (§6) |

---

## 2. Precise privacy claims (the anti-overclaim table)

For each observer, what is **Hidden ✅** vs **Visible ⚠️**. This is the exact boundary we present; we never round "⚠️" up to "✅".

| Data element | Websites | On-chain | Payee | Prover/Discovery | Operator (hosted) |
| --- | --- | --- | --- | --- | --- |
| User IP / device | ✅ hidden | ✅ n/a | ✅ hidden | ⚠️ visible unless a relay is set (contents ✅ hidden via OHTTP) | ⚠️ mitigated, §3 |
| Which pages browsed | ✅ hidden* | ✅ n/a | ✅ n/a | ✅ n/a | ⚠️ mitigated, §3 |
| Wallet balance | ✅ n/a | ✅ hidden | ✅ hidden | ✅ hidden | ✅ hidden (client keys) |
| Payment amount to a payee | ✅ n/a | ⚠️ visible at withdraw | ⚠️ visible | ✅ hidden | ✅ hidden |
| Sender identity of a payment | ✅ n/a | ✅ hidden (in-set) | ✅ hidden | ✅ hidden | ⚠️ mitigated, §3 |
| Spend graph (who paid whom, history) | ✅ n/a | ✅ hidden | ✅ hidden | ✅ hidden | ⚠️ mitigated, §3 |
| That an address deposited/withdrew *at all* | ✅ n/a | ⚠️ visible | — | — | — |
| User's own full history | via **viewing key** — only the user (or an auditor key) can decrypt | | | | |

*\* Websites can't see browsing they aren't part of; a site the agent visits obviously sees its own page load, just not who loaded it.*

**The honest headline:** *nobody can link the user's identity to what they browsed or what they paid.* We do **not** claim amounts are invisible to a payee, that deposits/withdrawals are invisible on-chain, or that logged-in browsing is anonymous.

---

## 3. The operator-trust problem (the hardest question) and our answer

**The objection:** "Your MCP server hosts the browser *and* orchestrates the wallet. Even if the chain and the sites are blind, *you* see the URLs, the content, and the payments. A privacy product that just moves all the trust to you isn't private."

This is the correct objection, and it is the one most privacy products fail. Our answer is architectural, not a promise:

1. **Client-side keys and signing.** The server never holds the user's spending key or viewing key. The `starknet-privacy` client (`SdkWallet` + SNIP-12 signer) signs proof invocations **client-side**; we build unsigned transactions, the user's side signs. We cannot spend, and we cannot decrypt their notes.
2. **Worker isolation — no join key.** The browsing worker and the payment worker are separate trust domains with **no shared identifier** linking "session that browsed X" to "wallet that paid Y." A compromised or subpoenaed operator has two unlinked halves, not one profile.
3. **Tor for the browser worker's own fetches.** The worker reaches destinations over a SOCKS circuit, so the operator's egress IP is a Tor exit rather than anything tied to the user, and the destination hostname is resolved *at the exit relay* rather than locally — otherwise the traffic is tunnelled while the DNS lookups leak. **Not yet true of the MCP call itself:** a hosted client still connects to us directly, so a hosted operator sees the caller's IP at that hop. Closing it means fronting the MCP endpoint with an OHTTP relay/gateway split, or the user running their own instance. Until then, item 5 is the honest mitigation, not this one.
4. **Ephemeral, no-log sessions.** Browser sessions are torn down after each task; no persistent user↔session map is written. The metering ledger keys on a *funded session credential*, never on a user identity.
5. **Open-source and self-hostable.** The whole server is open source; a privacy-maximalist runs their own instance and trusts no one. The hosted tier is a convenience with a **documented, explicit trust boundary** — we state plainly what a hosted operator can and cannot see, rather than pretending it's zero.

**The claim we can defend:** in the self-hosted mode, no third party (including us) can profile the user; in the hosted mode, the operator sees strictly less than any conventional proxy-plus-wallet service, and the load-bearing secrets (keys, spend graph) never reach us.

---

## 3.5. The prover trust boundary (what the proving service can and cannot see)

A judge may ask this, and the honest answer is a strength — but only if we state it precisely. **This applies to every STRK20 application, not something our design introduces.**

**What the prover necessarily sees:** the actions it is asked to prove. The proving service executes client actions in virtual Starknet blocks to produce the validity proof, so **transaction contents pass through it**.

**What the prover need not see:** *who you are* — but only if OHTTP is switched on, and it is **off by default**.

The SDK *can* wrap proving and discovery calls in **OHTTP (RFC 9458)**, HPKE-encapsulating them so the operator reads neither the request nor the response. It is an optional field (`ohttp?: OhttpOption` on the proving-service and discovery config), so a caller that omits it gets ordinary HTTPS. **The MCP server now passes it on both providers** (`server/src/pay/wallet.ts`), controlled by `OHTTP_ENABLED`, which defaults on. The standalone scripts in `scripts/` still omit it, so the Sepolia deposit already recorded was made without it.

Two things to get right when we do enable it:

- **Encryption is not unlinkability.** The IP-blinding property comes from the relay/gateway *split* — the relay sees your IP but not the request, the gateway sees the request but not your IP. The SDK's `relayUrl` is optional; with OHTTP on and no relay, you are handing an encrypted request straight to the gateway, which still sees the connection. That is confidentiality, not anonymity.
- Verified live: the hosted prover does serve a real OHTTP key config, byte-matching the one pinned in the SDK repo, so the gateway side genuinely exists.

So the boundary today is: **blinded on contents, not yet on identity** — OHTTP is on, but no relay is configured, so the gateway still sees the connection. Set `OHTTP_RELAY_URL` and identity is blinded too. Contents are never hidden from the prover, by design: it has to execute the actions to prove them.

### Consequence for our mainnet route

*(Corrected — see `SPIKE-RESULTS.md` §10.)* We initially believed mainnet proving was auth-gated. On re-check, the production prover answers unauthenticated JSON-RPC exactly as the open Sepolia one does; the earlier failure was transient. Whether it completes a **real** proving job unauthenticated is still unverified.

Two points hold regardless of how that resolves:

1. **Auth status does not change what the prover sees.** The trust model is identical with or without an API key — an API key governs *who may use the compute*, not visibility. OHTTP is what protects identity.
2. **It is a third party's production infrastructure.** Even where technically open, we ask before depending on it and we don't build a product on someone else's unbudgeted compute.

For the hackathon, whichever route we take places *some* prover in the chain — the same arrangement every STRK20 wallet user already has. Three paths restore full independence, in preference order:

1. **Our own prover grant** (Proof of Privacy) — fully headless mainnet, no wallet in the loop. *Deferred by decision; revisit post-hackathon.*
2. **Client-side proving with S-two** — StarkWare's prover runs client-side (demonstrated on phones); running the prover crate in-process removes the dependency entirely.
3. **Self-host** — requires a Pathfinder full node. Infeasible in 18 days, straightforward afterwards.

**What we never do:** extract credentials from a third-party wallet to call their paid infrastructure from our servers. That is infrastructure abuse and a ToS violation. Legitimate access only — the user's own wallet acting for the user, our own grant, or open dev endpoints.

---

## 4. Compliance-by-design (turning the abuse objection into a strength)

**The objection:** "An anonymous browser that pays anonymously is an abuse and money-laundering magnet."

STRK20 already answers this at the protocol level — we inherit it rather than fight it, and it *scores* as integration depth:

- **OFAC screening at the on-ramp.** The protocol's `proof-interceptor` sidecar screens every **deposit** (the depositor's public address) against the Elliptic AML API before a proof is issued; sanctioned addresses are blocked (`10000 Transaction rejected`). Illicit funds can't enter the shielded set through a compliant operator.
- **On-chain auditor key.** The pool is deployed with an `auditor_public_key` (governance-controlled) — a protocol-level lawful-disclosure path.
- **User-held viewing keys.** The user can selectively reveal their own history to an accountant, employer, or auditor — *private by default, provable on demand.*

**Positioning:** Tony Stark is **private by default, compliant by design** — funds are AML-screened on entry, the user holds a viewing key for voluntary disclosure, and a protocol auditor key exists for lawful process. This is the opposite of a mixer.

---

## 4.5. The payable surface, and the one boundary we will not blur

There are two payment surfaces, and only one is private. Conflating them is the single easiest way to get punctured by a knowledgeable judge, so we separate them explicitly:

| Surface | Rail | Private? | On Starknet / STRK20? | Role |
| --- | --- | --- | --- | --- |
| **A — pay for Tony Stark** (funding + metered usage) | shielded STRK20 | ✅ yes | ✅ yes | core |
| **B — pay Starknet-native / STRK20 services** (the hero demo's paywalled endpoint) | private STRK20 `transfer`/`withdraw` | ✅ yes (sender-anonymous) | ✅ yes | core |
| **C — pay the open x402 agent-web** (13k+ endpoints) | USDC on Base | ❌ **no — transparent** | ❌ no (Base) | optional breadth, may skip |

**The rule:** the pitch and the privacy claims rest on **A and B only** — both are shielded STRK20 on Starknet, which is also where the 30% "integration depth" score lives. Surface **C is real and impressive for *reach*, but it is transparent** (x402 settles in USDC on Base); if we demo it at all, we label it "transparent agentic commerce," and the only privacy we claim there is that the *funding source stays shielded* — the individual x402 payment does not. We would rather cut C than let it dilute the privacy story. The hero demo therefore pays a **STRK20-denominated Starknet endpoint we stand up ourselves**, keeping the whole loop private, on-Starknet, and STRK20-deep.

---

## 5. Timing & latency reality (why metering is off-chain)

Verified constraints from the SDK: the prover reads **finalized** state, and the sequencer only accepts a proof whose base block is **≥10 blocks old** and within the `proof_validity_blocks` window (~450 blocks ≈ 15 min). There is also a per-tx protocol fee in STRK.

**Consequences, baked into the design:**
- **No shielded transfer per page-view.** Micro-usage (browser-minutes, calls) is metered **off-chain** against a prepaid shielded balance.
- **Settlement is batched** (Layer A) and **payments are discrete** (Layer B) — both respect the ~10-block cadence, hidden behind a spinner.
- **Sequencing rule:** after any on-chain state change the pool must prove against (a top-up, a deposit, the previous private tx), wait ~10 blocks before the next private tx. The SDK documents this exact recipe; we implement it as a settlement queue.

This also *helps* privacy (§1 row 6): the enforced delay between access and settlement breaks naive timing correlation for free.

---

## 6. Anonymity-set discipline

Shielded privacy is unlinkability *within a crowd*. Two rules we never break:

1. **Use the canonical shared STRK20 pool only.** Deploying our own pool would create an anonymity set of one — cryptographically private, practically transparent. We integrate the shared mainnet pool so our users hide among all STRK20 users.
2. **Warn honestly about set size.** In the demo we note that privacy strength scales with the live pool's participation; we don't claim strong anonymity from a pool we know is small, and we prefer batching deposits to enlarge the crowd near our settlements.

---

## 7. The ten hard questions (judge / skeptic Q&A)

1. **"Aren't you, the operator, the real privacy hole?"** → §3: client-side keys (we can't spend or decrypt), browsing/payment worker isolation (no join key), OHTTP on our own calls, no-log ephemeral sessions, and a self-hostable open-source server with a documented trust boundary.
2. **"Why STRK20 instead of a virtual credit card?"** → Cards require KYC, deanonymize by construction, let the issuer see every purchase, can't do agent-native micropayments, aren't self-custodied, and offer no selective disclosure. STRK20 gives shielded, self-custodied, programmable spend that is *auditable on demand*.
3. **"What can the agent actually pay for privately — most sites don't take crypto?"** → Two distinct surfaces, and we're precise about which is private (see §4.5). The **private, on-theme** surface is **Starknet-native / STRK20-denominated services** (our own metered service in Layer A, plus any Starknet endpoint priced in STRK20 — the hero demo stands one up). The broader **x402 agent-web** (13k+ endpoints, ~$50M volume, backed by Coinbase/Cloudflare/Stripe/Visa) is real and large but settles in **transparent USDC on Base** — so it is agentic commerce, **not** payment privacy, and not Starknet. We may show it as a transparent breadth feature; we never call it private.
4. **"Isn't an anonymous paying agent an AML magnet?"** → §4: OFAC screening at deposit + auditor key + user viewing keys. Private by default, compliant by design.
5. **"How is this different from other agent-payment products?"** → The **anonymous browsing + shielded payment + MCP-native** combination is the moat — every competitor does at most one leg. Coinbase x402+AgentKit and **Paybox** (which is literally available in this environment) pay the agent-web but are **transparent and have no anonymous browsing**; Skyfire/Payman/Nevermined are **identity-first — the opposite of anonymity**; Railgun/Aztec/Nillion do payment privacy but are **middleware, not agent-browsing MCP products, and not on Starknet**. We claim novelty only on the *triple combination on Starknet*, never on any single axis.
6. **"Can you really ship on mainnet in 18 days given the prover dependency?"** → §8 contingency ladder. The realistic path is **wallet-delegated proving** — the Privacy Wallet API (starknet.js) lets a released wallet (**Ready/Argent X**, **Xverse**) do the proving, so we never run a Pathfinder node. Client-side proving is real (StarkWare's **S-two/Stwo** prover runs even on phones). Floor: a real shielded deposit+transfer on the shared mainnet pool through a wallet still satisfies "working mainnet product." We build on devnet meanwhile so we're never blocked.
7. **"If keys are client-side, how does auto-metering debit funds without you holding them?"** → **Ready/Argent session keys + SNIP-9 outside execution + AVNU paymaster.** The user grants a session key scoped by the Agent Wallet policy (per-site cap, domain allowlist, daily cap, expiry, kill switch); the agent transacts within those limits via meta-transaction, gaslessly; settlement is periodic against a **signed receipt** the user can verify. Nothing is spendable beyond the policy, and the root key never leaves the wallet. *(The standardized Session Keys SNIP is still a draft — we lean on Ready's shipped SDK, not the un-finalized SNIP.)*
8. **"Deposits and withdrawals are public — so where's the privacy?"** → Privacy is unlinkability within the anonymity set, not invisibility of the endpoints (§2, §6). "Address A deposited" and "address B was paid" are visible; "A funded B / user U paid service S" is not.
9. **"What exactly does the payee see?"** → For an external address: a `withdraw` — amount and recipient visible, **sender anonymous**. For a pool-native payee: a fully private `transfer` — nothing but their own note. We state which case a given demo uses.
10. **"What's the latency?"** → Seconds to a couple of minutes per settlement (§5). We meter off-chain and settle in batches, so the user never waits per action.

---

## 8. Mainnet contingency ladder (de-risking the 30% "working mainnet product")

Ordered best → floor. We climb as high as the available endpoints allow; even the floor satisfies the rule. **Self-hosting the Pathfinder-based Proving Service is off the table for 18 days — every plan below avoids it.**

- **Plan A — wallet-delegated proving (most likely).** Use the **Privacy Wallet API via starknet.js** against a released wallet — **Ready/Argent X** or **Xverse** — which performs viewing-key management *and proving* itself ("your app never touches a viewing key"). The same wallet gives us **session keys** for the Agent Wallet policy layer. Trade-off: it assumes a browser-extension wallet session, so for a headless server we drive the wallet's injected/programmatic API. Full private loop on mainnet, and it strengthens §3 (we never hold keys or prove).
- **Plan B — hosted prover/discovery endpoint.** Obtain a hosted mainnet **prover + discovery** URL + shared **pool address** from StarkWare via the **Proof of Privacy** program (proof.starknet.io) / builders group, and point the raw SDK at it. Best for a truly headless agent. *(No such public URL is documented — must be requested.)*
- **Plan C — client-side S-two proving.** StarkWare's **S-two/Stwo** prover generates proofs client-side (feasible even on phones); if we can run the SDK's prover crate against RPC-served state for our token/flow, we prove in-process without a full node. Higher integration risk; validate early.
- **Floor guarantee — minimal mainnet, honestly labeled.** A real shielded **deposit + private transfer** on the shared mainnet pool (via Plan A's wallet) — even if the full browsing loop demos on devnet — is a *working mainnet STRK20 product*. We never present devnet as mainnet: mainnet is labeled mainnet, devnet is labeled devnet.

---

## 9. What "bulletproof" changed in the design

Net hardening deltas folded back into `PLAN.md`:

1. Precise payment semantics: `deposit`=shield (public, screened), `transfer`=private send (pool-native), `withdraw`=external pay (sender-anonymous). No "invisible payments" language.
2. **The x402 correction (biggest delta):** "agent pays the open web" is **transparent USDC on Base**, not private and not Starknet. Privacy now rests on **Layer A + Starknet-native STRK20 payments (§4.5)**; the hero demo pays a STRK20-denominated Starknet endpoint, not an x402 one. x402 is at most an explicitly-transparent breadth feature.
3. **Wallet-delegated proving** (Ready/Xverse via the Privacy Wallet API) is the primary mainnet path — no self-hosted Pathfinder — and it *strengthens* operator-trust (keys + proving stay in the user's wallet).
4. **Agent Wallet policy = Ready session keys + SNIP-9 + AVNU paymaster** (not the draft Session Keys SNIP); resolves "auto-debit without custody."
5. **Client-side key custody + worker isolation** are core architecture — the answer to the operator-trust objection.
6. **Compliance surfaced as a feature** (screening + auditor + viewing keys), neutralizing the abuse objection and adding STRK20 depth.
7. **Canonical shared pool only** — anonymity-set discipline is a hard rule; **OHTTP on our own calls** extends operator-blinding to our infra.
8. **Scope honesty:** private payable surface = Starknet/STRK20-native services (§4.5), not "any website"; logged-in browsing is explicitly out of scope; devnet is never presented as mainnet.
9. **Moat confirmed:** novelty is the anonymous-browsing + shielded-payment + MCP triple on Starknet — never claimed on a single axis (nearest neighbors: Coinbase x402+AgentKit, Paybox — both transparent, neither anonymous).

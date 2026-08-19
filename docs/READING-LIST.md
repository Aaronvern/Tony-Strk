# Tony Stark — Reading List

A guided path to understand the product and the tech behind it. Read top-to-bottom to build the model in order; each link says *what you'll get* from it. If you only have 20 minutes, read the four ⭐ items.

---

## 0. Our own docs (read these first — they tie everything together)

- **`docs/PLAN.md`** — the whole product: what it is, architecture, 18-day plan, scope, risks, and why we win. ⭐
- **`docs/THREAT-MODEL.md`** — the adversarial hardening: who can deanonymize the user and how we stop them, a precise "what's private vs. visible" table, and the 10 hard questions a judge will ask (with answers). ⭐

---

## 1. The hackathon (what we're entering)

- **STRK20 Private Sprint — hackathon page** — https://strk20.starknet.io/hackathon
  *The rules, timeline (ends Aug 31), and prizes. Note: it's a JS app; the concrete rules live in the StarkWare thread below.*
- **The announcement thread (rules + judging)** — https://x.com/StarkWareLtd/status/2087909823425773957
  *18 days, $5k, ship on mainnet, judged 30% STRK20 depth / 30% working mainnet / 25% innovation / 15% docs.*
- **Proof of Privacy accelerator** — https://proof.starknet.io/
  *Where to request hosted proving/discovery infra and the follow-on program after the hackathon.*

## 2. The core concept — STRK20 privacy (the heart of the product) ⭐

- **Make all ERC-20 tokens private with STRK20** — https://www.starknet.io/blog/make-all-erc-20-tokens-private-with-strk20/
  *The clearest "what is STRK20": shielded balances + private transfers for any ERC-20, via ZK. Start here.* ⭐
- **Privacy is now live on Starknet** — https://www.starknet.io/blog/privacy-live-on-starknet/
  *The launch: what shipped, shielded vs. transparent modes, strkBTC.*
- **Push to Private: the privacy stack is open for builders** — https://www.starknet.io/blog/push-to-private/
  *The builder tools: the Privacy SDK and the Privacy Wallet API (the wallet-delegated path we rely on for mainnet).*
- **How crypto approaches privacy today** — https://www.starknet.io/blog/how-crypto-approaches-privacy-today/
  *Background on the privacy landscape and where STRK20 fits.*

## 3. Why an *agent* — this product is StarkWare's own idea #11

- **11 things you can build with STRK20** — https://www.starknet.io/blog/11-things-you-can-build-with-strk20-on-starknet/
  *#11 is "Private AI Agent Payments" + "Agent Wallets" — literally our product, in their words.* ⭐
- **Private USDC features on Starknet** — https://www.starknet.io/blog/privacy-features-for-usdc-on-starknet/
  *Confidential stablecoin payments; lists "agent flows" as a headline use case.*

## 4. How it's actually built (the SDK + how-to)

- **starknet-privacy (the protocol + TypeScript SDK)** — https://github.com/starkware-libs/starknet-privacy
  *The real code: the Cairo privacy pool, the TS SDK (`deposit`/`transfer`/`withdraw`), and the architecture diagram (SDK → prover → discovery → pool).*
- **STRK20 by Example** — https://strk20-by-example.org/
  *Runnable recipes: private transfers, proving config, discovery providers, and the Starknet Wallet API overview. Your day-to-day reference.* ⭐
- **AVNU Paymaster (gasless private fees)** — https://github.com/avnu-labs/paymaster · docs https://docs.out-of-gas.xyz
  *The `sponsored_private` fee mode that makes shielded txs gasless without deanonymizing.*
- **Private swaps live on AVNU (the app)** — https://app.avnu.fi/en
  *See STRK20 privacy working in a shipped product.*

## 5. The privacy mechanics (the "how is it actually private" concepts)

- **S-two / Stwo prover is live on mainnet** — https://www.starknet.io/blog/s-two-is-live-on-starknet-mainnet-the-fastest-prover-for-a-more-private-future/
  *Why proving can happen client-side (even on phones) — the basis for not needing our own datacenter node.*
- **Oblivious HTTP (OHTTP), RFC 9458** — https://www.rfc-editor.org/rfc/rfc9458
  *The standard the SDK uses so the proving/discovery operator can't link your IP to your activity. Underpins our "we can't profile you either" claim.*
- **Model Context Protocol (MCP)** — https://modelcontextprotocol.io
  *What "remote MCP server" means — the interface any AI agent (Claude, Cursor) plugs into to get our browse/pay tools.*

## 6. The agent-payable web — x402 (important context: this part is *transparent*)

- **x402 (Coinbase)** — https://github.com/coinbase/x402 · overview https://www.coinbase.com/developer-platform/discover/launches/x402
  *The HTTP-402 machine-payment standard. Big and real — but settles in transparent USDC on Base, so it is NOT our privacy rail (see THREAT-MODEL §4.5).*
- **x402 Bazaar (the live endpoint directory)** — https://www.x402bazaar.org/ · https://docs.cdp.coinbase.com/x402/bazaar
  *13k+ payable endpoints — useful to understand the agent-commerce landscape we sit next to.*
- **awesome-x402** — https://github.com/xpaysh/awesome-x402
  *A catalog of x402 tooling and services.*

## 7. The Agent Wallet — spend policy & session keys (Starknet primitives)

- **Session keys on Starknet** — https://www.starknet.io/blog/session-keys-on-starknet-unlocking-gasless-secure-transactions/
  *The concept behind our `policy` tool: delegated keys with spend caps, allowlists, and expiry.*
- **SNIP-9: Outside Execution** — https://github.com/starknet-io/SNIPs/blob/main/SNIPS/snip-9.md
  *Meta-transactions — how an agent/relayer submits pre-authorized calls. Base for gasless, policy-bounded spending.*
- **Session Keys SNIP (draft)** — https://community.starknet.io/t/snip-session-keys-for-smart-accounts/116131
  *The (still-draft) standard with a SpendingPolicyComponent — caps, call limits, kill switch. We lean on Ready's shipped SDK, not this, for now.*
- **Paymaster in starknet.js** — https://starknetjs.com/docs/guides/account/paymaster/
  *How to wire gasless transactions in code.*

## 8. The competition (to see why our combination is novel)

- **Coinbase Agentic Wallets** — https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets
  *Closest on agent-commerce + spend caps — but transparent, no anonymous browsing.*
- **Skyfire vs Payman vs Nevermined (comparison)** — https://nevermined.ai/blog/stripe-vs-skyfire-vs-nevermined
  *Agent-payment infra that is identity-first — the opposite of our anonymity-first stance.*
- **Railgun (privacy infrastructure for DeFi)** — https://messari.io/report/railgun-privacy-infrastructure-for-defi
  *Real payment privacy — but middleware, not an agent-browsing MCP product, and not on Starknet.*

---

### The 20-minute fast path
1. `docs/PLAN.md` (ours) → 2. "Make ERC-20s private with STRK20" → 3. "11 things you can build" (#11) → 4. skim "STRK20 by Example". That's enough to hold the whole idea in your head.

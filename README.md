# Tony Stark 🥷

**An AI agent that browses and pays for the web — without anyone being able to trace it back to you.**

> The web sees the suit. Nobody sees the man inside.

A **remote MCP server** that gives any AI agent (Claude, Cursor, …) two powers:

1. **Browse anonymously** — a cloud headless browser that exits through Tor, so sites never see your IP, device, or identity.
2. **Pay anonymously** — a private wallet settling in **shielded STRK20** on Starknet, so neither the chain, the payee, nor the operator can link a payment to you.

Built for the [**STRK20 Private Sprint**](https://strk20.starknet.io/hackathon) — StarkWare's privacy hackathon. This is their own suggested build **#11: Private AI Agent Payments** ("agents pay for APIs, compute and services without turning every payment into a public workflow map").

---

## The problem

AI agents are starting to spend money on your behalf. Today that means every purchase an agent makes is either tied to your card (KYC'd, surveilled, issuer sees everything) or to a transparent on-chain wallet (public balance, public spend graph, forever). Meanwhile the agent browses the web from an IP that identifies you.

So the more autonomous your agent becomes, **the more of your life becomes a public log.**

Tony Stark makes agent activity private by default — and auditable *only* by you.

---

## How it works

```
   AI agent (MCP client)
            │
            ▼
   ┌──────────────────────┐
   │  Tony Stark server   │   browse · extract · balance · topup · pay · reveal
   └──────────┬───────────┘
       ┌──────┴───────┐          ← the two halves share NO identifier
       ▼              ▼
 Browser worker   Payment worker
  Playwright       STRK20 shielded
  + Tor            pool (ZK-STARK)
       │              │
       ▼              ▼
   the website    Starknet mainnet
```

**One task, end to end:** the agent asks to browse → a fresh worker spawns on a new Tor circuit → the site sees a Tor exit, not you → the page demands payment → the payment worker builds a shielded intent → **your wallet** proves and signs it client-side → it settles gaslessly through the AVNU paymaster → content returns → metering is debited off-chain and settled in batches, so timing can't be correlated.

At no point does any single party hold both halves of the link.

---

## Privacy model

A user can be traced through **five independent channels**. You're only as private as the leakiest one:

| # | Channel | Closed by |
|---|---------|-----------|
| 1 | **Network** (IP, TLS fingerprint) | Tor egress, fresh circuit per task |
| 2 | **Browser** (fingerprint, cookies) | ephemeral hardened Playwright, no logins, no persistence |
| 3 | **On-chain** (balance, amounts, graph) | STRK20 shielded pool — ZK-STARK notes |
| 4 | **The on-ramp** (public deposit) | shared canonical pool's anonymity set, time-separated |
| 5 | **The operators** (incl. *us*) | OHTTP, client-side keys, worker isolation, self-hostable |

**What we claim:** no single party — website, chain, payee, service operator, or us — can attribute this activity to you, and isolation plus timing decoupling stop them from combining forces.

**What we don't claim:** that deposits/withdrawals are invisible on-chain, that a payee can't see an amount, or that logged-in browsing is anonymous. Full detail, including the residual risks, in [`docs/THREAT-MODEL.md`](docs/THREAT-MODEL.md).

### Private by default, compliant by design

Not a mixer. STRK20 screens every deposit against sanctions lists before a proof is issued, the pool carries a governance-set auditor key, and **you** hold a viewing key to reveal your own history to an accountant or auditor whenever you choose.

---

## STRK20 integration

| Capability | Mechanism |
|---|---|
| Shield / unshield | `deposit` / `withdraw` pool actions |
| Private payment | `transfer` (pool-native: fully private) · `withdraw` (external: sender-anonymous) |
| Private balance | `strk20Balances` — balance held inside the pool |
| ZK proving | `strk20PrepareInvoke` → SNIP-36 proof, generated **client-side by the user's wallet** |
| Gasless + fee privacy | AVNU paymaster, `sponsored_private` — the fee is paid *from inside the pool* |
| Selective disclosure | viewing keys (`reveal`) |
| Operator blinding | OHTTP (RFC 9458) on proving + discovery |

---

## Status

Building in public, daily. Honest state:

- [x] Feasibility spikes — toolchain, SDK, hosted infra all verified ([`docs/SPIKE-RESULTS.md`](docs/SPIKE-RESULTS.md))
- [x] **Headless STRK20 wallet API proven** — all four privacy methods driven from pure Node, no browser
- [x] Live hosted prover + discovery verified (OHTTP key matches the SDK repo's pinned config)
- [ ] Shielded deposit + private transfer on Sepolia
- [ ] MCP server + `balance` / `topup`
- [ ] Payment loop + STRK20 paywall + gasless settlement
- [ ] Anonymous browsing worker
- [ ] **Mainnet**
- [ ] Viewing-key `reveal`

Nothing here is presented as working before it is. Devnet is never shown as mainnet.

---

## Quickstart

```bash
nvm use            # Node 24 (required by ohttp-ts)
npm install
```

Requires `starknet@10.7.0` or later — npm's `latest` tag currently resolves to 10.0.2, which predates the STRK20 API.

---

## Docs

| Doc | What's in it |
|---|---|
| [`PLAN.md`](docs/PLAN.md) | the product, architecture, scope, 18-day plan |
| [`PRIVACY-STACK.md`](docs/PRIVACY-STACK.md) | how it's private — the five channels, in depth |
| [`THREAT-MODEL.md`](docs/THREAT-MODEL.md) | adversaries, precise claims, the hard questions answered |
| [`SPIKE-RESULTS.md`](docs/SPIKE-RESULTS.md) | what we verified first-hand, with evidence |
| [`BUILD-STEPS.md`](docs/BUILD-STEPS.md) | step-by-step build guide |
| [`READING-LIST.md`](docs/READING-LIST.md) | annotated background reading |

## Built on

[STRK20](https://www.starknet.io/blog/make-all-erc-20-tokens-private-with-strk20/) · [starknet-privacy](https://github.com/starkware-libs/starknet-privacy) · [starknet.js](https://starknetjs.com) · [AVNU Paymaster](https://github.com/avnu-labs/paymaster) · [OHTTP](https://www.rfc-editor.org/rfc/rfc9458) · [MCP](https://modelcontextprotocol.io) · Playwright · Tor

## License

Apache-2.0

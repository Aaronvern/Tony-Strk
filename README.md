# Tony Strk

**Anonymous browsing and private payments for AI agents.**

When you send an agent out to do something on the web, it goes as you. Your IP, your card, your wallet. Every site it visits and everything it buys gets attributed back to you, in logs you don't control.

Tony Strk's active MCP server is **local-only**. It fetches public HTTP(S)
URLs through Tor for any MCP client (Claude, Cursor, …).

> The web sees the suit. Nobody sees the man inside.

1. **Browse** — a Tor-routed HTTP fetcher. Sites see an exit relay, not your IP or your device.
2. **Pay** — an experimental STRK20 testnet path. The local process keeps its key in the macOS Keychain.

You need both. An agent that browses anonymously and then pays from a wallet with a public history has just leaked everything it spent the last ten minutes protecting.

Built for the [**STRK20 Private Sprint**](https://strk20.starknet.io/hackathon) — StarkWare's privacy hackathon. This is their own suggested build [**#11: Private AI Agent Payments**](https://www.starknet.io/blog/11-things-you-can-build-with-strk20-on-starknet/) — *"Agent wallets and autonomous payment flows are already starting to appear. The privacy side is the part that still needs to be built."*

---

## The problem

AI agents are starting to spend money on your behalf. Today that means every purchase an agent makes is either tied to your card (KYC'd, surveilled, issuer sees everything) or to a transparent on-chain wallet (public balance, public spend graph, forever). Meanwhile the agent browses the web from an IP that identifies you.

So the more autonomous your agent becomes, **the more of your life becomes a public log.**

The active server makes public, logged-out HTTP fetching private from the destination at the IP layer. The broader payment design is still experimental.

---

## How it works

```
   AI agent (MCP client)
            │
            ▼
   ┌──────────────────────┐
   │  Tony Stark server   │   browse · optional pay
   └──────────┬───────────┘
       ┌──────┴───────┐
       ▼              ▼
 Tor HTTP fetcher  Opt-in wallet path
       │            STRK20 shielded
       │            pool (ZK-STARK)
       │              │
       ▼              ▼
   the website    STRK20 pool
```

**What works now:** the agent asks to browse → the loopback-only server validates a public URL → a stateless HTTP request goes through Tor → the site sees a Tor exit instead of the host IP → the server returns a bounded text response. There is no browser worker, persistent browsing session, or direct-network fallback.

`pay` is an experimental local path. It cannot spend until you create, fund, and deploy the local wallet.

---

## Privacy model

A user can be traced through **five independent channels**. You're only as private as the leakiest one:

| # | Channel | Closed by |
|---|---------|-----------|
| 1 | **Network** (IP) | Tor egress for stateless public HTTP fetches |
| 2 | **Fetch state** (cookies, persistence) | No browser session, cookie jar, or login support |
| 3 | **On-chain** (balance, amounts, graph) | STRK20 shielded pool — ZK-STARK notes |
| 4 | **The on-ramp** (public deposit) | shared canonical pool's anonymity set, time-separated |
| 5 | **The operator** | Local-only, self-hosted process; OHTTP relay/gateway is not configured |

**What the active server claims:** a public destination sees Tor egress rather than the host IP, and browsing state is not persisted by the app. It does not promise a fresh Tor circuit per request, browser-fingerprint uniformity, operator blinding, or anonymous logged-in browsing.

**What we don't claim:** that deposits/withdrawals are invisible on-chain, that a payee can't see an amount, or that logged-in browsing is anonymous. Current guarantees and residual risks are in [`docs/PRIVACY-STACK.md`](docs/PRIVACY-STACK.md).

### Private by default, compliant by design

Not a mixer. STRK20 screens every deposit against sanctions lists before a proof is issued, the pool carries a governance-set auditor key, and **you** hold a viewing key to reveal your own history to an accountant or auditor whenever you choose.

---

## STRK20 integration

| Capability | Mechanism |
|---|---|
| Shield / unshield | `deposit` / `withdraw` pool actions |
| Private payment | `transfer` (pool-native: fully private) · `withdraw` (external: sender-anonymous) |
| Private balance | `strk20Balances` — balance held inside the pool |
| ZK proving | The experimental local path uses the hosted prover; client-side wallet proving is future architecture |
| Submission + fee privacy | AVNU paymaster — **the only way a server-side agent can submit a proven transaction**; `sponsored_private` also pays the fee *from inside the pool* |
| Selective disclosure | viewing keys at the protocol layer; `reveal` is not implemented in the active server |
| Operator blinding | Not configured; it requires a real OHTTP relay/gateway deployment |

---

## Status

Building in public, daily. Honest state:

**The active local server keeps payments disabled by default.** It exposes the wallet steps first. It can pay only after the local wallet is ready.

- [x] Feasibility spikes — toolchain, SDK, hosted infra all verified ([`docs/SPIKE-RESULTS.md`](docs/SPIKE-RESULTS.md))
- [x] Responsive Web2 demo with an honest, local-only route preview
- [x] **Headless STRK20 wallet API proven** — all four privacy methods driven from pure Node, no browser
- [x] Live hosted prover + discovery verified; advertised OHTTP key matches the SDK repo's pinned config (availability only, not local configuration)
- [x] Privacy pool addresses recovered and verified on-chain, both networks
- [x] **Anonymous browsing proven end-to-end** — local MCP → Tor returns `{"IsTor":true}` from the Tor Project's own API
- [x] Sepolia account funded (faucet script) and **deployed** — can sign
- [x] **Real ZK proof from StarkWare's hosted prover** — `apply_actions`, proof facts present
- [x] **Submission via the AVNU paymaster** — proven transaction accepted on-chain
- [x] 🎉 **Shielded deposit landed, sanctions screening passed** — [`0x3e74d5…`](https://sepolia.starkscan.co/tx/0x3e74d521285a305781153653c71f785f386acb10b409dcb60e2178a32489349)
- [ ] Private transfer ← *next (pool is funded)*
- [ ] MCP server + `balance` / `topup`
- [ ] Payment loop + STRK20 paywall + gasless settlement
- [ ] Anonymous browsing worker
- [ ] **Mainnet**
- [ ] Viewing-key `reveal`

Nothing here is presented as working before it is. Devnet is never shown as mainnet.

---

## Layout

Two packages, on purpose:

| | | |
|---|---|---|
| `server/` | the MCP server | Express, local-only, with a Tor HTTP fetcher |
| `web/` | the landing page | Next.js, static, on Vercel |

TypeScript runs directly on Node 24's type stripping, so there is no build step for the server.

## Quickstart

```bash
nvm use            # Node 24 (required by ohttp-ts, and for running .ts directly)
npm install
npm run setup      # builds the privacy SDK from source (not on npm)

TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server
                       # the local MCP server on http://127.0.0.1:8787/mcp
npm run dev            # the landing page
npm test

npm run verify:mcp        # drive the running MCP server with a real MCP client
npm run spike:services    # verify every external dependency is live
npm run spike:wallet      # drive the STRK20 wallet API headlessly
```

## Connect an AI Agent

Start Tor and the local server before you add an MCP client.

```bash
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server
```

Add the local server to Codex.

```bash
codex mcp add tony-strk --url http://127.0.0.1:8787/mcp
```

Add the local server to Claude Code.

```bash
claude mcp add --scope user --transport http tony-strk http://127.0.0.1:8787/mcp
```

Both clients use the same loopback-only server. No API key is required.

The `browse` tool is available after the server starts. The `pay` tool reports the next wallet step until the wallet is ready.

Read [`docs/LOCAL_MCP_WORK.md`](docs/LOCAL_MCP_WORK.md) for the full local setup and limits.

### Prepare Automatic Payments

Run this command once on macOS. It creates the wallet and saves the AVNU key in the macOS Keychain.

```bash
npm run wallet:setup
```

The script asks for the AVNU key only if it is not already in Keychain.

You can also run the two setup steps separately.

```bash
npm run wallet:create
```

The command prints a public Sepolia account address. Fund this address with test STRK.

Then call `wallet_status` through Codex or Claude Code. When it reports `needs_deployment`, call `wallet_deploy`.

The private key and privacy passphrase stay in the macOS Keychain. The MCP client never receives them.

Get an AVNU key from [AVNU](https://portal.avnu.fi). Then run `npm run paymaster:set` and paste it in your terminal.

After `wallet_status` reports `ready`, the local agent can call `pay` automatically.

Requires `starknet@10.7.0` or later — npm's `latest` tag currently resolves to 10.0.2, which predates the STRK20 API.

### Scripts

| Script | Purpose |
|---|---|
| `server/verify-mcp.mjs` | connects a real MCP client to the running server and proves `browse` exits through Tor |
| `scripts/spikes/check-services.mjs` | verifies prover, discovery, advertised OHTTP keys, pool contracts on-chain, and that discovery serves our pool (with a control) |
| `scripts/spikes/mock-wallet-spike.mjs` | proves the STRK20 wallet API works headlessly — no browser |
| `scripts/faucet.mjs` | funds a Sepolia address (proof-of-work gated, no auth) |
| `scripts/deploy-account.mjs` | deploys a counterfactual Ready/Argent account |
| `scripts/create-sepolia-wallet.mjs` | creates the Keychain-backed local Sepolia wallet |
| `scripts/set-avnu-key.mjs` | saves the AVNU paymaster key in the macOS Keychain |
| `scripts/setup-local-wallet.sh` | runs the local wallet and paymaster setup |

No `.env` is required for the local wallet. The gitignored root `.env` can hold non-secret network settings. **Use testnet funds only.**

## Verify it yourself

Don't take the claims on trust:

```bash
# every dependency is live, and discovery really serves our pool
npm run spike:services

# the destination confirms the local MCP server exits through Tor
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server
# in another terminal
npm run verify:mcp
# → {"IsTor":true,"IP":"<a Tor exit>"}
```

---

## Docs

**New here? Read [`docs/START-HERE.md`](docs/START-HERE.md)** — the product, the technical core, current state, and how to get running, in about ten minutes.

Read [`docs/LOCAL_MCP_WORK.md`](docs/LOCAL_MCP_WORK.md) for a plain English record of the local MCP work and its limits.

| Doc | What's in it |
|---|---|
| [`START-HERE.md`](docs/START-HERE.md) | ⭐ onboarding — read this first |
| [`local-mcp-hardening-design.md`](docs/superpowers/specs/2026-08-21-local-mcp-hardening-design.md) | current local architecture and security boundaries |
| [`PRIVACY-STACK.md`](docs/PRIVACY-STACK.md) | current guarantees, planned layers, and residual leaks |
| [`PLAN.md`](docs/PLAN.md) | archived remote MCP + Obscura proposal — superseded |
| [`THREAT-MODEL.md`](docs/THREAT-MODEL.md) | archived threat model for the superseded proposal |
| [`SPIKE-RESULTS.md`](docs/SPIKE-RESULTS.md) | what we verified first-hand, with evidence |
| [`BUILD-STEPS.md`](docs/BUILD-STEPS.md) | step-by-step build guide |
| [`READING-LIST.md`](docs/READING-LIST.md) | annotated background reading |

## Team

Built by [Prathamesh Bhatkhande](https://github.com/prathadox) and [Aaronvern](https://github.com/Aaronvern) for the STRK20 Private Sprint.

## Built on

[STRK20](https://www.starknet.io/blog/make-all-erc-20-tokens-private-with-strk20/) · [starknet-privacy](https://github.com/starkware-libs/starknet-privacy) · [starknet.js](https://starknetjs.com) · [AVNU Paymaster](https://github.com/avnu-labs/paymaster) · [MCP](https://modelcontextprotocol.io) · Tor

## License

Apache-2.0

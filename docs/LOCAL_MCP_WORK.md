# Local MCP Work

## Purpose

This document records the active local MCP server and its STRK20 x402 payment
path. The server is loopback-only. Browsing uses Tor, and payment is explicit:
the local wallet must be ready, a helper must be named in
`PAYWALL_ANONYMIZER_ADDRESS`, and the user must choose to call a payment tool.

## What Works Now

1. The MCP server exposes Streamable HTTP at `127.0.0.1:8787/mcp`.

2. The `browse` tool accepts public HTTP(S) URLs and fetches them through the
   configured Tor SOCKS proxy.

3. The tool stops if Tor is not available.

4. The tool rejects local, private, metadata, multicast, and reserved addresses.

5. The tool repeats these address checks after each redirect.

6. The tool limits a response to 1 MiB and stops after five redirects.

7. The local wallet saves its private key and passphrase in the macOS Keychain.

8. The `wallet_status` tool tells the agent when it must create, fund, deploy,
   or configure the paymaster for the local wallet.

9. The `wallet_shield` tool deposits public Sepolia test STRK into the STRK20
   pool and reports the receipt and conservative `spendableAfterBlock`.

10. The `pay` tool sends a chosen amount to a Starknet address from the shielded
    pool; `pay_paywall` handles the strict x402 v2 402 → payment → retry flow.

11. The payer verifies the merchant's helper, asset, resource, network, and
    price ceiling before generating a proof. The merchant verifies the public
    `PaywallPaid` receipt before serving protected content.

12. `verify:x402` checks the live MCP, Tor, tool registration, and wallet status
    without spending by default. Its `--live` mode is opt-in.

## What Does Not Work Yet

1. An independent OHTTP relay and gateway are not configured. Direct OHTTP
   encryption is not operator blinding.

2. The active fetcher is not a browser. It has no JavaScript execution, login
   support, cookie storage, or fresh Tor circuit guarantee per request.

3. The guided x402 payment flow is Sepolia-only. Mainnet pool operations are a
   separate capability; do not present them as mainnet paywall settlement.

4. A live paywall run needs a public HTTPS merchant URL. Tor cannot reach the
   merchant's loopback listener, and the MCP URL policy correctly rejects it.

## Run the Local Server

1. Install Node.js 24 and Tor. The privacy SDK requires Node 24.

2. Start Tor on the SOCKS URL used below, normally `127.0.0.1:9050`.

3. Run this command from the project root.

```sh
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server
```

4. In another terminal, run this command.

```sh
npm run verify:mcp
```

The result must include `"IsTor":true`.

## Connect Codex or Claude Code

Start Tor and the local server before you add an MCP client.

```sh
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server
```

Add the server to Codex.

```sh
codex mcp add tony-strk --url http://127.0.0.1:8787/mcp
```

Add the server to Claude Code.

```sh
claude mcp add --scope user --transport http tony-strk http://127.0.0.1:8787/mcp
```

Both clients connect to the same local endpoint. No API key is required for
the MCP endpoint itself.

## Prepare the Local Wallet

Run the following lifecycle in order:

1. Run `npm run wallet:setup` on macOS. It creates the wallet and stores the
   AVNU paymaster key in Keychain when needed.

2. Fund the printed Sepolia address with public test STRK. The first shield
   must cover the desired private balance and the current pool fee.

3. Call `wallet_status` from Codex or Claude Code. When the state is
   `needs_deployment`, call `wallet_deploy`.

4. If the paymaster state is still missing, obtain an AVNU key from the AVNU
   portal and run `npm run paymaster:set`.

5. When `wallet_status` reports `ready`, call `wallet_shield` with a positive
   decimal amount. It does not pay a merchant automatically.

6. Wait for the returned `spendableAfterBlock`. A new deployment, top-up, or
   private note needs 12 blocks of maturity before the next proof.

7. Set `PAYWALL_ANONYMIZER_ADDRESS` to a helper contract you have chosen to
   trust, then start the MCP server with the configured Tor proxy.

The pool fee is read from the external stack and must not be hardcoded in a UI.
Wallet and API credentials stay in Keychain; transaction hashes, block numbers,
and explorer URLs are the public setup outputs.

## Run the Merchant and x402 Flow

The merchant is a separate HTTP service. Start it with proxy trust enabled,
then expose its loopback port through a temporary Cloudflare Quick Tunnel.

```sh
MERCHANT_TRUST_PROXY=1 npm run start:merchant
cloudflared tunnel --url http://127.0.0.1:8788
```

Use the tunnel's public `https://` URL for the real MCP flow. The
`MERCHANT_TRUST_PROXY=1` setting keeps that public origin in the merchant's
advertised x402 resource, so the payer's resource check succeeds.

The standalone payer is a different, direct localhost path. It is useful for a
dry rehearsal but does not exercise the MCP's public-URL and Tor boundary:

```sh
npm run pay:paywall -- http://127.0.0.1:8788/article/agent-privacy --dry
```

The real agent path uses `pay_paywall` through MCP with the public HTTPS URL.
Run the verifier first; add `--live` only when the wallet is ready and the
shielded note is mature.

```sh
npm run verify:x402 -- --url https://PUBLIC_HOST/article/agent-privacy
npm run verify:x402 -- --url https://PUBLIC_HOST/article/agent-privacy --live
```

## Do the Checks

1. Run `npm test`. This runs the web, server, and merchant deterministic tests.

2. Run `npm run build`. This builds the static web application.

3. Run `npm run build:contracts`. This compiles the Cairo contract. It does not
   deploy the contract.

4. Run `npm run verify:mcp` while the local server is active. This calls the Tor
   Project endpoint through MCP.

5. Run `npm run verify:x402 -- --url https://PUBLIC_HOST/article/agent-privacy` for a no-spend
   preflight, or append `--live` for an opt-in Sepolia payment.

## Code References

1. [MCP server startup](../server/src/index.ts) loads local settings and starts
   the loopback server.

2. [Browse policy](../server/src/tools/url-policy.ts) blocks unsafe target
   addresses.

3. [Browse tool](../server/src/tools/browse.ts) handles redirects, timeouts,
   response size limits, and x402 response headers.

4. [Tor fetcher](../server/src/tor/tor-fetch.ts) sends each approved request
   through the Tor SOCKS proxy.

5. [Wallet lifecycle](../server/src/pay/wallet-manager.ts) creates, deploys,
   shields, and reports note maturity.

6. [Payment gate](../server/src/mcp/server.ts) registers `pay_paywall` only
   when a trusted anonymizer is configured.

7. [Live x402 check](../server/verify-x402.mjs) proves the MCP/Tor preflight and
   optionally spends test STRK against a public merchant URL.

8. [Local design](superpowers/specs/2026-08-21-local-mcp-hardening-design.md)
   states the active security boundary.

## External References

1. [Model Context Protocol](https://modelcontextprotocol.io) defines the tool
   protocol.

2. [Tor Project check](https://check.torproject.org/api/ip) reports whether the
   request used a Tor exit.

3. [OHTTP RFC 9458](https://www.rfc-editor.org/rfc/rfc9458) defines Oblivious
   HTTP.

4. [StarkWare Privacy SDK](https://github.com/starkware-libs/starknet-privacy/blob/main/sdk/README.md)
   describes relay URLs and pinned public key configuration.

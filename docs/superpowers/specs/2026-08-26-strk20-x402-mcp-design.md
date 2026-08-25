# STRK20 x402 MCP setup and verification

**Date:** 2026-08-26
**Status:** approved for implementation

## Goal

Make the existing local MCP server pay an HTTP x402 paywall end to end with
shielded STRK through STRK20, document the complete setup at `/setup`, and leave
both deterministic and live verification commands behind.

The first live target is Starknet Sepolia. It uses real contracts, proofs,
paymaster submission, receipts, and test STRK. Mainnet is not represented as
complete until the headless MCP has a working mainnet prover route and the
paywall helper is deployed and verified there.

## Current state

The repository already has the important pieces:

- a loopback-only Streamable HTTP MCP server;
- Tor-only public URL fetching with SSRF and redirect guards;
- a Keychain-backed local Starknet account;
- STRK20 SDK proving and AVNU `sponsored_private` submission;
- a `pay_paywall` MCP tool that builds `withdraw + invoke` actions;
- a merchant that verifies `PaywallPaid` from a Starknet receipt; and
- a deployed Sepolia paywall anonymizer.

The gaps are product gaps rather than a missing payment primitive:

1. The HTTP exchange uses an x402-like v1 JSON body and `X-Payment`, not the
   canonical x402 v2 wire format.
2. The MCP wallet can pay only after somebody else has shielded funds; it has
   no setup tool for that step.
3. The web app still says settlement is future work and has no setup page.
4. Tests cover each component but not one complete MCP-to-merchant flow.
5. The live verifier proves Tor browsing only, not paid access.

## Scope

### Included

- x402 v2 HTTP headers and objects for a custom STRK20 settlement scheme;
- the existing two-leg STRK20 paywall transaction;
- a `wallet_shield` MCP tool for the local wallet;
- a static, accessible `/setup` page and corrected landing-page claims;
- deterministic full-stack tests without spending funds;
- an opt-in verifier that spends test STRK against a public merchant URL; and
- concise README and environment documentation.

### Excluded

- Coinbase/Base `exact` settlement;
- a hosted facilitator, because the merchant verifies Starknet directly;
- self-hosting a mainnet prover;
- browser access to the macOS Keychain or local MCP secrets;
- automatic faucet, account funding, or AVNU account creation;
- weakening the public-URL policy to let Tor fetch localhost; and
- a new UI framework or component library.

## Architecture

```text
MCP client
    |
    | tools/call pay_paywall(url)
    v
local Tony Strk MCP
    |
    | GET through Tor
    v
public merchant URL
    |
    | 402 + PAYMENT-REQUIRED
    v
local STRK20 wallet
    |
    | prove and submit withdraw + privacy_invoke
    v
STRK20 pool -> paywall anonymizer -> merchant address
    |
    | PaywallPaid event
    v
merchant verifies receipt
    |
    | 200 + PAYMENT-RESPONSE + protected content
    v
MCP client
```

The MCP remains local and holds its spending key in macOS Keychain. The
merchant remains a separate HTTP service and learns only the public settlement
receipt. Proving and discovery calls use the existing configured services. Tor
protects the merchant request; OHTTP remains opt-in and is not overclaimed.

## x402 v2 custom scheme

The scheme is `strk20-anonymizer`. It is an x402 custom scheme with
`paymentFlow: "upfront"`: the client commits the payment on Starknet before the
merchant serves the protected resource. It is deliberately not `exact`, whose
standard Starknet authorization path identifies a payer.

### Payment required

An unpaid request receives HTTP 402 with a standard-base64-encoded JSON object
in the `PAYMENT-REQUIRED` header. The response body contains the same JSON for
humans, logs, and clients that surface the body.

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://merchant.example/article/agent-privacy",
    "description": "The article title",
    "mimeType": "text/html",
    "serviceName": "Ledger & Lantern",
    "tags": ["privacy", "research"]
  },
  "accepts": [{
    "scheme": "strk20-anonymizer",
    "network": "starknet:SN_SEPOLIA",
    "amount": "25000000000000000",
    "asset": "0x04718f...",
    "payTo": "0x4d4552...",
    "maxTimeoutSeconds": 600,
    "extra": {
      "assetTransferMethod": "strk20-privacy-invoke",
      "paymentFlow": "upfront",
      "anonymizer": "0x0767a1...",
      "resourceHash": "0x..."
    }
  }],
  "extensions": {}
}
```

The MCP decodes this header, selects only `strk20-anonymizer`, and applies the
existing trust-list, asset, resource, address, and price-ceiling checks before
loading a wallet or generating a proof. A JSON body is not trusted in place of
the canonical header.

### Payment signature

After the transaction is broadcast, the MCP retries the same URL with a
base64-encoded `PaymentPayload` in `PAYMENT-SIGNATURE`:

```json
{
  "x402Version": 2,
  "resource": {
    "url": "https://merchant.example/article/agent-privacy",
    "description": "The article title",
    "mimeType": "text/html",
    "serviceName": "Ledger & Lantern",
    "tags": ["privacy", "research"]
  },
  "accepted": {
    "scheme": "strk20-anonymizer",
    "network": "starknet:SN_SEPOLIA",
    "amount": "25000000000000000",
    "asset": "0x04718f...",
    "payTo": "0x4d4552...",
    "maxTimeoutSeconds": 600,
    "extra": {
      "assetTransferMethod": "strk20-privacy-invoke",
      "paymentFlow": "upfront",
      "anonymizer": "0x0767a1...",
      "resourceHash": "0x..."
    }
  },
  "payload": { "transactionHash": "0x..." },
  "extensions": {}
}
```

`transactionHash` is the documented scheme-specific payload field;
`transaction` remains the standard settlement-response field. The merchant
rejects malformed base64, the wrong x402 version, a mismatched resource or
accepted requirement, a reused receipt, or a receipt without the expected
`PaywallPaid` event. It compares felts numerically, as the current receipt
verifier already does.

### Payment response

On success, the merchant returns the protected content and a base64-encoded
settlement response in `PAYMENT-RESPONSE`:

```json
{
  "success": true,
  "transaction": "0x...",
  "network": "starknet:SN_SEPOLIA",
  "amount": "25000000000000000"
}
```

`payer` is omitted by design: the merchant cannot derive it from the private
pool transaction. Existing access tokens remain a merchant-specific convenience
for repeat reads, separate from the x402 settlement response.

While the transaction is not yet readable, the merchant remains at HTTP 402
and returns `PAYMENT-RESPONSE` with `success: false`,
`errorReason: "settlement_pending"`, the non-empty transaction hash, and the
network. `maxTimeoutSeconds` bounds the client's confirmation attempt; it is not
misrepresented as a transaction-expiry check the receipt cannot prove.

There is no legacy `X-Payment` fallback in the new flow. Keeping two payment
protocols would double the replay and mismatch surface for no current consumer;
the repository script and tests migrate with the server.

Receipt redemption becomes one atomic store operation rather than separate
`isSpent` and `markSpent` calls. Otherwise two concurrent requests can both
observe an unused public transaction hash and both receive access. Receipt
verification also fails closed unless `execution_status` is exactly
`SUCCEEDED`, rejects malformed event prices without throwing, and requires the
event price to equal the advertised fixed `amount`.

## Wallet setup lifecycle

The local wallet lifecycle becomes:

```text
needs_creation -> needs_funding -> needs_deployment -> needs_paymaster -> ready
                                                                    |
                                                                    v
                                                           wallet_shield
                                                                    |
                                                     wait for note maturity
                                                                    |
                                                                    v
                                                             pay_paywall
```

`wallet_shield(amount)` validates a positive decimal amount before loading the
wallet, submits one STRK20 `deposit` action for the configured token, waits for
its receipt, and returns the transaction hash, atomic amount, explorer URL,
receipt block, and conservative spendable-after block. It does not guess an
amount, use a faucet, or automatically pay after shielding. The existing SDK
wallet handles the required approval, registration/setup, proof, screening, and
paymaster submission; the MCP adds no parallel transaction builder.

The setup documentation must say plainly:

- Node 24 is required by the privacy SDK;
- Tor must listen at the configured SOCKS URL;
- the user must obtain and store an AVNU key;
- public STRK funds account deployment and shielding;
- the first shield must cover both the desired private balance and the pool fee;
- a new deployment, top-up, or private note must mature before the next proof;
- the pool fee is read by the external stack and must not be hardcoded in UI;
- `PAYWALL_ANONYMIZER_ADDRESS` is a payer trust decision; and
- only Sepolia test funds are used by the guided live verification.

The default Sepolia RPC changes from `starknet-sepolia.drpc.org`, which does not
serve the class-hash method used by `wallet_status`, to
`starknet-sepolia-rpc.publicnode.com`, which does. An explicit
`STARKNET_RPC_URL` still overrides it.

`wallet_status` remains the source of truth for account readiness. The setup
page never reads the Keychain and does not claim to display a private balance,
because the current `SdkWallet` surface does not expose one.

## Setup page

`/setup` is a server-rendered Next.js page with route metadata and scoped CSS.
It contains:

1. prerequisites: macOS, Node 24, npm, Tor, and an AVNU key;
2. install: `npm install` and `npm run setup`;
3. wallet: create, fund, deploy, store paymaster key, shield, and wait;
4. configuration: trusted anonymizer, ceiling, RPC/services, and Tor;
5. services: start merchant, expose it through a Cloudflare Quick Tunnel with
   `cloudflared tunnel --url http://127.0.0.1:8788`, then start MCP. The tunnel
   recipe sets `MERCHANT_TRUST_PROXY=1` so advertised resource URLs retain their
   public HTTPS origin;
6. clients: Codex and Claude MCP commands;
7. verification: deterministic tests, Tor verifier, and opt-in live x402
   verifier; and
8. privacy/limits: visible edges, Sepolia scope, and mainnet status.

The page uses semantic headings, ordered steps, labelled code blocks, visible
focus states, sufficient contrast, and responsive layout. It adds no client
JavaScript because no interaction beyond links and copyable commands is needed.
The landing page links to `/setup` and no longer says settlement is unbuilt.

## Verification design

### Deterministic tests

One full-stack test starts real ephemeral HTTP instances of both Express apps
and drives the MCP with the official MCP client. The MCP receives a public test
URL such as `https://8.8.8.8/article/agent-privacy`; its injected fetch adapter
maps that URL to the local merchant and supplies the public Host and trusted
forwarded protocol. A fake wallet returns a known transaction hash. The
merchant's injected receipt reader returns a matching accepted `PaywallPaid`
receipt. The assertion is the paid article content returned from
`tools/call pay_paywall` plus the submitted two-leg action list.

This exercises, in one test:

- Streamable HTTP MCP transport;
- tool discovery and invocation;
- HTTP 402 and canonical x402 headers;
- payment requirement parsing and policy guards;
- STRK20 action construction;
- payment payload retry;
- merchant receipt verification; and
- unlocked content returned to the MCP client.

Focused tests cover base64/header parsing, mismatched accepted terms, replay,
success headers, `wallet_shield`, and the `/setup` page content. Existing SSRF,
Tor, amount, receipt, and settlement tests remain.

### Live verifier

`npm run verify:x402 -- --url <public-paid-url>` connects to the running MCP
with the real MCP client, checks that `pay_paywall` is advertised, calls
`wallet_status`, and stops without spending unless `--live` is present. With
`--live`, it calls `pay_paywall`, requires `paid: true`, a transaction hash,
HTTP 200, and protected text, then prints the explorer URL.

The merchant URL must be public because the MCP's SSRF protection correctly
rejects localhost and Tor cannot reach a local listener. The setup page uses a
temporary public HTTPS tunnel as the local-development route and makes clear
that it is an external observer of merchant traffic. The verifier never
installs or launches tunnel software itself.

### Completion gates

Implementation is complete only after fresh evidence for all of these:

```bash
npm test
npm run build
npm run verify:mcp
npm run verify:x402 -- --url <public-paid-url>
npm run verify:x402 -- --url <public-paid-url> --live
```

The last command requires Node 24, a configured AVNU key, a funded and deployed
local wallet, mature shielded notes, Tor, the merchant, and its public URL. If a
secret or test balance is unavailable, implementation can be code-complete but
the goal remains unverified.

## Security and privacy invariants

- The MCP continues to bind to loopback by default.
- Arbitrary request headers never become an MCP input capability.
- Both unpaid and paid fetches go through the same Tor and URL policy.
- Only a configured anonymizer can receive the temporary withdrawn funds.
- A per-call ceiling may lower but never raise the configured ceiling.
- The payment payload must match the terms the merchant currently advertises.
- A receipt is consumed atomically, remains single-use across concurrent
  requests, and remains spent across merchant restarts.
- The merchant requires `SUCCEEDED`, accepted finality, the exact event tuple,
  token, and fixed amount; malformed receipt values fail closed.
- Keychain secrets and viewing material never appear in the page, logs, MCP
  tool output, verifier output, or committed environment files.
- Documentation distinguishes hidden pool activity from public deposits,
  withdrawals, receipt events, amounts, and timing.

## Expected file changes

- `server/src/pay/paywall.ts`: x402 v2 objects, encoding, decoding, validation.
- `server/src/pay/settle.ts`: canonical header parsing and paid retry payload.
- `server/src/tools/browse.ts`: carry only the needed x402 response headers.
- `server/src/pay/pay.ts`: reusable shield operation.
- `server/src/mcp/server.ts`: register `wallet_shield`.
- `server/src/pay/wallet-manager.ts`: wait for the shield receipt and report
  maturity guidance.
- `server/src/index.ts`: inject shield dependencies, CAIP-2 network, and the
  working Sepolia RPC default.
- `merchant/src/app.ts`: v2 requirements, payload verification, response header.
- `merchant/src/index.ts`: CAIP-2 network value.
- `merchant/src/store.ts`: atomic receipt consumption.
- `merchant/src/receipt.ts`: strict successful receipt and fixed amount checks.
- `scripts/pay-paywall.mjs`: migrate the standalone payer to v2.
- `server/verify-x402.mjs`: real MCP preflight and opt-in live verification.
- `web/app/setup/page.js` and `web/app/setup/setup.module.css`: setup page.
- `web/app/page.js`: setup link and accurate current-state copy.
- package scripts, focused tests, README, `.env.example`, and stale active docs
  (`START-HERE`, `LOCAL_MCP_WORK`, `PRIVACY-STACK`, and `HANDOFF`).

No database, facilitator, wallet abstraction, UI library, or new production
service is added.

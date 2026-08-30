# Handoff — 2026-08-30

> Product shape: **local-first**. The MCP server binds to `127.0.0.1`, the
> merchant is a separate HTTP service, and OHTTP remains opt-in until a real
> relay/gateway split is operated.

This is the current implementation state after the STRK20 x402 work. The
guided flow supports Starknet Sepolia and Mainnet. Three real Mainnet MCP x402
runs completed on 2026-08-30 through the STRK20 pool and `PaywallAnonymizer`.
AVNU sponsorship had no remaining credits, so those runs used the explicit
public-relay fallback; their submitting account and payment timing are visible
on-chain.

## The active path

```text
create wallet → fund public account → deploy → configure helper
    → wallet_shield → wait 12 blocks → pay_paywall
```

The local MCP exposes Streamable HTTP at `127.0.0.1:8787/mcp`. `browse` sends
public HTTP(S) requests through Tor. `pay_paywall` reads a canonical x402 v2
402 response, checks the helper/asset/resource/network/price terms, submits the
STRK20 `withdraw` + `privacy_invoke` action list, and retries with
`PAYMENT-SIGNATURE`. The merchant checks the public `PaywallPaid` receipt and
returns protected content with `PAYMENT-RESPONSE`.

## What is proven

Proven means verified by tests or on-chain evidence, not a product promise.

- **Tor browsing.** The MCP path returns `IsTor:true` from the Tor Project
  endpoint when Tor is running.
- **The anonymizer contract.** The Sepolia helper is deployed and its Cairo
  tests cover hostile ERC-20 behavior. The Mainnet `PaywallAnonymizer` is also
  deployed and emitted the expected merchant receipt in all three live runs.
- **Wallet shielding.** `wallet_shield` submits one configured-token `deposit`,
  waits for its receipt, and reports the conservative block at which the note
  can be used.
- **Strict x402 v2.** Merchant and payer agree on Base64-encoded
  `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, and `PAYMENT-RESPONSE` headers. The
  payer has no legacy header fallback.
- **Joined MCP flow.** A deterministic test starts both HTTP services, uses the
  official MCP client, crosses the 402 and signed retry, and receives protected
  content without spending funds.
- **Live verifier.** `verify:x402` performs a no-spend preflight by default and
  has an explicit `--live` mode for a public HTTPS merchant URL on the
  configured network.
- **Mainnet x402 runs.** Three live MCP runs completed on 2026-08-30 through
  the Mainnet STRK20 pool and `PaywallAnonymizer`, each returning HTTP 200 and
  protected content. The explicit public-relay fallback submitted them, so the
  submitting account and payment timing are visible; see
  [`TRANSACTIONS.md`](TRANSACTIONS.md) for hashes and receipt blocks.

## What remains bounded

- **Network-specific funding.** Sepolia remains the safe rehearsal network;
  Mainnet runs require real STRK and a deployed helper. The public-relay
  fallback is verified, but it is not private at the submitting-account or
  payment-timing layer. AVNU sponsorship remains the private-submission route
  when credits are available.
- **Public merchant origin required.** The MCP URL policy rejects localhost and
  Tor cannot reach a loopback merchant. A temporary Cloudflare Quick Tunnel is
  the local-development route.
- **No operator blinding.** OHTTP is not configured; RPC, discovery, prover,
  paymaster, and the local host retain their stated metadata visibility.
- **No browser session.** The fetcher does not execute JavaScript, keep cookies,
  support logins, or guarantee a fresh Tor circuit per request.
- **No live spend in deterministic tests.** A live run still needs Node 24, Tor,
  a funded/deployed wallet, a trusted helper, mature notes, and a public
  merchant URL. The AVNU key is needed for private sponsorship; the verified
  Mainnet fallback uses `PUBLIC_PRIVACY_RELAY=true` instead.

## Setup handoff

Use the static guide at [`/setup`](../web/app/setup/page.js). The essential
sequence is:

1. Install Node 24, npm, Tor, and the privacy SDK with `npm install` and
   `npm run setup`.
2. Run `npm run wallet:setup`, fund the printed address on the intended network
   (Sepolia test STRK for rehearsal, real STRK for Mainnet), and ask the MCP
   client for `wallet_status`.
3. Call `wallet_deploy` when the state requires it.
4. For private AVNU sponsorship, store an AVNU key with
   `npm run paymaster:set`. The verified Mainnet fallback can run without it
   when `PUBLIC_PRIVACY_RELAY=true` is explicitly enabled.
5. Call `wallet_shield` with a positive amount. The first shield covers both
   the private balance and the pool fee.
6. Wait at least 12 blocks after the shield receipt (use
   `spendableAfterBlock`).
7. Set `PAYWALL_ANONYMIZER_ADDRESS` to the helper contract you trust.
8. Start the merchant with `MERCHANT_TRUST_PROXY=1`, expose port 8788 with
   `cloudflared tunnel --url http://127.0.0.1:8788`, then start the MCP through
   Tor.
9. Connect Codex or Claude Code and call `pay_paywall` with the tunnel's public
   HTTPS URL. For the verified Mainnet fallback, set `NETWORK=mainnet` and
   `PUBLIC_PRIVACY_RELAY=true`; the submitting account and payment timing are
   public on-chain.

The standalone `npm run pay:paywall -- http://127.0.0.1:8788/... --dry` command
is a direct localhost payer. It is a separate rehearsal path and does not
exercise the real MCP flow's public-HTTPS and Tor requirements.

## Verification commands

```bash
npm test
npm run build
npm run verify:mcp
npm run verify:x402 -- --url https://PUBLIC_HOST/article/agent-privacy
npm run verify:x402 -- --url https://PUBLIC_HOST/article/agent-privacy --live
```

The first x402 command spends nothing. Append `--live` only when the mature
shielded note and public merchant are ready; it spends STRK on the configured
network. The verified Aug 30 Mainnet runs used the explicit public-relay
fallback because AVNU sponsorship was unavailable.

## Gotchas

- Use `https://starknet-sepolia-rpc.publicnode.com` unless
  `STARKNET_RPC_URL` intentionally overrides it; the older default does not
  provide the class lookup required by `wallet_status`.
- The proving state is behind the head. Notes younger than 12 blocks can pass a
  dry rehearsal and still fail submission with `NOTE_NOT_FOUND`.
- The paymaster refuses to broadcast a reverting transaction, so a failed
  proof may have no explorer hash.
- Pool fees are read from the external stack. Do not hardcode a Sepolia fee or
  treat it as a Mainnet quote; the verified Mainnet public-relay runs paid the
  configured fee and exposed their submitting account and timing.
- The helper named in `PAYWALL_ANONYMIZER_ADDRESS` receives the withdrawn funds
  during `privacy_invoke`; only trust a helper you selected.
- Keep wallet keys, passphrases, viewing material, and API keys in Keychain or
  the local secret store. Do not put literal credentials in docs, logs, or
  committed environment files.

## Scope decisions

- Shared canonical STRK20 pool only; never create a private pool of one.
- Local MCP and merchant remain separate services.
- Payment requires an explicit tool call and a ready wallet; shielding never
  pays a merchant automatically.
- Privacy claims cover Tor egress, stateless fetches, and shielded STRK20 only.
  They do not promise fresh circuits, browser-fingerprint protection, or
  operator blinding.

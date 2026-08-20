# Tony Strk

Tony Strk is a local Web2 landing-page mapper plus a separately runnable stdio MCP `browse` tool.

The landing page maps a conceptual route only. It never calls the MCP server or sends a request. The local MCP server validates one public HTTP(S) URL, uses a fresh Obscura browser context, and closes that context after the page is read.

No wallets, STRK20 transactions, x402 payments, or remote deployment are included.

## Run locally

Use Node 24 or newer.

```bash
npm install
npm run dev
```

To enable the separately runnable MCP tool, start local Tor and Obscura first:

```bash
obscura serve --host 127.0.0.1 --port 9222 --stealth --proxy socks5://127.0.0.1:9050
npm run mcp
```

The MCP server exposes one tool:

```text
browse({ url })
```

It rejects non-HTTP(S), credential-bearing, localhost, private, link-local, metadata, and DNS-resolved private destinations. It has no direct `fetch` fallback.

## Optional OHTTP mode

Set all three values in `.env` to switch the MCP tool from the local worker path to OHTTP:

```bash
OHTTP_RELAY_URL=https://relay.example/ohttp
OHTTP_GATEWAY_URL=https://gateway.example/ohttp
OHTTP_GATEWAY_KEY_CONFIG=<base64-public-key-config>
```

The relay must be configured to forward to the gateway selected for that key configuration. OHTTP only provides a privacy boundary with independently operated relay and gateway services. A local relay/gateway protocol test is not anonymity.

## Verify

```bash
npm test
npm run build
```

Built locally by [prathadox](https://github.com/prathadox) and [Aaronvern](https://github.com/Aaronvern) for the STRK20 Private Sprint. Nothing is pushed or deployed by this repository setup.

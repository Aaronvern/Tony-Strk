# Local MCP Work

## Purpose

This document records the local MCP work that is complete.

The server is local only. This work did not deploy a contract or send a payment by default.

## What Works Now

1. The MCP server listens on `127.0.0.1:8787`.

2. The `browse` tool uses Tor at `127.0.0.1:9050`.

3. The tool stops if Tor is not available.

4. The tool accepts public HTTP and HTTPS addresses only.

5. The tool rejects local, private, metadata, multicast, and reserved addresses.

6. The tool repeats these address checks after each redirect.

7. The tool limits a response to 1 MiB and stops after five redirects.

8. The `pay` tool stays hidden unless `PAY_ENABLED=true` and wallet values are present.

9. The old Obscura service is not part of the active server path.

10. The Railway deployment file was removed. The container uses loopback only.

## What Does Not Work Yet

1. An independent OHTTP relay is not configured. The payment path can use direct OHTTP encryption, but this does not hide the client IP.

2. A real OHTTP setup needs relay URLs from an independent provider. It also needs a pinned public key configuration.

3. This work did not deploy a contract. The local check only compiles the contract.

4. The active fetcher is not a browser. It has no login support, cookie storage, or fresh Tor circuit per request.

## Run the Local Server

1. Install Node.js 24 and Tor.

2. Start Tor on `127.0.0.1:9050`.

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

Both clients connect to the same local endpoint. No API key is required.

The `browse` tool is active after the server starts. The `pay` tool stays disabled unless you add local payment values.

## Do the Checks

1. Run `npm test`. The web package has four tests. The server package has 31 tests.

2. Run `npm run build`. This builds the web application.

3. Run `npm run build:contracts`. This compiles the Cairo contract. It does not deploy the contract.

4. Run `npm run verify:mcp` while the local server is active. This calls the Tor Project endpoint through MCP.

## Code References

1. [MCP server startup](../server/src/index.ts) loads the local settings and starts the loopback server.

2. [Browse policy](../server/src/tools/url-policy.ts) blocks unsafe target addresses.

3. [Browse tool](../server/src/tools/browse.ts) handles redirects, timeouts, and response size limits.

4. [Tor fetcher](../server/src/tor/tor-fetch.ts) sends each approved request through the Tor SOCKS proxy.

5. [Payment gate](../server/src/mcp/server.ts) adds `pay` only when local payment is enabled.

6. [Live MCP check](../server/verify-mcp.mjs) proves that the destination saw a Tor exit.

7. [Local design](superpowers/specs/2026-08-21-local-mcp-hardening-design.md) states the active security boundary.

## External References

1. [Model Context Protocol](https://modelcontextprotocol.io) defines the tool protocol.

2. [Tor Project check](https://check.torproject.org/api/ip) reports whether the request used a Tor exit.

3. [OHTTP RFC 9458](https://www.rfc-editor.org/rfc/rfc9458) defines Oblivious HTTP.

4. [StarkWare Privacy SDK](https://github.com/starkware-libs/starknet-privacy/blob/main/sdk/README.md) describes relay URLs and pinned public key configuration.

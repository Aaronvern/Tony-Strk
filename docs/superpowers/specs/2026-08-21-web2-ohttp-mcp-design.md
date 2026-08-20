# Tony Strk Web2 MCP and OHTTP design

## Status and scope

This document defines the local-first Web2 browsing slice. It adds an MCP
server, an isolated Obscura browser worker, and an OHTTP-ready request
boundary. It does not add STRK20 actions, wallet access, x402, payments,
identity, logins, cookies, or persistent metering.

The default mode remains entirely local. A real OHTTP privacy deployment is a
later operation requiring separately operated public relay and gateway
endpoints. No deployment, push, or publication is part of this work.

## Goal

An MCP-compatible agent can call `browse` with one public URL and receive a
small, sanitized result from a disposable browser session. The target website
sees the browser's Tor egress, not the agent host's direct network address.

## Architecture

```text
MCP client
  │ stdio (local process)
  ▼
Tony Strk MCP server
  │ validate a public HTTP(S) URL
  ├─ local mode ──────────────► isolated Obscura worker ─► Tor ─► target site
  │
  └─ future OHTTP mode ───────► OHTTP relay ─► OHTTP gateway
                                                 │
                                                 └► isolated Obscura worker ─► Tor ─► target site
```

The MCP server owns the policy boundary. It does not proxy Obscura's built-in
MCP service. Obscura is driven through its CDP service bound to loopback only.
Each call creates a browser context, visits one allowed public URL, extracts a
bounded text result, and destroys that context before responding.

## Components

### Local MCP server

- Uses the official MCP TypeScript server package with a stdio transport.
- Exposes only `browse({ url })` in this slice.
- Writes protocol output only to stdout and diagnostics only to stderr.
- Runs as a local child process; there is no HTTP listener.

### URL safety guard

Before work is delegated, the server accepts only `http:` and `https:` URLs.
It rejects localhost, loopback, link-local, private RFC1918, unique-local, and
metadata-service destinations. Redirect targets receive the same check.

No arbitrary script evaluation, file access, credentials, headers, form
submission, downloads, or browser persistence is exposed to the MCP client.

### Isolated browser worker

- Obscura runs as a local CDP server, bound to `127.0.0.1`.
- It is configured with `--stealth` and the configured Tor SOCKS5 proxy.
- Every browse call gets a fresh browser context; all context state is removed
  at completion, timeout, or error.
- The worker returns only `{ title, finalUrl, text }`, with a fixed response
  size and navigation timeout.
- If Obscura or Tor is unavailable, the tool returns an explicit unavailable
  error. It never falls back to a direct network request.

### OHTTP boundary

OHTTP is not a replacement for Tor. It separates an agent/client identity from
the gateway that handles an allowed Web2 request:

- The client encrypts a binary HTTP request to the gateway's HPKE public key.
- The relay sees the client network address and ciphertext, but not request
  contents.
- The gateway decrypts and validates the request, but sees the relay rather
  than the original client.
- The gateway passes only the validated URL to its isolated browser worker.

The local build has an OHTTP configuration contract and tests, but does not
claim an anonymity property until independently operated relay and gateway
URLs are configured. A local relay and local gateway are useful for protocol
testing only; they are not a privacy deployment.

## Configuration

Existing values remain the worker configuration:

```dotenv
OBSCURA_CDP_URL=ws://127.0.0.1:9222
TOR_SOCKS_PROXY=socks5://127.0.0.1:9050
BROWSER_EPHEMERAL=true
```

Future OHTTP mode uses explicit, unset configuration:

```dotenv
OHTTP_RELAY_URL=
OHTTP_GATEWAY_URL=
OHTTP_GATEWAY_KEY_CONFIG=
```

Absent OHTTP values select local mode. Partially configured OHTTP values are a
startup error, not a direct fallback.

## Data and trust boundaries

The browsing worker receives a URL, never a wallet, viewing key, payment
credential, or user identity. There is no payment worker in this scope.

No request log, cookie jar, session database, or user-to-task mapping is
created. Operational errors may identify component state only (for example,
`OBSCURA_UNAVAILABLE`), never requested URLs or page contents.

OHTTP reduces relay/gateway linkage only when the two are separately operated.
Tor protects the target-site egress. Neither mechanism makes logged-in
browsing anonymous, and logged-in browsing is intentionally unsupported.

## Error handling

| Condition | Result |
| --- | --- |
| Invalid or non-public URL | `URL_NOT_ALLOWED` |
| Redirect reaches a private destination | `URL_NOT_ALLOWED` |
| Obscura CDP unavailable | `WORKER_UNAVAILABLE` |
| Tor unavailable or misconfigured | `WORKER_UNAVAILABLE` |
| Navigation exceeds limit | `NAVIGATION_TIMEOUT` |
| OHTTP configuration incomplete | `OHTTP_CONFIGURATION_INVALID` |
| OHTTP relay or gateway failure | `OHTTP_UNAVAILABLE` |

Errors are structured MCP tool errors and do not trigger direct fetches.

## Testing and verification

1. Unit-test URL acceptance and rejection, including private-address and
   redirect-target guards.
2. Unit-test incomplete OHTTP configuration and explicit unavailable worker
   responses.
3. Exercise the MCP server through a stdio client: tool discovery, an invalid
   URL, and an unavailable worker.
4. When Obscura and Tor are installed locally, run a manual browser check
   against the Tor Project IP endpoint and confirm the returned egress is Tor.
5. Run `npm test`, `npm run typecheck`, and `npm run build`.

## Deferred work

- Deploy separately operated OHTTP relay and gateway services.
- Add STRK20 wallet, proving, payment, metering, and settlement workers.
- Add any remote MCP transport, authentication, or user session controls.
- Add `extract` only after `browse` has a tested, safe page-handle lifecycle.

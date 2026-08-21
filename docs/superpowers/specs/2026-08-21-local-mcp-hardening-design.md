# Local MCP hardening design

## Scope

Keep the updated Express MCP server local-only. No Railway deployment, OHTTP
relay configuration, wallet funding, real payment, or Cairo deployment is in
scope.

## Runtime

- The server remains bound to `127.0.0.1` on port `8787`.
- Root scripts load the gitignored root `.env` with Node's `--env-file` flag.
- Tor on `socks5://127.0.0.1:9050` is mandatory for `browse`.
- Obscura is not part of the current server architecture and its local
  `9222` service is stopped.

## Browse boundary

`browse` accepts only public `http` or `https` URLs without credentials. It
resolves the hostname and rejects loopback, private, link-local, multicast,
reserved, and metadata addresses before each request and redirect. Requests
are sent through the existing SOCKS connector with a timeout, manual redirect
handling, and a bounded response body. There is no direct-network fallback.

## Payment boundary

`pay` stays unavailable unless `PAY_ENABLED=true` is set alongside wallet
configuration. This prevents a local MCP client from spending merely because
a developer has a key in `.env`.

## Verification

Tests cover blocked destinations, redirects, response limits, and disabled
payment. The local server is started with `.env`, checked through its MCP
endpoint, and its `browse` result against the Tor Project endpoint must report
`IsTor: true`. Run workspace tests, the web build, and the Cairo compile; do
not deploy the contract.

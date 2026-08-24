# Local MCP Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the local MCP server safely through Tor with public browsing bounded and payment disabled by default.

**Architecture:** Keep Express loopback-only. Node loads the root `.env`; browse validates every target and redirect before using the existing SOCKS connector; pay requires `PAY_ENABLED=true`.

**Tech Stack:** Node 24, Express, MCP SDK, undici, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-21-local-mcp-hardening-design.md`

## Global Constraints

- Bind to `127.0.0.1`; do not deploy the MCP server or the contract.
- Require `TOR_SOCKS_PROXY`; never use a direct-network fallback.
- Accept public `http:` and `https:` URLs without credentials only.
- Leave the OHTTP relay unset and payments disabled unless explicitly enabled.

### Task 1: Explicit local configuration and payment gate

**Files:** `package.json`, `server/package.json`, `server/src/index.ts`, `server/src/mcp/server.ts`, `server/test/mcp-server.test.ts`.

- [ ] Write a failing MCP test that calls `pay` without a payment dependency and expects an error response.
- [ ] Run `npm run test --workspace @tony-strk/server -- --test-name-pattern="explicitly enabled"`; it must fail before the change.
- [ ] Set server scripts to `node --env-file=../.env src/index.ts` (and the watch equivalent). In `index.ts`, pass a `pay` dependency only when `PAY_ENABLED === "true"` and the wallet was constructed. In `server.ts`, register `pay` only when that dependency exists.
- [ ] Re-run the focused test; it must pass.
- [ ] Commit only these files with `git commit -m "Require explicit local payment enablement"`.

### Task 2: Public URL and redirect boundary

**Files:** create `server/src/tools/url-policy.ts`; modify `server/src/tools/browse.ts` and `server/test/mcp-browse.test.ts`.

- [ ] Write failing tests for `http://127.0.0.1`, credential-bearing URLs, and a redirect to a private address. Assert the fetch double was never called for rejected targets.
- [ ] Run `npm run test --workspace @tony-strk/server -- --test-name-pattern="credentials|redirect"`; it must fail before the change.
- [ ] Add `assertPublicHttpUrl(value, lookup = dns.promises.lookup)`: parse once, allow only `http:`/`https:`, reject credentials, resolve every hostname, and reject loopback/private/link-local/multicast/reserved/metadata addresses. Make `browse` use `redirect: "manual"`, validate every resolved `Location`, allow at most five redirects, use `AbortSignal.timeout(15_000)`, and reject bodies over 1 MiB. Keep the existing SOCKS fetcher as the only network path.
- [ ] Re-run the focused tests; they must pass.
- [ ] Commit only these files with `git commit -m "Harden local MCP browse targets"`.

### Task 3: Retire Obscura and prove the live MCP path

**Files:** `.env.example`, `README.md`, `server/verify-mcp.mjs`.

- [ ] Update the verifier to call `browse` for `https://check.torproject.org/api/ip` and assert its returned text contains `"IsTor":true`.
- [ ] Remove `OBSCURA_CDP_URL` and `BROWSER_EPHEMERAL` from `.env.example`; update README to say the active server is a Tor HTTP fetcher.
- [ ] Run `npm test`, `npm run build`, and `npm run build:contracts`; each must pass.
- [ ] Start the local server with `TOR_SOCKS_PROXY=socks5://127.0.0.1:9050 npm run start:server`, then run `npm run verify:mcp`; it must prove `IsTor: true`.
- [ ] Stop the unused Obscura LaunchAgent only after that verification passes, then confirm no listener remains on port `9222`.
- [ ] Commit only these files with `git commit -m "Verify local MCP browsing through Tor"`.

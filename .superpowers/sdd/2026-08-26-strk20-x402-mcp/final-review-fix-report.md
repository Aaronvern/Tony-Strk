# Final review remediation report

Date: 2026-08-26
Worktree: `.worktrees/strk20-x402-mcp`
Base: `cdb48d8128183c06509503a6909d6b6df1d24c28`

## Verified findings and bounded fixes

| Finding | Verification against base | Fix and evidence |
|---|---|---|
| Signed redirect leakage | `server/src/tools/browse.ts` reused `input.headers` after every manual redirect and only re-ran URL policy. A signed request could therefore send `PAYMENT-SIGNATURE` to a different public origin. | Added an origin comparison before following a redirect when any header name is `PAYMENT-SIGNATURE`. Same-origin redirects retain the header; unsigned redirects still use URL policy. Added cross-origin/no-second-fetch and same-origin/header-retention tests. |
| Settlement response validation | `server/src/pay/settle.ts` returned `{ ...paid, ...settled }` for every status other than 402 and ignored `paymentResponseHeader`; any 2xx, 4xx, 5xx, or permanent response could be reported as paid or polled. | Added canonical Base64 JSON decoding and validation of transaction, network, amount, success, and pending reason/status. Existing merchant pending wire has no amount, so pending may omit it; a supplied amount must match. Invalid responses fail with the paid hash and one submission remains in place. |
| Shield receipt status | `server/src/pay/wallet-manager.ts` trusted only `receipt.block_number`; reverted, pending, pre-confirmed, mismatched, and malformed receipts could return maturity. | Require optional transaction-hash binding, `SUCCEEDED`, `ACCEPTED_ON_L2`/`ACCEPTED_ON_L1`, and a safe integer block number. Invalid receipts throw. |
| Merchant RPC shape | `merchant/src/receipt.ts` called `.filter`, `.length`, and indexed fields without runtime array/record checks. | Invalid `events`, event records, `keys`, and `data` now fail closed. |
| Verifier health | `server/verify-x402.mjs` checked HTTP success and Tor configuration but not JSON `health.ok`. | Require `health.ok === true`; added a subprocess harness proving MCP is not contacted when `ok` is false. |
| Copy/paste correctness | Route preview labels implied active isolation/OHTTP; roadmap bullets were not explicitly labelled; docs used a placeholder variable and README pinned a drifting total. | Clarified current vs roadmap labels, labelled roadmap/rehearsal items, removed the exact README test total, and changed verifier examples to `https://PUBLIC_HOST/article/agent-privacy`. |

## Files changed

- `server/src/tools/browse.ts`
- `server/src/pay/settle.ts`
- `server/src/pay/wallet-manager.ts`
- `server/verify-x402.mjs`
- `merchant/src/receipt.ts`
- `server/test/mcp-browse.test.ts`
- `server/test/settle.test.ts`
- `server/test/wallet-shield.test.ts`
- `server/test/verify-x402.test.ts`
- `merchant/test/receipt.test.ts`
- `web/app/RoutePreview.js`
- `README.md`
- `docs/START-HERE.md`
- `docs/HANDOFF.md`
- `docs/LOCAL_MCP_WORK.md`
- `.superpowers/sdd/2026-08-26-strk20-x402-mcp/final-review-fix-report.md`

## TDD evidence

Node path for every command: `PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH`.

### 1. Signed redirect origin guard

RED command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/mcp-browse.test.ts
```

RED output: `tests 19`, `pass 18`, `fail 1`; the new test failed because the old implementation followed the cross-origin redirect and eventually returned `Too many redirects` instead of rejecting the origin.

GREEN command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/mcp-browse.test.ts
```

GREEN output: `tests 19`, `pass 19`, `fail 0`.

### 2. Settlement response validation

RED command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/settle.test.ts
```

RED output: `tests 19`, `pass 14`, `fail 5`; the missing, malformed, mismatched, 500, and permanent-rejection cases either reported success or continued polling under the old `status !== 402` branch. The permanent rejection made 9 requests instead of the expected 2.

GREEN command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/settle.test.ts
```

GREEN output: `tests 20`, `pass 20`, `fail 0`. This includes valid success, valid pending polling, missing/malformed/mismatched response, network/amount mismatch, 500, permanent rejection, hash preservation, and one-submission assertions.

### 3. Shield receipt validation

RED command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/wallet-shield.test.ts
```

RED output: `tests 5`, `pass 2`, `fail 3`; the old implementation returned a result for a mismatched hash, reverted/pending/pre-confirmed status, and malformed fields.

GREEN command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/wallet-shield.test.ts
```

GREEN output: `tests 6`, `pass 6`, `fail 0`. Coverage includes L2 and L1 acceptance, optional hash binding, rejected statuses, and missing/malformed fields.

### 4. Merchant receipt shape guards

RED command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test merchant/test/receipt.test.ts
```

RED output: `tests 17`, `pass 16`, `fail 1`; malformed `events: {}` threw `(receipt.events ?? []).filter is not a function`.

GREEN command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test merchant/test/receipt.test.ts
```

GREEN output: `tests 17`, `pass 17`, `fail 0`.

### 5. Verifier health harness

RED command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/verify-x402.test.ts
```

RED output: `tests 1`, `pass 0`, `fail 1`; the old verifier contacted `/mcp` after receiving HTTP 200 JSON `{ ok: false, torProxy: "configured" }`.

GREEN command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/verify-x402.test.ts
```

GREEN output: `tests 1`, `pass 1`, `fail 0`.

## Full final test output

Command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH npm test
```

Raw final summaries:

```text
@tony-strk/web:    tests 16, pass 16, fail 0
@tony-strk/server: tests 104, pass 104, fail 0
@tony-strk/merchant: tests 58, pass 58, fail 0
```

The command exited `0`. It included the new redirect, settlement, shield,
merchant-shape, and verifier-harness cases. No test was skipped or cancelled.

## Full final build output

Command:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH npm run build
```

Output:

```text
> tony-strk@0.1.0 build
> npm run build --workspace @tony-strk/web

> @tony-strk/web@0.1.0 build
> next build

▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config took 5ms

  Creating an optimized production build ...
✓ Compiled successfully in 323ms
  Running TypeScript ...
  Finished TypeScript in 2ms ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/6) ...
  Generating static pages using 7 workers (1/6)
  Generating static pages using 7 workers (2/6)
  Generating static pages using 7 workers (4/6)
✓ Generating static pages using 7 workers (6/6) in 220ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /pool
├ ○ /setup
└ ○ /spike/wallet


○  (Static)  prerendered as static content
```

Build exited `0`.

## Self-review

- Signed headers are rejected only when the redirect origin changes; same-origin and unsigned redirect behavior remains intact.
- Settlement submits once, requires a canonical response after broadcast, accepts only the existing pending wire, and preserves the paid transaction hash in every post-broadcast failure.
- Receipt maturity cannot be inferred from a block number alone; both accepted finality values are covered.
- Merchant malformed RPC shapes fail closed and do not mask valid receipt checks.
- The verifier now gates both HTTP health and JSON health state before MCP connection.
- No new dependency, protocol framework, legacy payment fallback, live transaction, or secret access was introduced.
- `git diff --check` completed with no output.

## Concerns

- The existing merchant pending `PAYMENT-RESPONSE` intentionally omits `amount`; the server preserves that wire contract and rejects any supplied mismatched amount. If the protocol later requires amount on pending responses, make that a coordinated merchant/server wire change.
- Finality acceptance remains intentionally `ACCEPTED_ON_L2` or `ACCEPTED_ON_L1`, matching the existing paywall receipt policy.
- No live Sepolia transaction or external verifier run was performed, per task scope.

## Fix round 2: require the shield receipt transaction hash

### Verified finding

`wallet-manager.ts` previously entered hash validation only when
`receipt.transaction_hash !== undefined`. A receipt with a valid status,
finality, and block number but no transaction hash could therefore report note
maturity without binding the receipt to the submitted deposit transaction.

### TDD RED

Added `shield rejects a receipt missing its transaction hash` to
`server/test/wallet-shield.test.ts`, then ran:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/wallet-shield.test.ts
```

Exact result: `tests 7`, `pass 6`, `fail 1`. The missing-hash test failed with
`AssertionError [ERR_ASSERTION]: Missing expected rejection`; existing L1,
mismatch, reverted/pending/pre-confirmed, and malformed-field tests passed.

### TDD GREEN

Changed the guard to require `transaction_hash` to be a string and felt-equal
to the submitted hash before status/finality/block validation. Re-ran:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH node --test server/test/wallet-shield.test.ts
```

Exact result: `tests 7`, `pass 7`, `fail 0`.

### Full-suite evidence

Ran once after the fix:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH npm test
```

Workspace output summaries:

```text
@tony-strk/web: tests 16, pass 16, fail 0
@tony-strk/server: tests 105, pass 105, fail 0
@tony-strk/merchant: tests 58, pass 58, fail 0
```

The command exited `0`; total deterministic tests: `179`, with no failures,
cancellations, or skips.

### Build evidence

Ran once after the fix:

```text
PATH=/Users/pratham/.nvm/versions/node/v24.12.0/bin:$PATH npm run build
```

Exact final build output:

```text
> tony-strk@0.1.0 build
> npm run build --workspace @tony-strk/web

> @tony-strk/web@0.1.0 build
> next build

▲ Next.js 16.3.1 (Turbopack)
✓ Running next.config took 5ms

  Creating an optimized production build ...
✓ Compiled successfully in 272ms
  Running TypeScript ...
  Finished TypeScript in 2ms ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/6) ...
  Generating static pages using 7 workers (1/6)
  Generating static pages using 7 workers (2/6)
  Generating static pages using 7 workers (4/6)
✓ Generating static pages using 7 workers (6/6) in 208ms
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /pool
├ ○ /setup
└ ○ /spike/wallet

○  (Static)  prerendered as static content
```

Build exited `0`.

### Fix-round self-review

- Missing, non-string, and mismatched receipt hashes now throw before maturity is returned.
- Existing `ACCEPTED_ON_L2`/`ACCEPTED_ON_L1`, execution-status, finality, and block-number guards remain unchanged.
- No unrelated files, dependencies, live transactions, or secrets were touched.

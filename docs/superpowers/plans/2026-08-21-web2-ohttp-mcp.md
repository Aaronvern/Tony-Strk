# Web2 OHTTP MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local stdio MCP `browse` tool that safely delegates one public URL to a disposable Obscura-over-Tor browser context and includes an RFC 9458 OHTTP client/gateway boundary ready for a later relay deployment.

**Architecture:** The MCP process owns validation and selects either direct local-worker mode or a configured OHTTP relay/gateway mode. The worker uses Puppeteer to connect only to Obscura's loopback CDP endpoint and creates one new browser context per browse call. OHTTP handling is split into a small client and a framework-free gateway handler, enabling an in-memory protocol round trip in tests without claiming local anonymity.

**Tech Stack:** Node.js 24+, Next.js 16, `@modelcontextprotocol/server@2.0.0`, `puppeteer-core@25.8.0`, `ohttp-ts@0.4.1`, `hpke@1.1.4`, `zod@4.2.0`, Node's built-in test runner.

**Spec:** [`docs/superpowers/specs/2026-08-21-web2-ohttp-mcp-design.md`](../specs/2026-08-21-web2-ohttp-mcp-design.md)

## Global Constraints

- All work and commits are local; do not push, deploy, open a PR, or start a public relay/gateway.
- Expose exactly one MCP tool: `browse({ url })`.
- Permit only public `http:` and `https:` URLs; reject local, private, link-local, and metadata-service destinations before delegation and after navigation.
- Bind Obscura to loopback, never enable its `--allow-private-network` or `--allow-file-access` flags, and never fall back to direct `fetch`.
- Every browse call uses a new browser context and closes it in `finally`.
- The current landing page remains a local route mapper; it does not invoke the MCP server or send browsing requests.
- STRK20, wallet access, x402, payment, logins, cookies, persistence, metering, and remote MCP transport are out of scope.
- OHTTP local tests prove protocol wiring only. Do not claim anonymity until independently operated relay and gateway endpoints are configured.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/mcp/config.js` | Parse browser/OHTTP environment configuration and reject incomplete OHTTP mode. |
| `src/mcp/url-policy.js` | Parse, resolve, and validate public HTTP(S) destinations. |
| `src/mcp/worker.js` | Connect to loopback Obscura CDP and browse in one disposable context. |
| `src/mcp/browse.js` | Orchestrate configuration, validation, OHTTP routing, and worker result shaping. |
| `mcp/server.mjs` | Register the local stdio `browse` MCP tool. |
| `src/ohttp/client.js` | Encapsulate the limited browse request and decapsulate a gateway response. |
| `src/ohttp/gateway.js` | Decapsulate a request, enforce the same URL policy, call the worker, and encapsulate a bounded response. |
| `tests/mcp-config.test.mjs` | Unit-test mode selection and explicit configuration errors. |
| `tests/url-policy.test.mjs` | Unit-test URL and DNS-address rejection. |
| `tests/mcp-worker.test.mjs` | Unit-test worker lifecycle against injected browser doubles. |
| `tests/ohttp.test.mjs` | Test an in-memory OHTTP client → relay → gateway round trip. |
| `tests/mcp-server.test.mjs` | Test MCP tool registration and structured error output over stdio. |
| `app/RoutePreview.js`, `src/route.js`, `app/page.js` | Keep the visual mapper honest about the new local MCP/OHTTP-ready architecture without invoking it. |
| `.env.example`, `README.md`, `package.json`, `package-lock.json` | Declare configuration, local commands, direct dependencies, and scope. |

## Task 1: Dependencies and configuration contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `src/mcp/config.js`
- Create: `tests/mcp-config.test.mjs`

**Interfaces:**
- Produces: `loadBrowseConfig(env)` returning `{ mode, obscuraCdpUrl, browserTimeoutMs, maxTextChars, ohttp }`.
- Consumes: plain environment-object input, never `process.env` directly in tests.

- [ ] **Step 1: Write the failing configuration tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBrowseConfig } from '../src/mcp/config.js';

const base = {
  OBSCURA_CDP_URL: 'ws://127.0.0.1:9222',
  TOR_SOCKS_PROXY: 'socks5://127.0.0.1:9050',
  BROWSER_EPHEMERAL: 'true',
};

test('selects local mode when every OHTTP value is absent', () => {
  assert.equal(loadBrowseConfig(base).mode, 'local');
});

test('rejects a partial OHTTP configuration', () => {
  assert.throws(
    () => loadBrowseConfig({ ...base, OHTTP_RELAY_URL: 'https://relay.example/ohttp' }),
    { code: 'OHTTP_CONFIGURATION_INVALID' },
  );
});

test('selects OHTTP mode only when relay, gateway, and key config exist', () => {
  const config = loadBrowseConfig({
    ...base,
    OHTTP_RELAY_URL: 'https://relay.example/ohttp',
    OHTTP_GATEWAY_URL: 'https://gateway.example/ohttp',
    OHTTP_GATEWAY_KEY_CONFIG: 'AA==',
  });
  assert.equal(config.mode, 'ohttp');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/mcp-config.test.mjs`

Expected: FAIL because `src/mcp/config.js` does not exist.

- [ ] **Step 3: Add direct runtime dependencies and the minimal configuration loader**

Run:

```bash
npm install @modelcontextprotocol/server@2.0.0 puppeteer-core@25.8.0 ohttp-ts@0.4.1 hpke@1.1.4 zod@4.2.0
```

Create `src/mcp/config.js` with these exported values and semantics:

```js
const OHTTP_KEYS = ['OHTTP_RELAY_URL', 'OHTTP_GATEWAY_URL', 'OHTTP_GATEWAY_KEY_CONFIG'];

export function configError(message) {
  return Object.assign(new Error(message), { code: 'OHTTP_CONFIGURATION_INVALID' });
}

export function loadBrowseConfig(env) {
  const configured = OHTTP_KEYS.filter((key) => Boolean(env[key]));
  if (configured.length > 0 && configured.length !== OHTTP_KEYS.length) {
    throw configError('Configure OHTTP relay, gateway, and gateway key together.');
  }

  return {
    mode: configured.length === OHTTP_KEYS.length ? 'ohttp' : 'local',
    obscuraCdpUrl: env.OBSCURA_CDP_URL || 'ws://127.0.0.1:9222',
    browserTimeoutMs: 15_000,
    maxTextChars: 20_000,
    ohttp: configured.length === OHTTP_KEYS.length
      ? {
          relayUrl: env.OHTTP_RELAY_URL,
          gatewayUrl: env.OHTTP_GATEWAY_URL,
          gatewayKeyConfig: env.OHTTP_GATEWAY_KEY_CONFIG,
        }
      : null,
  };
}
```

Append these unset values to `.env.example` below the browser-worker block:

```dotenv
# OHTTP is active only when all three remote values are configured.
OHTTP_RELAY_URL=
OHTTP_GATEWAY_URL=
OHTTP_GATEWAY_KEY_CONFIG=
```

- [ ] **Step 4: Run the configuration tests and package validation**

Run: `node --test tests/mcp-config.test.mjs && npm ls @modelcontextprotocol/server puppeteer-core ohttp-ts hpke zod`

Expected: all three tests PASS and every dependency resolves at the direct pinned version.

- [ ] **Step 5: Commit the configuration contract**

```bash
git add package.json package-lock.json .env.example src/mcp/config.js tests/mcp-config.test.mjs
git commit -m "Add local MCP and OHTTP configuration"
```

## Task 2: Public-URL safety policy

**Files:**
- Create: `src/mcp/url-policy.js`
- Create: `tests/url-policy.test.mjs`

**Interfaces:**
- Produces: `validatePublicUrl(value, lookup)` resolving to a normalized `URL`.
- Produces: `assertPublicUrl(value)` for post-navigation scheme and hostname checks.
- Consumes: an injected `lookup(hostname)` returning address strings, allowing deterministic tests.
- Used by: browser worker and OHTTP gateway.

- [ ] **Step 1: Write the failing URL-policy tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicUrl, validatePublicUrl } from '../src/mcp/url-policy.js';

const lookup = async () => ['93.184.216.34'];

test('accepts a public HTTPS destination', async () => {
  const url = await validatePublicUrl('https://example.com/research', lookup);
  assert.equal(url.href, 'https://example.com/research');
});

test('rejects non-web, localhost, private IPv4, and link-local IPv6 URLs', async () => {
  await assert.rejects(() => validatePublicUrl('file:///etc/passwd', lookup), { code: 'URL_NOT_ALLOWED' });
  await assert.rejects(() => validatePublicUrl('https://localhost/', lookup), { code: 'URL_NOT_ALLOWED' });
  await assert.rejects(() => validatePublicUrl('https://10.0.0.8/', lookup), { code: 'URL_NOT_ALLOWED' });
  await assert.rejects(() => validatePublicUrl('https://[fe80::1]/', lookup), { code: 'URL_NOT_ALLOWED' });
});

test('rejects a hostname that resolves to a private address', async () => {
  await assert.rejects(
    () => validatePublicUrl('https://internal.example/', async () => ['10.0.0.9']),
    { code: 'URL_NOT_ALLOWED' },
  );
});

test('post-navigation check rejects a redirected private URL', () => {
  assert.throws(() => assertPublicUrl('http://127.0.0.1/admin'), { code: 'URL_NOT_ALLOWED' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/url-policy.test.mjs`

Expected: FAIL because `src/mcp/url-policy.js` does not exist.

- [ ] **Step 3: Implement the shared guard**

Create `src/mcp/url-policy.js`. It must:

```js
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function urlError(message) {
  return Object.assign(new Error(message), { code: 'URL_NOT_ALLOWED' });
}

export function assertPublicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw urlError('Only credential-free public HTTP(S) URLs are allowed.');
  }
  if (url.hostname === 'localhost' || isBlockedAddress(url.hostname)) {
    throw urlError('Private and local destinations are not allowed.');
  }
  return url;
}

export async function validatePublicUrl(value, lookup = defaultLookup) {
  const url = assertPublicUrl(value);
  let addresses;
  try {
    addresses = await lookup(url.hostname);
  } catch {
    throw urlError('The destination could not be resolved.');
  }
  if (addresses.length === 0) throw urlError('The destination could not be resolved.');
  for (const address of addresses) {
    if (isBlockedAddress(address)) throw urlError('Private and local destinations are not allowed.');
  }
  return url;
}

async function defaultLookup(hostname) {
  if (isIP(hostname)) return [hostname];
  return (await dnsLookup(hostname, { all: true })).map(({ address }) => address);
}

function isBlockedAddress(address) {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) return true;
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) || a >= 224;
}
```

The helper blocks IPv4 loopback, `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, documentation/reserved IPv4 ranges, IPv6 `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped forms of those ranges. Leave Obscura's default private-network protection enabled as the second enforcement layer against DNS rebinding.

- [ ] **Step 4: Run the URL-policy tests**

Run: `node --test tests/url-policy.test.mjs`

Expected: all four tests PASS.

- [ ] **Step 5: Commit the URL safety policy**

```bash
git add src/mcp/url-policy.js tests/url-policy.test.mjs
git commit -m "Guard MCP browsing against private targets"
```

## Task 3: Disposable Obscura worker

**Files:**
- Create: `src/mcp/worker.js`
- Create: `tests/mcp-worker.test.mjs`

**Interfaces:**
- Produces: `browseWithObscura({ url, cdpUrl, timeoutMs, maxTextChars, connect })` resolving to `{ title, finalUrl, text }`.
- Consumes: `validatePublicUrl` and `assertPublicUrl` from `src/mcp/url-policy.js`.
- `connect` defaults to Puppeteer's `connect`; tests inject a browser double.

- [ ] **Step 1: Write the failing worker lifecycle test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { browseWithObscura } from '../src/mcp/worker.js';

test('uses one new context and closes it after returning bounded text', async () => {
  const calls = [];
  const page = {
    goto: async () => calls.push('goto'),
    url: () => 'https://example.com/final',
    title: async () => 'Example',
    locator: () => ({ innerText: async () => 'x'.repeat(30) }),
  };
  const context = { newPage: async () => page, close: async () => calls.push('context.close') };
  const browser = { createBrowserContext: async () => context, disconnect: async () => calls.push('disconnect') };
  const result = await browseWithObscura({
    url: 'https://example.com', cdpUrl: 'ws://127.0.0.1:9222', timeoutMs: 1000, maxTextChars: 20,
    connect: async () => browser,
  });
  assert.deepEqual(result, { title: 'Example', finalUrl: 'https://example.com/final', text: 'x'.repeat(20) });
  assert.deepEqual(calls, ['goto', 'context.close', 'disconnect']);
});

test('closes the context when navigation fails', async () => {
  let closed = false;
  const context = { newPage: async () => ({ goto: async () => { throw new Error('timeout'); } }), close: async () => { closed = true; } };
  const browser = { createBrowserContext: async () => context, disconnect: async () => {} };
  await assert.rejects(() => browseWithObscura({ url: 'https://example.com', cdpUrl: 'ws://127.0.0.1:9222', timeoutMs: 1000, maxTextChars: 20, connect: async () => browser }));
  assert.equal(closed, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/mcp-worker.test.mjs`

Expected: FAIL because `src/mcp/worker.js` does not exist.

- [ ] **Step 3: Implement the worker with a disposable browser context**

Create `src/mcp/worker.js` using `puppeteer-core`:

```js
import puppeteer from 'puppeteer-core';
import { assertPublicUrl, validatePublicUrl } from './url-policy.js';

export async function browseWithObscura({ url, cdpUrl, timeoutMs, maxTextChars, connect = puppeteer.connect }) {
  const target = await validatePublicUrl(url);
  let browser;
  let context;
  try {
    browser = await connect({ browserWSEndpoint: cdpUrl });
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const finalUrl = assertPublicUrl(page.url()).href;
    const [title, text] = await Promise.all([
      page.title(),
      page.locator('body').innerText(),
    ]);
    return { title: title.slice(0, 500), finalUrl, text: text.slice(0, maxTextChars) };
  } finally {
    await context?.close();
    browser?.disconnect();
  }
}
```

Map a CDP connection failure to an error with code `WORKER_UNAVAILABLE`, and a Puppeteer timeout to `NAVIGATION_TIMEOUT`. Do not create a browser profile, pass a storage directory, call `evaluate`, or call Node `fetch`.

- [ ] **Step 4: Run the worker tests**

Run: `node --test tests/mcp-worker.test.mjs`

Expected: both tests PASS.

- [ ] **Step 5: Commit the isolated worker**

```bash
git add src/mcp/worker.js tests/mcp-worker.test.mjs
git commit -m "Add disposable Obscura browser worker"
```

## Task 4: OHTTP client and gateway boundary

**Files:**
- Create: `src/ohttp/client.js`
- Create: `src/ohttp/gateway.js`
- Create: `tests/ohttp.test.mjs`

**Interfaces:**
- Produces: `createOhttpBrowseClient({ relayUrl, gatewayUrl, gatewayKeyConfig, fetchImpl })` with `browse({ url })`.
- Produces: `createOhttpGateway({ keyConfig, browse })` with `handle(request)`.
- Consumes: `validatePublicUrl` from `src/mcp/url-policy.js` and `browseWithObscura` only through the injected `browse` function.
- Transport contract: gateway accepts an OHTTP-encapsulated `POST`, decapsulates JSON `{ url }`, and returns encapsulated JSON `{ title, finalUrl, text }`.

- [ ] **Step 1: Write the failing in-memory OHTTP round-trip test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { CipherSuite, KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_128_GCM } from 'hpke';
import { KeyConfig, KdfId, AeadId } from 'ohttp-ts';
import { createOhttpBrowseClient } from '../src/ohttp/client.js';
import { createOhttpGateway } from '../src/ohttp/gateway.js';

test('encapsulates a browse request through a relay without exposing JSON to it', async () => {
  const suite = new CipherSuite(KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_128_GCM);
  const privateKeyConfig = await KeyConfig.generate(suite, 1, [{ kdfId: KdfId.HKDF_SHA256, aeadId: AeadId.AES_128_GCM }]);
  const gateway = createOhttpGateway({
    keyConfig: privateKeyConfig,
    browse: async ({ url }) => ({ title: 'Example', finalUrl: url, text: 'safe result' }),
  });
  let relayBody = '';
  const client = createOhttpBrowseClient({
    relayUrl: 'https://relay.example/ohttp',
    gatewayUrl: 'https://gateway.example/ohttp',
    gatewayKeyConfig: Buffer.from(KeyConfig.serialize(privateKeyConfig)).toString('base64'),
    fetchImpl: async (_url, init) => {
      relayBody = await new Response(init.body).text();
      return gateway.handle(new Request('https://gateway.example/ohttp', init));
    },
  });
  assert.deepEqual(await client.browse({ url: 'https://example.com' }), {
    title: 'Example', finalUrl: 'https://example.com/', text: 'safe result',
  });
  assert.doesNotMatch(relayBody, /example\.com|safe result/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/ohttp.test.mjs`

Expected: FAIL because the OHTTP client and gateway modules do not exist.

- [ ] **Step 3: Implement the minimal OHTTP transport pair**

In `src/ohttp/client.js`, use the `ohttp-ts` high-level request API:

```js
const inner = new Request(gatewayUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ url }),
});
const { init, context } = await client.encapsulateRequest(inner);
const relayResponse = await fetchImpl(relayUrl, init);
const response = await context.decapsulateResponse(relayResponse);
return await response.json();
```

Build the client with `KeyConfig.parse(Buffer.from(gatewayKeyConfig, 'base64'))` and an X25519 / HKDF-SHA256 / AES-128-GCM `CipherSuite` matching the test suite.

In `src/ohttp/gateway.js`, create `new OHTTPServer([keyConfig])`, then implement `handle(request)` as:

```js
const { request: innerRequest, context } = await server.decapsulateRequest(request);
const { url } = await innerRequest.json();
const result = await browse({ url: (await validatePublicUrl(url)).href });
return context.encapsulateResponse(Response.json(result));
```

Return an encapsulated error response for invalid input. Never return an unencrypted JSON error from the gateway handler. Limit the payload to the same title/text bounds enforced by the worker. Document in code that the handler needs independent relay and gateway operators before it is a privacy service.

- [ ] **Step 4: Run the OHTTP test**

Run: `node --test tests/ohttp.test.mjs`

Expected: PASS. The captured relay payload contains neither the requested hostname nor returned text.

- [ ] **Step 5: Commit the OHTTP boundary**

```bash
git add src/ohttp/client.js src/ohttp/gateway.js tests/ohttp.test.mjs
git commit -m "Add OHTTP browse transport boundary"
```

## Task 5: MCP server and browse orchestration

**Files:**
- Create: `src/mcp/browse.js`
- Create: `mcp/server.mjs`
- Create: `tests/mcp-server.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `createBrowseHandler({ env, browseLocal, browseOhttp })` accepting `{ url }` and returning MCP-safe content.
- Produces: `mcp/server.mjs`, executable through `npm run mcp`.
- Consumes: `loadBrowseConfig`, `browseWithObscura`, and `createOhttpBrowseClient`.

- [ ] **Step 1: Write the failing MCP orchestration test**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowseHandler } from '../src/mcp/browse.js';

test('uses the local worker when OHTTP is not configured', async () => {
  const handler = createBrowseHandler({
    env: { OBSCURA_CDP_URL: 'ws://127.0.0.1:9222', TOR_SOCKS_PROXY: 'socks5://127.0.0.1:9050', BROWSER_EPHEMERAL: 'true' },
    browseLocal: async ({ url }) => ({ title: 'Example', finalUrl: url, text: 'result' }),
    browseOhttp: async () => { throw new Error('must not run'); },
  });
  assert.deepEqual(await handler({ url: 'https://example.com' }), { title: 'Example', finalUrl: 'https://example.com', text: 'result' });
});

test('returns a structured unavailable error instead of a direct fallback', async () => {
  const handler = createBrowseHandler({
    env: { OBSCURA_CDP_URL: 'ws://127.0.0.1:9222', TOR_SOCKS_PROXY: 'socks5://127.0.0.1:9050', BROWSER_EPHEMERAL: 'true' },
    browseLocal: async () => { throw Object.assign(new Error('offline'), { code: 'WORKER_UNAVAILABLE' }); },
    browseOhttp: async () => { throw new Error('must not run'); },
  });
  await assert.rejects(() => handler({ url: 'https://example.com' }), { code: 'WORKER_UNAVAILABLE' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/mcp-server.test.mjs`

Expected: FAIL because `src/mcp/browse.js` does not exist.

- [ ] **Step 3: Implement orchestration and the stdio entry point**

Create `src/mcp/browse.js` with this composition. `browseLocal` and `browseOhttp` stay injectable for unit tests; production defaults remain in the same file.

```js
import { loadBrowseConfig } from './config.js';
import { validatePublicUrl } from './url-policy.js';
import { browseWithObscura } from './worker.js';
import { createOhttpBrowseClient } from '../ohttp/client.js';

export function createBrowseHandler({ env, browseLocal = browseWithObscura, browseOhttp } = {}) {
  const config = loadBrowseConfig(env);
  const remoteBrowse = browseOhttp || (config.ohttp ? createOhttpBrowseClient(config.ohttp).browse : null);
  return async ({ url }) => {
    const target = await validatePublicUrl(url);
    if (config.mode === 'ohttp') return remoteBrowse({ url: target.href });
    return browseLocal({
      url: target.href,
      cdpUrl: config.obscuraCdpUrl,
      timeoutMs: config.browserTimeoutMs,
      maxTextChars: config.maxTextChars,
    });
  };
}
```

It must rethrow only structured error codes from the design document and never retry via direct fetch.

Create `mcp/server.mjs` using the current MCP SDK entry point:

```js
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod';
import { createBrowseHandler } from '../src/mcp/browse.js';

const handle = serveStdio(() => {
  const server = new McpServer({ name: 'tony-strk', version: '0.1.0' });
  const browse = createBrowseHandler({ env: process.env });
  server.registerTool('browse', {
    description: 'Read one public URL through an isolated Tony Strk browser worker.',
    inputSchema: { url: z.string().url() },
  }, async ({ url }) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await browse({ url })) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ code: error.code || 'BROWSE_FAILED', message: error.message }) }] };
    }
  });
  return server;
});

process.on('SIGINT', () => { void handle.close(); });
console.error('Tony Strk MCP server listening on stdio');
```

Add this script to `package.json`:

```json
"mcp": "node mcp/server.mjs"
```

- [ ] **Step 4: Run MCP and regression tests**

Run: `node --test tests/mcp-server.test.mjs && npm test`

Expected: the orchestration tests and existing landing tests PASS. Use `npx @modelcontextprotocol/inspector npm run mcp` only after Obscura/Tor are installed, and verify that stdout contains JSON-RPC only.

- [ ] **Step 5: Commit the local MCP server**

```bash
git add src/mcp/browse.js mcp/server.mjs tests/mcp-server.test.mjs package.json package-lock.json
git commit -m "Expose isolated browsing through MCP"
```

## Task 6: Keep the landing page and local documentation accurate

**Files:**
- Modify: `src/route.js`
- Modify: `app/RoutePreview.js`
- Modify: `app/page.js`
- Modify: `README.md`
- Modify: `tests/route.test.mjs`
- Modify: `tests/landing-assets.test.mjs`

**Interfaces:**
- Consumes: the standalone MCP process, but the landing page does not call it.
- Produces: copy that distinguishes the route-mapping UI from `npm run mcp` and labels OHTTP as configured-only until external endpoints exist.

- [ ] **Step 1: Write the failing copy and route tests**

```js
assert.deepEqual(route.steps.map(({ label }) => label), [
  'Local route input',
  'MCP browse tool',
  'OHTTP boundary',
  'Obscura and Tor worker',
]);
assert.match(page, /The landing page does not send the request/i);
assert.match(page, /npm run mcp/i);
assert.match(page, /OHTTP requires separately operated relay and gateway services/i);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/route.test.mjs tests/landing-assets.test.mjs`

Expected: FAIL because the landing page still describes only planned MCP/worker layers.

- [ ] **Step 3: Update the mapper and docs without changing its client-only behavior**

Update `src/route.js` to expose these exact conceptual steps:

```js
[
  ['01', 'Local route input', 'The landing page validates a public HTTP(S) destination locally.'],
  ['02', 'MCP browse tool', 'Run the local MCP server separately to execute one approved browse request.'],
  ['03', 'OHTTP boundary', 'OHTTP activates only with separately operated relay and gateway services.'],
  ['04', 'Obscura and Tor worker', 'The worker uses a disposable browser context and never falls back to a direct request.'],
]
```

Change `app/RoutePreview.js` to render `route.steps` rather than a second hard-coded step list. Preserve the existing submit behavior and message that it maps locally without sending a request.

Update the landing and README copy to state:

- `npm run mcp` starts the separate local MCP process.
- Obscura must be bound to `127.0.0.1` with Tor configured.
- OHTTP is fully active only after independently operated relay and gateway URLs are configured.
- The landing page itself does not send a URL, use a wallet, or process payment.

- [ ] **Step 4: Run visual/build and test verification**

Run:

```bash
npm test
npm run typecheck
npm run build
curl -fsS http://127.0.0.1:3000/ > /dev/null
```

Expected: all tests and build PASS, and the running landing page remains a local route mapper.

- [ ] **Step 5: Commit the truthful product surface**

```bash
git add src/route.js app/RoutePreview.js app/page.js README.md tests/route.test.mjs tests/landing-assets.test.mjs
git commit -m "Document local MCP and OHTTP workflow"
```

## Final verification

- [ ] Confirm `git status --short` is clean after local commits.
- [ ] Confirm `git log origin/main..HEAD --oneline` lists commits locally only; do not run `git push`.
- [ ] Start Obscura manually with `obscura serve --host 127.0.0.1 --port 9222 --stealth --proxy socks5://127.0.0.1:9050` and do not use private-network or file-access flags.
- [ ] With Tor running, call the MCP `browse` tool against `https://check.torproject.org/api/ip`; confirm the tool returns page text and a Tor result.
- [ ] Call `browse` with `http://127.0.0.1/` and confirm `URL_NOT_ALLOWED`.
- [ ] Stop Obscura and call `browse` again; confirm `WORKER_UNAVAILABLE` with no direct-network fallback.
- [ ] Leave OHTTP endpoints unset and confirm local mode works. Then run only the in-memory OHTTP test; do not claim that test is an anonymous deployment.

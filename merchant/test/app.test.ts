import assert from "node:assert/strict";
import test from "node:test";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMerchantApp } from "../src/app.ts";
import { createFileStore } from "../src/store.ts";
import type { MerchantDeps } from "../src/app.ts";
import { resourceHash } from "../src/catalog.ts";
import { PAYWALL_PAID } from "../src/receipt.ts";
import type { ChainReceipt } from "../src/receipt.ts";

const ANONYMIZER = "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
const PAY_TO = "0x4d45524348414e54";
const ASSET = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const SLUG = "agent-privacy";
const PRICE = 50_000_000_000_000_000n;
const NETWORK = "starknet:SN_SEPOLIA";

type Json = Record<string, any>;

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
const decode = (value: string) => JSON.parse(Buffer.from(value, "base64").toString("utf8"));

/**
 * A receipt shaped exactly like the real one — the verifier is already tested
 * against genuine chain data in receipt.test.ts, so these tests are about the
 * HTTP protocol on top: what unlocks, what is refused, and what can be reused.
 */
const receiptFor = (slug: string, price = PRICE): ChainReceipt => ({
  transaction_hash: "0xabc123",
  execution_status: "SUCCEEDED",
  finality_status: "ACCEPTED_ON_L2",
  events: [
    { from_address: "0x9999", keys: ["0x1"], data: [] },
    {
      from_address: ANONYMIZER,
      keys: [PAYWALL_PAID, PAY_TO, resourceHash(slug)],
      data: [ASSET, `0x${price.toString(16)}`],
    },
  ],
});

function harness(overrides: Partial<MerchantDeps> = {}) {
  let clock = 1_000_000;
  const app = createMerchantApp({
    payTo: PAY_TO,
    anonymizer: ANONYMIZER,
    asset: ASSET,
    network: NETWORK,
    explorerBase: "https://sepolia.voyager.online",
    fetchReceipt: async () => receiptFor(SLUG),
    now: () => clock,
    ...overrides,
  });
  const server = app.listen(0);
  const { port } = server.address() as { port: number };
  return {
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    advance: (ms: number) => { clock += ms; },
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

async function requiredFor(h: ReturnType<typeof harness>, path = `/article/${SLUG}`) {
  const res = await fetch(h.url(path));
  assert.equal(res.status, 402);
  const body = await res.json();
  const header = res.headers.get("PAYMENT-REQUIRED");
  assert.ok(header, "missing PAYMENT-REQUIRED");
  const required = decode(header) as Json;
  assert.deepEqual(body, required);
  return { required, header };
}

const payloadFor = (required: Json, changes: Json = {}) => encode({
  x402Version: 2,
  resource: required.resource,
  accepted: required.accepts[0],
  payload: { transactionHash: "0xabc123" },
  extensions: {},
  ...changes,
});

async function paid(h: ReturnType<typeof harness>, payment = (required: Json) => payloadFor(required)) {
  const { required } = await requiredFor(h);
  return fetch(h.url(`/article/${SLUG}`), {
    headers: { "PAYMENT-SIGNATURE": payment(required) },
  });
}

test("an unpaid article answers 402 with canonical v2 terms", async (t) => {
  const h = harness();
  t.after(h.close);

  const { required, header } = await requiredFor(h);
  assert.equal(required.x402Version, 2);
  assert.equal(required.error, "PAYMENT-SIGNATURE header is required");
  assert.equal(required.resource.description, "Why your agent leaks more than you do");
  assert.equal(required.resource.mimeType, "text/html");
  assert.equal(required.resource.serviceName, "Ledger & Lantern");
  assert.deepEqual(required.resource.tags, ["privacy", "research"]);
  assert.match(required.resource.url, /^http:\/\/127\.0\.0\.1:\d+\/article\/agent-privacy$/);
  const accepted = required.accepts[0];
  assert.equal(accepted.scheme, "strk20-anonymizer");
  assert.equal(accepted.network, NETWORK);
  assert.equal(accepted.amount, PRICE.toString());
  assert.equal(accepted.asset, ASSET);
  assert.equal(accepted.payTo, PAY_TO);
  assert.equal(accepted.maxTimeoutSeconds, 600);
  assert.equal(accepted.extra.assetTransferMethod, "strk20-privacy-invoke");
  assert.equal(accepted.extra.paymentFlow, "upfront");
  assert.equal(accepted.extra.anonymizer, ANONYMIZER);
  assert.equal(accepted.extra.resourceHash, resourceHash(SLUG));
  assert.equal("maxAmountRequired" in accepted, false);
  assert.equal("X-Payment" in required, false);
  assert.match(header, /^[A-Za-z0-9+/]+={0,2}$/);
});

test("the v2 terms do not claim to be x402's exact scheme", async (t) => {
  const h = harness();
  t.after(h.close);
  const { required } = await requiredFor(h);
  assert.notEqual(required.accepts[0].scheme, "exact");
});

test("a valid v2 payload unlocks the article and returns PAYMENT-RESPONSE", async (t) => {
  const h = harness();
  t.after(h.close);

  const res = await paid(h);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Why your agent leaks more than you do/);

  const responseHeader = res.headers.get("PAYMENT-RESPONSE");
  assert.ok(responseHeader, "missing PAYMENT-RESPONSE");
  assert.deepEqual(decode(responseHeader), {
    success: true,
    transaction: "0xabc123",
    network: NETWORK,
    amount: PRICE.toString(),
  });
  assert.ok(res.headers.get("x-access-token"), "no access token issued");
});

test("accepted felt fields compare numerically", async (t) => {
  const h = harness();
  t.after(h.close);
  const res = await paid(h, (required) => {
    const offer = required.accepts[0];
    return payloadFor(required, {
      accepted: {
        ...offer,
        asset: BigInt(ASSET).toString(10),
        payTo: BigInt(PAY_TO).toString(10),
        extra: {
          ...offer.extra,
          anonymizer: BigInt(ANONYMIZER).toString(10),
          resourceHash: BigInt(offer.extra.resourceHash).toString(10),
        },
      },
    });
  });
  assert.equal(res.status, 200);
});

test("a malformed base64 signature is rejected before any chain lookup", async (t) => {
  let looked = false;
  const h = harness({ fetchReceipt: async () => { looked = true; return receiptFor(SLUG); } });
  t.after(h.close);
  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "PAYMENT-SIGNATURE": "not-base64" },
  });
  assert.equal(res.status, 400);
  assert.equal(looked, false);
});

test("a non-canonical base64 signature is rejected before any chain lookup", async (t) => {
  let looked = false;
  const h = harness({ fetchReceipt: async () => { looked = true; return receiptFor(SLUG); } });
  t.after(h.close);
  const { required } = await requiredFor(h);
  const canonical = payloadFor(required);
  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "PAYMENT-SIGNATURE": `${canonical}=` },
  });
  assert.equal(res.status, 400);
  assert.equal(looked, false);
});

test("a payload without a transaction hash is rejected before any chain lookup", async (t) => {
  let looked = false;
  const h = harness({ fetchReceipt: async () => { looked = true; return receiptFor(SLUG); } });
  t.after(h.close);
  const { required } = await requiredFor(h);
  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: {
      "PAYMENT-SIGNATURE": payloadFor(required, { payload: {} }),
    },
  });
  assert.equal(res.status, 400);
  assert.equal(looked, false);
});

test("a payload with the wrong version is rejected before any chain lookup", async (t) => {
  let looked = false;
  const h = harness({ fetchReceipt: async () => { looked = true; return receiptFor(SLUG); } });
  t.after(h.close);
  const { required } = await requiredFor(h);
  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "PAYMENT-SIGNATURE": payloadFor(required, { x402Version: 1 }) },
  });
  assert.equal(res.status, 400);
  assert.equal(looked, false);
});

for (const [name, mutate] of [
  ["resource URL", (required: Json) => ({ resource: { ...required.resource, url: `${required.resource.url}/other` } })],
  ["amount", (required: Json) => ({ accepted: { ...required.accepts[0], amount: (PRICE + 1n).toString() } })],
  ["asset", (required: Json) => ({ accepted: { ...required.accepts[0], asset: "0x1234" } })],
  ["payee", (required: Json) => ({ accepted: { ...required.accepts[0], payTo: "0x1234" } })],
  ["helper", (required: Json) => ({ accepted: { ...required.accepts[0], extra: { ...required.accepts[0].extra, anonymizer: "0x1234" } } })],
  ["resource hash", (required: Json) => ({ accepted: { ...required.accepts[0], extra: { ...required.accepts[0].extra, resourceHash: "0x1234" } } })],
  ["network", (required: Json) => ({ accepted: { ...required.accepts[0], network: "starknet:SN_MAIN" } })],
] as const) {
  test(`a payload with a changed ${name} is rejected`, async (t) => {
    let looked = false;
    const h = harness({ fetchReceipt: async () => { looked = true; return receiptFor(SLUG); } });
    t.after(h.close);
    const { required } = await requiredFor(h);
    const res = await fetch(h.url(`/article/${SLUG}`), {
      headers: { "PAYMENT-SIGNATURE": payloadFor(required, mutate(required)) },
    });
    assert.equal(res.status, 400);
    assert.equal(looked, false);
  });
}

test("an X-Payment header is not a payment fallback", async (t) => {
  let looked = false;
  const h = harness({ fetchReceipt: async () => { looked = true; return receiptFor(SLUG); } });
  t.after(h.close);
  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "X-Payment": "0xabc123" },
  });
  assert.equal(res.status, 402);
  assert.equal(looked, false);
  assert.ok(res.headers.get("PAYMENT-REQUIRED"));
});

test("a transaction that is not readable returns a pending PAYMENT-RESPONSE", async (t) => {
  const h = harness({
    fetchReceipt: async () => {
      throw new Error("Transaction hash not found");
    },
  });
  t.after(h.close);

  const res = await paid(h);
  assert.equal(res.status, 402);
  const responseHeader = res.headers.get("PAYMENT-RESPONSE");
  assert.ok(responseHeader, "missing PAYMENT-RESPONSE");
  assert.deepEqual(decode(responseHeader), {
    success: false,
    errorReason: "settlement_pending",
    transaction: "0xabc123",
    network: NETWORK,
  });
});

test("a valid event from a different transaction does not unlock the article", async (t) => {
  const h = harness({
    fetchReceipt: async () => ({ ...receiptFor(SLUG), transaction_hash: "0xdef456" }),
  });
  t.after(h.close);

  const res = await paid(h);
  assert.equal(res.status, 402);
  assert.match((await res.json()).error, /transaction hash/);
});

test("concurrent redemption of one receipt grants access only once", async (t) => {
  const h = harness();
  t.after(h.close);
  const { required } = await requiredFor(h);
  const signature = payloadFor(required);

  const responses = await Promise.all([
    fetch(h.url(`/article/${SLUG}`), { headers: { "PAYMENT-SIGNATURE": signature } }),
    fetch(h.url(`/article/${SLUG}`), { headers: { "PAYMENT-SIGNATURE": signature } }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort((a, b) => a - b), [200, 409]);
});

test("the access token reads again without paying again", async (t) => {
  const h = harness();
  t.after(h.close);
  const paidResponse = await paid(h);
  const token = paidResponse.headers.get("x-access-token")!;
  const again = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Access-Token": token } });
  assert.equal(again.status, 200);
});

test("an access token does not unlock a different article", async (t) => {
  const h = harness();
  t.after(h.close);
  const paidResponse = await paid(h);
  const token = paidResponse.headers.get("x-access-token")!;
  const other = await fetch(h.url("/article/the-402-that-works"), {
    headers: { "X-Access-Token": token },
  });
  assert.equal(other.status, 402);
});

test("an expired access token stops working", async (t) => {
  const h = harness({ accessTtlMs: 1000 });
  t.after(h.close);
  const paidResponse = await paid(h);
  const token = paidResponse.headers.get("x-access-token")!;
  h.advance(1001);
  const late = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Access-Token": token } });
  assert.equal(late.status, 402);
});

test("a receipt cannot be redeemed twice", async (t) => {
  const h = harness();
  t.after(h.close);
  const first = await paid(h);
  assert.equal(first.status, 200);
  const replay = await paid(h);
  assert.equal(replay.status, 409);
  assert.match((await replay.json()).error, /already been redeemed/);
});

test("replay detection normalizes the hash, so padding cannot buy a second read", async (t) => {
  const h = harness();
  t.after(h.close);
  await paid(h);
  const replay = await paid(h, (required) => payloadFor(required, {
    payload: { transactionHash: "0x0000abc123" },
  }));
  assert.equal(replay.status, 409);
});

test("a receipt for another article does not unlock this one", async (t) => {
  const h = harness({ fetchReceipt: async () => receiptFor("the-402-that-works") });
  t.after(h.close);
  const res = await paid(h);
  assert.equal(res.status, 402);
  assert.match((await res.json()).error, /no PaywallPaid receipt/);
});

test("underpaying does not unlock the article", async (t) => {
  const h = harness({ fetchReceipt: async () => receiptFor(SLUG, PRICE - 1n) });
  t.after(h.close);
  const res = await paid(h);
  assert.equal(res.status, 402);
});

test("an unknown article is 404, not a payment prompt", async (t) => {
  const h = harness();
  t.after(h.close);
  assert.equal((await fetch(h.url("/article/nope"))).status, 404);
});

test("the index lists every article and is free to read", async (t) => {
  const h = harness();
  t.after(h.close);
  const res = await fetch(h.url("/"));
  assert.equal(res.status, 200);
  const html = await res.text();
  for (const slug of ["agent-privacy", "settlement-without-identity", "the-402-that-works"]) {
    assert.match(html, new RegExp(slug));
  }
});

test("a redeemed receipt stays redeemed across a merchant restart", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "merchant-restart-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "state.json");

  const boot = async () => {
    const app = createMerchantApp({
      payTo: PAY_TO,
      anonymizer: ANONYMIZER,
      asset: ASSET,
      network: NETWORK,
      explorerBase: "https://sepolia.voyager.online",
      fetchReceipt: async () => receiptFor(SLUG),
      store: await createFileStore(path),
    });
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    return {
      url: `http://127.0.0.1:${port}/article/${SLUG}`,
      close: () => {
        server.closeAllConnections();
        server.close();
      },
    };
  };

  const first = await boot();
  const unpaid = await fetch(first.url);
  const required = decode(unpaid.headers.get("PAYMENT-REQUIRED")!);
  const paidResponse = await fetch(first.url, {
    headers: { "PAYMENT-SIGNATURE": payloadFor(required) },
  });
  assert.equal(paidResponse.status, 200);
  const token = paidResponse.headers.get("x-access-token")!;
  await first.close();

  const second = await boot();
  t.after(second.close);
  const challenge = decode((await fetch(second.url)).headers.get("PAYMENT-REQUIRED")!);
  const replay = await fetch(second.url, {
    headers: { "PAYMENT-SIGNATURE": payloadFor(challenge) },
  });
  assert.equal(replay.status, 409, "a restart must not re-open a spent receipt");
  const returning = await fetch(second.url, { headers: { "X-Access-Token": token } });
  assert.equal(returning.status, 200);
});

test("behind a trusted proxy the terms name the URL the client actually used", async (t) => {
  const h = harness({ trustProxy: 1 });
  t.after(h.close);
  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "shop.example" },
  });
  const required = decode(res.headers.get("PAYMENT-REQUIRED")!);
  assert.match(required.resource.url, /^https:\/\/127\.0\.0\.1:\d+\//);
});

test("without trust proxy a forwarded header cannot rewrite the terms", async (t) => {
  const h = harness();
  t.after(h.close);
  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "X-Forwarded-Proto": "https" },
  });
  const required = decode(res.headers.get("PAYMENT-REQUIRED")!);
  assert.match(required.resource.url, /^http:\/\//);
});

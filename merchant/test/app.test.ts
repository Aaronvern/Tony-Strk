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

/**
 * A receipt shaped exactly like the real one — the verifier is already tested
 * against genuine chain data in receipt.test.ts, so these tests are about the
 * HTTP protocol on top: what unlocks, what is refused, and what can be reused.
 */
const receiptFor = (slug: string, price = PRICE): ChainReceipt => ({
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
    network: "starknet-sepolia",
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
    close: () => new Promise((done) => server.close(done)),
  };
}

test("an unpaid article answers 402 with terms an agent can act on", async (t) => {
  const h = harness();
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`));
  assert.equal(res.status, 402);

  const body = await res.json();
  const [terms] = body.accepts;
  assert.equal(terms.scheme, "strk20-anonymizer");
  assert.equal(terms.payTo, PAY_TO);
  assert.equal(terms.asset, ASSET);
  assert.equal(terms.maxAmountRequired, PRICE.toString());
  assert.equal(terms.extra.anonymizer, ANONYMIZER);
  assert.equal(terms.extra.resourceHash, resourceHash(SLUG));
});

test("the 402 does not claim to be x402's exact scheme", async (t) => {
  // x402's Starknet `exact` scheme needs a signed OutsideExecution from an
  // identified payer, which is precisely what this cannot have. Borrowing the
  // envelope is fine; borrowing the name would be a lie.
  const h = harness();
  t.after(h.close);
  const body = await (await fetch(h.url(`/article/${SLUG}`))).json();
  assert.notEqual(body.accepts[0].scheme, "exact");
});

test("a verified receipt unlocks the article and returns an access token", async (t) => {
  const h = harness();
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Why your agent leaks more than you do/);

  const token = res.headers.get("x-access-token");
  assert.ok(token, "no access token issued");
  assert.equal(res.headers.get("x-payment-verified"), `${PRICE} ${ASSET}`);
});

test("the access token reads again without paying again", async (t) => {
  const h = harness();
  t.after(h.close);

  const paid = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  const token = paid.headers.get("x-access-token")!;

  const again = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Access-Token": token } });
  assert.equal(again.status, 200);
});

test("an access token does not unlock a different article", async (t) => {
  const h = harness();
  t.after(h.close);

  const paid = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  const token = paid.headers.get("x-access-token")!;

  const other = await fetch(h.url("/article/the-402-that-works"), {
    headers: { "X-Access-Token": token },
  });
  assert.equal(other.status, 402);
});

test("an expired access token stops working", async (t) => {
  const h = harness({ accessTtlMs: 1000 });
  t.after(h.close);

  const paid = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  const token = paid.headers.get("x-access-token")!;
  h.advance(1001);

  const late = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Access-Token": token } });
  assert.equal(late.status, 402);
});

test("a receipt cannot be redeemed twice", async (t) => {
  // Without this the first buyer could publish their transaction hash and
  // everyone else would read for free.
  const h = harness();
  t.after(h.close);

  const first = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  assert.equal(first.status, 200);

  const replay = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  assert.equal(replay.status, 409);
  assert.match((await replay.json()).error, /already been redeemed/);
});

test("replay detection normalizes the hash, so padding cannot buy a second read", async (t) => {
  const h = harness();
  t.after(h.close);

  await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  const padded = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "X-Payment": "0x0000abc123" },
  });
  assert.equal(padded.status, 409);
});

test("a receipt for another article does not unlock this one", async (t) => {
  const h = harness({ fetchReceipt: async () => receiptFor("the-402-that-works") });
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  assert.equal(res.status, 402);
  assert.match((await res.json()).error, /no PaywallPaid receipt/);
});

test("underpaying does not unlock the article", async (t) => {
  const h = harness({ fetchReceipt: async () => receiptFor(SLUG, PRICE - 1n) });
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  assert.equal(res.status, 402);
});

test("a transaction the node has not seen yet says so, and stays payable", async (t) => {
  const h = harness({
    fetchReceipt: async () => {
      throw new Error("Transaction hash not found");
    },
  });
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "0xabc123" } });
  assert.equal(res.status, 402);
  const body = await res.json();
  assert.match(body.detail, /not found/i);
  // The terms come back, so a payer who simply retried too early can wait
  // rather than conclude the payment was rejected and pay a second time.
  assert.equal(body.accepts[0].extra.resourceHash, resourceHash(SLUG));
});

test("a junk X-Payment header is rejected before any chain lookup", async (t) => {
  let looked = false;
  const h = harness({
    fetchReceipt: async () => {
      looked = true;
      return receiptFor(SLUG);
    },
  });
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`), { headers: { "X-Payment": "not-a-hash" } });
  assert.equal(res.status, 400);
  assert.equal(looked, false);
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
  // The whole reason the store is on disk. PaywallPaid is public: anyone
  // watching the pool can read a valid hash, so a spent set that empties on
  // restart hands out free articles to whoever is looking.
  const dir = await mkdtemp(join(tmpdir(), "merchant-restart-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "state.json");

  const boot = async () => {
    const app = createMerchantApp({
      payTo: PAY_TO,
      anonymizer: ANONYMIZER,
      asset: ASSET,
      network: "starknet-sepolia",
      explorerBase: "https://sepolia.voyager.online",
      fetchReceipt: async () => receiptFor(SLUG),
      store: await createFileStore(path),
    });
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    return {
      url: `http://127.0.0.1:${port}/article/${SLUG}`,
      close: () => new Promise((done) => server.close(done)),
    };
  };

  const first = await boot();
  const paid = await fetch(first.url, { headers: { "X-Payment": "0xabc123" } });
  assert.equal(paid.status, 200);
  const token = paid.headers.get("x-access-token")!;
  await first.close();

  const second = await boot();
  t.after(second.close);

  const replay = await fetch(second.url, { headers: { "X-Payment": "0xabc123" } });
  assert.equal(replay.status, 409, "a restart must not re-open a spent receipt");

  // And the reader who actually paid is not asked to pay again.
  const returning = await fetch(second.url, { headers: { "X-Access-Token": token } });
  assert.equal(returning.status, 200);
});

test("behind a trusted proxy the terms name the URL the client actually used", async (t) => {
  // TLS terminates at the proxy, so req.protocol is http inside. Advertising
  // http:// terms for an https:// request makes a careful payer refuse, since
  // those are different origins.
  const h = harness({ trustProxy: 1 });
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "shop.example" },
  });
  const [terms] = (await res.json()).accepts;
  assert.match(terms.resource, /^https:\/\//);
});

test("without trust proxy a forwarded header cannot rewrite the terms", async (t) => {
  // X-Forwarded-Proto is a header any client can send. It is only meaningful
  // when something in front is known to overwrite it.
  const h = harness();
  t.after(h.close);

  const res = await fetch(h.url(`/article/${SLUG}`), {
    headers: { "X-Forwarded-Proto": "https" },
  });
  const [terms] = (await res.json()).accepts;
  assert.match(terms.resource, /^http:\/\//);
});

import assert from "node:assert/strict";
import test from "node:test";

import { settlePaywall, type SettleDeps } from "../src/pay/settle.ts";
import {
  buildPaymentPayload,
  parsePaymentRequiredHeader,
} from "../src/pay/paywall.ts";

const ANONYMIZER = "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
const ASSET = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const PAY_TO = "0x4d45524348414e54";
const RESOURCE_HASH = "0xffa430bc25381cb7e9c9cb8d01ea317794dfb78741a7748fecd59c796f3b75";
const URL = "https://example.com/article/agent-privacy";
const NETWORK = "starknet:SN_SEPOLIA";
const PRICE = 50_000_000_000_000_000n;
const RESOURCE = {
  url: URL,
  description: "Why your agent leaks more than you do",
  mimeType: "text/html",
  serviceName: "Ledger & Lantern",
  tags: ["privacy", "research"],
};
const ACCEPTED = {
  scheme: "strk20-anonymizer",
  network: NETWORK,
  amount: PRICE.toString(),
  asset: ASSET,
  payTo: PAY_TO,
  maxTimeoutSeconds: 600,
  extra: {
    assetTransferMethod: "strk20-privacy-invoke",
    paymentFlow: "upfront",
    anonymizer: ANONYMIZER,
    resourceHash: RESOURCE_HASH,
  },
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");

const termsBody = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: RESOURCE,
  accepts: [{ ...ACCEPTED, ...over, extra: { ...ACCEPTED.extra, ...extra } }],
  extensions: {},
});

const paywall = (body = termsBody(), withHeader = true) =>
  new Response(JSON.stringify({ error: "payment required" }), {
    status: 402,
    headers: withHeader ? {
      "content-type": "application/json",
      "PAYMENT-REQUIRED": encode(body),
    } : { "content-type": "application/json" },
  });

const unlocked = (response = {
  success: true,
  transaction: "0xabc123",
  network: NETWORK,
  amount: PRICE.toString(),
}) =>
  new Response("<html><head><title>Paid</title></head><body><p>The article.</p></body></html>", {
    status: 200,
    headers: {
      "content-type": "text/html",
      "PAYMENT-RESPONSE": encode(response),
    },
  });

const pending = (response = {
  success: false,
  errorReason: "settlement_pending",
  transaction: "0xabc123",
  network: NETWORK,
}) =>
  new Response(JSON.stringify({ error: "settlement_pending" }), {
    status: 402,
    headers: { "PAYMENT-RESPONSE": encode(response) },
  });

function harness(overrides: Partial<SettleDeps> = {}, body = termsBody()) {
  const submitted: unknown[][] = [];
  const seen: Array<Record<string, string> | undefined> = [];

  const deps: SettleDeps = {
    torProxy: "socks5://127.0.0.1:9050",
    fetchImpl: (_target, options) => {
      seen.push(options.headers);
      return options.headers?.["PAYMENT-SIGNATURE"] ? unlocked() : paywall(body);
    },
    getWallet: async () => ({
      strk20InvokeTransaction: async (actions: unknown[]) => {
        submitted.push(actions);
        return { transaction_hash: "0xabc123" };
      },
    }),
    getPayerAddress: async () => "0x077f1679",
    trustedAnonymizers: [ANONYMIZER],
    maxPrice: 10n ** 18n,
    asset: ASSET,
    explorerBase: "https://sepolia.starkscan.co",
    sleep: async () => {},
    ...overrides,
  };

  return { deps, submitted, seen };
}

test("a page that costs nothing is returned without paying", async () => {
  const { deps, submitted } = harness({
    fetchImpl: () => new Response("<html><body>free</body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  });

  const result = await settlePaywall({ url: URL }, deps);
  assert.equal(result.paid, false);
  assert.equal(result.status, 200);
  assert.equal(submitted.length, 0);
});

test("a v2 PAYMENT-REQUIRED challenge is settled and the unlocked page comes back", async () => {
  const { deps, submitted } = harness();
  const result = await settlePaywall({ url: URL }, deps);
  assert.equal(result.paid, true);
  assert.equal(result.status, 200);
  assert.equal(result.transactionHash, "0xabc123");
  assert.equal(result.amountWei, PRICE.toString());
  assert.equal(result.explorerUrl, "https://sepolia.starkscan.co/tx/0xabc123");
  assert.match(result.text, /The article/);
  assert.equal(submitted.length, 1);
});

test("a paid 2xx without PAYMENT-RESPONSE fails with the paid hash", async () => {
  const { deps, submitted } = harness({
    fetchImpl: (_target, options) =>
      options.headers?.["PAYMENT-SIGNATURE"]
        ? new Response("free", { status: 200 })
        : paywall(),
  });

  await assert.rejects(
    () => settlePaywall({ url: URL }, deps),
    (error: Error) => {
      assert.match(error.message, /0xabc123/);
      return true;
    },
  );
  assert.equal(submitted.length, 1);
});

test("a paid retry with malformed PAYMENT-RESPONSE fails without polling", async () => {
  let requests = 0;
  const { deps, submitted } = harness({
    fetchImpl: (_target, options) => {
      requests++;
      return options.headers?.["PAYMENT-SIGNATURE"]
        ? new Response("bad", { status: 200, headers: { "PAYMENT-RESPONSE": "not-base64" } })
        : paywall();
    },
  });

  await assert.rejects(() => settlePaywall({ url: URL }, deps), /0xabc123/);
  assert.equal(requests, 2);
  assert.equal(submitted.length, 1);
});

test("a paid retry with mismatched PAYMENT-RESPONSE fails without polling", async () => {
  let requests = 0;
  const { deps, submitted } = harness({
    fetchImpl: (_target, options) => {
      requests++;
      return options.headers?.["PAYMENT-SIGNATURE"]
        ? unlocked({
          success: true,
          transaction: "0xdeadbeef",
          network: NETWORK,
          amount: PRICE.toString(),
        })
        : paywall();
    },
  });

  await assert.rejects(() => settlePaywall({ url: URL }, deps), /0xabc123/);
  assert.equal(requests, 2);
  assert.equal(submitted.length, 1);
});

test("a paid response must match the advertised network and amount", async () => {
  for (const response of [
    { success: true, transaction: "0xabc123", network: "starknet:SN_MAIN", amount: PRICE.toString() },
    { success: true, transaction: "0xabc123", network: NETWORK, amount: (PRICE + 1n).toString() },
  ]) {
    const { deps, submitted } = harness({
      fetchImpl: (_target, options) =>
        options.headers?.["PAYMENT-SIGNATURE"] ? unlocked(response) : paywall(),
    });
    await assert.rejects(() => settlePaywall({ url: URL }, deps), /0xabc123/);
    assert.equal(submitted.length, 1);
  }
});

test("a paid retry with a 500 fails with the paid hash", async () => {
  const { deps, submitted } = harness({
    fetchImpl: (_target, options) =>
      options.headers?.["PAYMENT-SIGNATURE"]
        ? new Response("server error", { status: 500 })
        : paywall(),
  });

  await assert.rejects(() => settlePaywall({ url: URL }, deps), /0xabc123/);
  assert.equal(submitted.length, 1);
});

test("a paid retry with a permanent 402 rejection fails instead of polling", async () => {
  let requests = 0;
  const { deps, submitted } = harness({
    fetchImpl: (_target, options) => {
      requests++;
      return options.headers?.["PAYMENT-SIGNATURE"]
        ? pending({
          success: false,
          errorReason: "settlement_rejected",
          transaction: "0xabc123",
          network: NETWORK,
        })
        : paywall();
    },
  });

  await assert.rejects(() => settlePaywall({ url: URL }, deps), /0xabc123/);
  assert.equal(requests, 2);
  assert.equal(submitted.length, 1);
});

test("the paid retry carries only the canonical v2 PAYMENT-SIGNATURE", async () => {
  const { deps, seen } = harness();
  await settlePaywall({ url: URL }, deps);

  assert.equal(seen.length, 2);
  assert.equal(seen[0], undefined, "the first look must not send a receipt");
  assert.deepEqual(Object.keys(seen[1] ?? {}), ["PAYMENT-SIGNATURE"]);
  const terms = parsePaymentRequiredHeader(encode(termsBody()), {
    trustedAnonymizers: [ANONYMIZER],
    maxPrice: 10n ** 18n,
    asset: ASSET,
    requestedUrl: URL,
  });
  assert.equal(
    seen[1]?.["PAYMENT-SIGNATURE"],
    encode(buildPaymentPayload(terms, "0xabc123")),
  );
  assert.deepEqual(JSON.parse(Buffer.from(seen[1]!["PAYMENT-SIGNATURE"], "base64").toString()), {
    x402Version: 2,
    resource: RESOURCE,
    accepted: ACCEPTED,
    payload: { transactionHash: "0xabc123" },
    extensions: {},
  });
});

test("a body-only v1 challenge is rejected without spending", async () => {
  const v1 = {
    x402Version: 1,
    accepts: [{ scheme: "strk20-anonymizer", network: "starknet-sepolia", maxAmountRequired: PRICE.toString() }],
  };
  const { deps, submitted } = harness({
    fetchImpl: () => new Response(JSON.stringify(v1), { status: 402 }),
  });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /PAYMENT-REQUIRED/i);
  assert.equal(submitted.length, 0);
});

test("no Tor circuit means no payment and no request", async () => {
  let attempted = false;
  const { deps, submitted } = harness({
    torProxy: "",
    fetchImpl: () => {
      attempted = true;
      return paywall();
    },
  });

  await assert.rejects(() => settlePaywall({ url: URL }, deps), /tor/i);
  assert.equal(attempted, false);
  assert.equal(submitted.length, 0);
});

test("an untrusted helper is refused before any spending", async () => {
  const { deps, submitted } = harness({}, termsBody({}, { anonymizer: "0xbadc0de" }));
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /does not trust/);
  assert.equal(submitted.length, 0);
});

test("a price above the ceiling is refused before any spending", async () => {
  const { deps, submitted } = harness({ maxPrice: PRICE - 1n });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /above the .* ceiling/);
  assert.equal(submitted.length, 0);
});

test("a per-call ceiling can tighten but never raise the configured one", async () => {
  const lower = harness();
  await assert.rejects(
    () => settlePaywall({ url: URL, maxPrice: PRICE - 1n }, lower.deps),
    /above the .* ceiling/,
  );
  assert.equal(lower.submitted.length, 0);

  const higher = harness({ maxPrice: PRICE - 1n });
  await assert.rejects(
    () => settlePaywall({ url: URL, maxPrice: 10n ** 24n }, higher.deps),
    /above the .* ceiling/,
  );
  assert.equal(higher.submitted.length, 0);
});

test("no spending key refuses with something the caller can act on", async () => {
  const { deps } = harness({ getWallet: async () => null });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /wallet_status/);
});

test("a 402 without PAYMENT-REQUIRED is refused, not guessed at from its body", async () => {
  const { deps, submitted } = harness({
    fetchImpl: () => new Response(JSON.stringify(termsBody()), { status: 402 }),
  });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /PAYMENT-REQUIRED/i);
  assert.equal(submitted.length, 0);
});

test("a merchant that cannot see the payment yet is retried, not paid twice", async () => {
  let look = 0;
  const { deps, submitted } = harness({
    fetchImpl: (_target, options) => {
      look++;
      if (!options.headers?.["PAYMENT-SIGNATURE"]) return paywall();
      return look < 4 ? pending() : unlocked();
    },
  });

  const result = await settlePaywall({ url: URL }, deps);
  assert.equal(result.paid, true);
  assert.equal(submitted.length, 1);
});

test("giving up after payment leads with the paid hash", async () => {
  const { deps, submitted } = harness({ fetchImpl: () => paywall() });
  await assert.rejects(
    () => settlePaywall({ url: URL }, deps),
    (error: Error) => {
      assert.match(error.message, /0xabc123/);
      assert.match(error.message, /rather than paying again/);
      return true;
    },
  );
  assert.equal(submitted.length, 1);
});

test("the settlement is the two-leg action list funded to the exact price", async () => {
  const { deps, submitted } = harness();
  await settlePaywall({ url: URL }, deps);
  const [withdraw, invoke] = submitted[0] as any[];
  assert.deepEqual(withdraw, {
    type: "withdraw",
    token: ASSET,
    amount: "0xb1a2bc2ec50000",
    recipient: ANONYMIZER,
  });
  assert.deepEqual(invoke.calldata, [PAY_TO, ASSET, "0xb1a2bc2ec50000", RESOURCE_HASH, "0x1"]);
});

test("terms for a different resource than the one asked for are refused", async () => {
  const { deps, submitted } = harness({}, {
    ...termsBody(),
    resource: { ...RESOURCE, url: "https://example.com/other" },
  });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /not the .* that was requested/);
  assert.equal(submitted.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import { settlePaywall, type SettleDeps } from "../src/pay/settle.ts";

const ANONYMIZER = "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
const ASSET = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const PAY_TO = "0x4d45524348414e54";
const RESOURCE_HASH = "0xffa430bc25381cb7e9c9cb8d01ea317794dfb78741a7748fecd59c796f3b75";
const URL = "https://example.com/article/agent-privacy";
const PRICE = 50_000_000_000_000_000n;

const termsBody = (over: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    x402Version: 1,
    accepts: [
      {
        scheme: "strk20-anonymizer",
        network: "starknet-sepolia",
        maxAmountRequired: PRICE.toString(),
        resource: URL,
        description: "Why your agent leaks more than you do",
        payTo: PAY_TO,
        asset: ASSET,
        extra: { anonymizer: ANONYMIZER, resourceHash: RESOURCE_HASH, ...extra },
        ...over,
      },
    ],
  });

const paywall = (body = termsBody()) =>
  new Response(body, { status: 402, headers: { "content-type": "application/json" } });

const unlocked = () =>
  new Response("<html><head><title>Paid</title></head><body><p>The article.</p></body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });

function harness(overrides: Partial<SettleDeps> = {}, body?: string) {
  const submitted: unknown[][] = [];
  const seen: Array<Record<string, string> | undefined> = [];

  const deps: SettleDeps = {
    torProxy: "socks5://127.0.0.1:9050",
    fetchImpl: (_target, options) => {
      seen.push(options.headers);
      return options.headers?.["X-Payment"] ? unlocked() : paywall(body);
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
  assert.equal(submitted.length, 0, "must not spend on a page that never asked");
});

test("a 402 is settled and the unlocked page comes back", async () => {
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

test("the paid retry carries the receipt and nothing else", async () => {
  const { deps, seen } = harness();
  await settlePaywall({ url: URL }, deps);

  assert.equal(seen.length, 2);
  assert.equal(seen[0], undefined, "the first look must not send a receipt");
  assert.deepEqual(seen[1], { "X-Payment": "0xabc123" });
});

test("no Tor circuit means no payment and no request", async () => {
  // The paid fetch goes through browse too, so the anonymity guard cannot be
  // bypassed by paying first.
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

test("a 402 naming an untrusted helper is refused before any spending", async () => {
  const { deps, submitted } = harness({}, termsBody({}, { anonymizer: "0xbadc0de" }));
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /does not trust/);
  assert.equal(submitted.length, 0);
});

test("a price above the ceiling is refused before any spending", async () => {
  const { deps, submitted } = harness({ maxPrice: PRICE - 1n });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /above the .* ceiling/);
  assert.equal(submitted.length, 0);
});

test("a per-call ceiling can tighten the configured one", async () => {
  const { deps, submitted } = harness();
  await assert.rejects(
    () => settlePaywall({ url: URL, maxPrice: PRICE - 1n }, deps),
    /above the .* ceiling/,
  );
  assert.equal(submitted.length, 0);
});

test("a per-call ceiling can never raise the configured one", async () => {
  // Otherwise the guard is advisory: anything that can call the tool could
  // simply ask for a bigger allowance.
  const { deps, submitted } = harness({ maxPrice: PRICE - 1n });
  await assert.rejects(
    () => settlePaywall({ url: URL, maxPrice: 10n ** 24n }, deps),
    /above the .* ceiling/,
  );
  assert.equal(submitted.length, 0);
});

test("no spending key refuses with something the caller can act on", async () => {
  const { deps } = harness({ getWallet: async () => null });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /wallet_status/);
});

test("a 402 whose body is not payment terms is refused, not guessed at", async () => {
  const { deps, submitted } = harness({
    fetchImpl: () =>
      new Response("<html><body>Please subscribe!</body></html>", {
        status: 402,
        headers: { "content-type": "text/html" },
      }),
  });
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /not JSON payment terms/);
  assert.equal(submitted.length, 0);
});

test("a merchant that cannot see the payment yet is retried, not paid twice", async () => {
  let look = 0;
  const { deps, submitted } = harness({
    fetchImpl: (_t, options) => {
      look++;
      if (!options.headers?.["X-Payment"]) return paywall();
      // The chain has not caught up for the first two paid attempts.
      return look < 4 ? paywall() : unlocked();
    },
  });

  const result = await settlePaywall({ url: URL }, deps);
  assert.equal(result.paid, true);
  assert.equal(submitted.length, 1, "must settle once, however many times it retries");
});

test("giving up after payment leads with the hash", async () => {
  // The money is gone either way. A caller that loses the receipt has no way
  // to claim what it already bought.
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

test("the settlement is the two-leg action list, funded to the exact price", async () => {
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
  const { deps, submitted } = harness({}, termsBody({ resource: "https://example.com/other" }));
  await assert.rejects(() => settlePaywall({ url: URL }, deps), /not the .* that was requested/);
  assert.equal(submitted.length, 0);
});

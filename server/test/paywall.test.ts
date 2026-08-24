import assert from "node:assert/strict";
import test from "node:test";

import {
  SCHEME,
  balanceSurplus,
  buildPaywallActions,
  parsePaymentRequired,
} from "../src/pay/paywall.ts";

const ANONYMIZER = "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
const ASSET = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const PAY_TO = "0x4d45524348414e54";
const RESOURCE_HASH = "0xffa430bc25381cb7e9c9cb8d01ea317794dfb78741a7748fecd59c796f3b75";
const URL = "https://ledger.example/article/agent-privacy";

const OPTIONS = {
  trustedAnonymizers: [ANONYMIZER],
  maxPrice: 10n ** 18n,
  asset: ASSET,
};

const body = (overrides: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  x402Version: 1,
  accepts: [
    {
      scheme: SCHEME,
      network: "starknet-sepolia",
      maxAmountRequired: "50000000000000000",
      resource: URL,
      description: "Why your agent leaks more than you do",
      payTo: PAY_TO,
      asset: ASSET,
      extra: { anonymizer: ANONYMIZER, resourceHash: RESOURCE_HASH, ...extra },
      ...overrides,
    },
  ],
});

test("a well-formed 402 parses into terms", () => {
  const terms = parsePaymentRequired(body(), { ...OPTIONS, requestedUrl: URL });
  assert.equal(terms.amount, 50_000_000_000_000_000n);
  assert.equal(terms.payTo, PAY_TO);
  assert.equal(terms.anonymizer, ANONYMIZER);
  assert.equal(terms.resourceHash, RESOURCE_HASH);
});

test("an untrusted anonymizer is refused", () => {
  // The whole point: `invoke` calls this contract while holding the money, so
  // a merchant that could name any contract could name one that keeps it.
  assert.throws(
    () => parsePaymentRequired(body({}, { anonymizer: "0xbadc0de" }), OPTIONS),
    /does not trust/,
  );
});

test("trust compares addresses as field elements", () => {
  const padded = "0x00767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
  const terms = parsePaymentRequired(body(), { ...OPTIONS, trustedAnonymizers: [padded] });
  assert.equal(terms.anonymizer, ANONYMIZER);
});

test("an empty trust list refuses everything", () => {
  assert.throws(
    () => parsePaymentRequired(body(), { ...OPTIONS, trustedAnonymizers: [] }),
    /no anonymizer contract is trusted/,
  );
});

test("a price above the ceiling is refused", () => {
  assert.throws(
    () => parsePaymentRequired(body(), { ...OPTIONS, maxPrice: 49_999_999_999_999_999n }),
    /above the .* ceiling/,
  );
});

test("a price at the ceiling is allowed", () => {
  const terms = parsePaymentRequired(body(), { ...OPTIONS, maxPrice: 50_000_000_000_000_000n });
  assert.equal(terms.amount, 50_000_000_000_000_000n);
});

test("a zero or negative price is refused", () => {
  for (const price of ["0", "-1"]) {
    assert.throws(
      () => parsePaymentRequired(body({ maxAmountRequired: price }), OPTIONS),
      /price of zero or less/,
    );
  }
});

test("terms for a different resource than the one requested are refused", () => {
  assert.throws(
    () =>
      parsePaymentRequired(body(), {
        ...OPTIONS,
        requestedUrl: "https://ledger.example/article/something-else",
      }),
    /not the .* that was requested/,
  );
});

test("a query string does not make the resource a different one", () => {
  const terms = parsePaymentRequired(body(), {
    ...OPTIONS,
    requestedUrl: `${URL}?utm_source=agent`,
  });
  assert.equal(terms.resource, URL);
});

test("an x402 scheme that identifies the payer is refused by name", () => {
  const exact = { ...body(), accepts: [{ ...body().accepts[0], scheme: "exact" }] };
  assert.throws(() => parsePaymentRequired(exact, OPTIONS), /No strk20-anonymizer terms/);
});

test("the wrong token is refused", () => {
  assert.throws(() => parsePaymentRequired(body({ asset: "0xdead" }), OPTIONS), /pays in/);
});

test("a malformed 402 is refused rather than half-read", () => {
  for (const bad of [null, {}, { accepts: [] }, { accepts: "nope" }, { accepts: [{}] }]) {
    assert.throws(() => parsePaymentRequired(bad, OPTIONS));
  }
  assert.throws(
    () => parsePaymentRequired(body({}, { resourceHash: "not-a-felt" }), OPTIONS),
    /no usable `extra.resourceHash`/,
  );
});

test("the action list matches privacy_invoke's signature", () => {
  const terms = parsePaymentRequired(body(), OPTIONS);
  const [withdraw, invoke] = buildPaywallActions(terms) as any[];

  // Fund the helper with exactly the price, so there is no change and the
  // Option is None.
  assert.deepEqual(withdraw, {
    type: "withdraw",
    token: ASSET,
    amount: "0xb1a2bc2ec50000",
    recipient: ANONYMIZER,
  });
  assert.equal(BigInt(withdraw.amount), terms.amount);

  assert.equal(invoke.type, "invoke");
  assert.equal(invoke.contract, ANONYMIZER);
  // merchant, token, price, resource_hash, Option::None (variant index 1)
  assert.deepEqual(invoke.calldata, [PAY_TO, ASSET, "0xb1a2bc2ec50000", RESOURCE_HASH, "0x1"]);
});

test("a surplus rejection is answered with a transfer back to the payer", async () => {
  const terms = parsePaymentRequired(body(), OPTIONS);
  const base = buildPaywallActions(terms);
  let call = 0;

  const balanced = (await balanceSurplus(
    base,
    async () => {
      if (call++ === 0) throw new Error("Surplus of 950000000000000000 found in the transaction");
    },
    "0x077f1679",
    ASSET,
  )) as any[];

  assert.equal(balanced.length, 3);
  assert.deepEqual(balanced[1], {
    type: "transfer",
    token: ASSET,
    amount: "0xd2f13f7789f0000",
    recipient: "0x077f1679",
  });
  // The invoke stays last: the pool reads the sink as a plain balancing leg.
  assert.equal(balanced[2].type, "invoke");
});

test("a rejection that is not about surplus is not retried", async () => {
  const terms = parsePaymentRequired(body(), OPTIONS);
  let calls = 0;

  await assert.rejects(
    balanceSurplus(
      buildPaywallActions(terms),
      async () => {
        calls++;
        throw new Error("NOTE_NOT_FOUND");
      },
      "0x1",
      ASSET,
    ),
    /NOTE_NOT_FOUND/,
  );
  assert.equal(calls, 1);
});

test("an unbalanceable surplus gives up rather than looping", async () => {
  const terms = parsePaymentRequired(body(), OPTIONS);
  let calls = 0;

  await assert.rejects(
    balanceSurplus(
      buildPaywallActions(terms),
      async () => {
        calls++;
        throw new Error("Surplus of 1 found in the transaction");
      },
      "0x1",
      ASSET,
    ),
    /Could not balance the note surplus in 3 attempts/,
  );
  assert.equal(calls, 3);
});

test("no surplus means the action list is left alone", async () => {
  const terms = parsePaymentRequired(body(), OPTIONS);
  const base = buildPaywallActions(terms);
  const balanced = await balanceSurplus(base, async () => {}, "0x1", ASSET);
  assert.deepEqual(balanced, base);
});

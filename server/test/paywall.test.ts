import assert from "node:assert/strict";
import test from "node:test";

import {
  SCHEME,
  balanceSurplus,
  buildPaywallActions,
  buildPaymentPayload,
  parsePaymentRequiredHeader,
} from "../src/pay/paywall.ts";

const ANONYMIZER = "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
const ASSET = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const PAY_TO = "0x4d45524348414e54";
const RESOURCE_HASH = "0xffa430bc25381cb7e9c9cb8d01ea317794dfb78741a7748fecd59c796f3b75";
const URL = "https://ledger.example/article/agent-privacy";
const NETWORK = "starknet:SN_SEPOLIA";
const MAINNET_NETWORK = "starknet:SN_MAIN";
const PRICE = "50000000000000000";

const RESOURCE = {
  url: URL,
  description: "Why your agent leaks more than you do",
  mimeType: "text/html",
  serviceName: "Ledger & Lantern",
  tags: ["privacy", "research"],
};

const ACCEPTED = {
  scheme: SCHEME,
  network: NETWORK,
  amount: PRICE,
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

const required = (overrides: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  x402Version: 2,
  error: "PAYMENT-SIGNATURE header is required",
  resource: RESOURCE,
  accepts: [{ ...ACCEPTED, ...overrides, extra: { ...ACCEPTED.extra, ...extra } }],
  extensions: {},
});

const OPTIONS = {
  trustedAnonymizers: [ANONYMIZER],
  maxPrice: 10n ** 18n,
  asset: ASSET,
};

const parse = (value = required(), options = OPTIONS) =>
  parsePaymentRequiredHeader(encode(value), options);

test("a well-formed v2 PAYMENT-REQUIRED header parses into terms", () => {
  const terms = parse(required(), { ...OPTIONS, requestedUrl: URL });
  assert.equal(terms.amount, 50_000_000_000_000_000n);
  assert.equal(terms.payTo, PAY_TO);
  assert.equal(terms.anonymizer, ANONYMIZER);
  assert.equal(terms.resourceHash, RESOURCE_HASH);
  assert.deepEqual(terms.resource, RESOURCE);
  assert.deepEqual(terms.accepted, ACCEPTED);
});

test("a body-only v1 payment object is rejected", () => {
  const v1 = {
    x402Version: 1,
    accepts: [{ scheme: SCHEME, network: "starknet-sepolia", maxAmountRequired: PRICE }],
  };
  assert.throws(() => parsePaymentRequiredHeader(encode(v1), OPTIONS), /x402Version.*2/);
});

test("PAYMENT-REQUIRED must be canonical standard Base64 JSON", () => {
  assert.throws(() => parsePaymentRequiredHeader("not-base64", OPTIONS), /Base64/i);
  assert.throws(() => parsePaymentRequiredHeader(`${encode(required())}=`, OPTIONS), /Base64/i);
  assert.throws(() => parsePaymentRequiredHeader(encode({}), OPTIONS), /payment requirements|x402Version/i);
});

test("only the Sepolia network and upfront flow are accepted", () => {
  assert.throws(() => parse(required({ network: "starknet:SN_MAIN" })), /network/i);
  assert.throws(() => parse(required({}, { paymentFlow: "authorization" })), /upfront/i);
});

test("the configured mainnet network is accepted and a mismatch is rejected", () => {
  const options = { ...OPTIONS, network: MAINNET_NETWORK };
  const terms = parse(required({ network: MAINNET_NETWORK }), options);
  assert.equal(terms.network, MAINNET_NETWORK);
  assert.throws(() => parse(required(), options), /network/i);
});

test("the top-level resource URL is required and query/fragment-insensitive", () => {
  const missing = { ...required(), resource: { ...RESOURCE, url: undefined } };
  assert.throws(() => parse(missing), /resource.*url/i);

  const terms = parse(required(), {
    ...OPTIONS,
    requestedUrl: `${URL}?utm_source=agent#read`,
  });
  assert.equal(terms.resource.url, URL);
});

test("an untrusted anonymizer is refused", () => {
  assert.throws(() => parse(required({}, { anonymizer: "0xbadc0de" })), /does not trust/);
});

test("trust compares helper addresses as field elements", () => {
  const padded = `0x00${ANONYMIZER.slice(2)}`;
  const terms = parse(required(), { ...OPTIONS, trustedAnonymizers: [padded] });
  assert.equal(terms.anonymizer, ANONYMIZER);
});

test("an empty trust list refuses everything", () => {
  assert.throws(
    () => parse(required(), { ...OPTIONS, trustedAnonymizers: [] }),
    /no anonymizer contract is trusted/,
  );
});

test("a price above the ceiling is refused and a price at it is allowed", () => {
  assert.throws(
    () => parse(required({ amount: "49999999999999999" }), { ...OPTIONS, maxPrice: 49_999_999_999_999_998n }),
    /above the .* ceiling/,
  );
  const terms = parse(required({ amount: PRICE }), { ...OPTIONS, maxPrice: 50_000_000_000_000_000n });
  assert.equal(terms.amount, 50_000_000_000_000_000n);
});

test("a zero or negative price is refused", () => {
  for (const amount of ["0", "-1"]) {
    assert.throws(() => parse(required({ amount })), /price of zero or less|unreadable price/);
  }
});

test("terms for a different resource are refused", () => {
  assert.throws(
    () => parse(required(), { ...OPTIONS, requestedUrl: "https://ledger.example/article/other" }),
    /not the .* that was requested/,
  );
});

test("an identified-payer scheme and wrong token are refused", () => {
  assert.throws(
    () => parse({ ...required(), accepts: [{ ...ACCEPTED, scheme: "exact" }] }),
    /No strk20-anonymizer terms/,
  );
  assert.throws(() => parse(required({ asset: "0xdead" })), /pays in/);
});

test("malformed v2 requirements are refused rather than half-read", () => {
  for (const bad of [null, {}, { accepts: [] }, { accepts: "nope" }, { accepts: [{}] }]) {
    assert.throws(() => parsePaymentRequiredHeader(encode(bad), OPTIONS));
  }
  assert.throws(
    () => parse(required({}, { resourceHash: "not-a-felt" })),
    /no usable `extra.resourceHash`/,
  );
});

test("the action list matches privacy_invoke's signature", () => {
  const terms = parse();
  const [withdraw, invoke] = buildPaywallActions(terms) as any[];

  assert.deepEqual(withdraw, {
    type: "withdraw",
    token: ASSET,
    amount: "0xb1a2bc2ec50000",
    recipient: ANONYMIZER,
  });
  assert.equal(BigInt(withdraw.amount), terms.amount);
  assert.equal(invoke.type, "invoke");
  assert.equal(invoke.contract, ANONYMIZER);
  assert.deepEqual(invoke.calldata, [PAY_TO, ASSET, "0xb1a2bc2ec50000", RESOURCE_HASH, "0x1"]);
});

test("the payment payload binds the exact v2 resource and accepted terms", () => {
  const terms = parse();
  assert.deepEqual(buildPaymentPayload(terms, "0xabc123"), {
    x402Version: 2,
    resource: RESOURCE,
    accepted: ACCEPTED,
    payload: { transactionHash: "0xabc123" },
    extensions: {},
  });
});

test("a surplus rejection is answered with a transfer back to the payer", async () => {
  const terms = parse();
  let call = 0;

  const { actions, result } = await balanceSurplus(
    buildPaywallActions(terms),
    async () => {
      if (call++ === 0) throw new Error("Surplus of 950000000000000000 found in the transaction");
      return "submitted";
    },
    "0x077f1679",
    ASSET,
  );

  assert.equal(result, "submitted");
  assert.equal(actions.length, 3);
  assert.deepEqual(actions[1], {
    type: "transfer",
    token: ASSET,
    amount: "0xd2f13f7789f0000",
    recipient: "0x077f1679",
  });
  assert.equal((actions[2] as any).type, "invoke");
});

test("the balanced list is the one the operation actually ran with", async () => {
  let seen: unknown[] = [];
  let call = 0;
  const { actions } = await balanceSurplus(
    buildPaywallActions(parse()),
    async (candidate) => {
      seen = candidate;
      if (call++ === 0) throw new Error("Surplus of 5 found in the transaction");
    },
    "0x1",
    ASSET,
  );
  assert.deepEqual(actions, seen);
});

test("successive surplus rejections accumulate sinks", async () => {
  const surpluses = ["Surplus of 100 found", "Surplus of 25 found"];
  let call = 0;
  const { actions } = await balanceSurplus(
    buildPaywallActions(parse()),
    async () => {
      if (call < surpluses.length) throw new Error(surpluses[call++]);
    },
    "0x1",
    ASSET,
  );
  assert.equal(actions.length, 4);
  assert.equal((actions[1] as any).amount, "0x64");
  assert.equal((actions[2] as any).amount, "0x19");
  assert.equal((actions[3] as any).type, "invoke");
});

test("non-surplus errors are not retried", async () => {
  let calls = 0;
  await assert.rejects(
    balanceSurplus(
      buildPaywallActions(parse()),
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

test("an unbalanceable surplus gives up after four attempts", async () => {
  let calls = 0;
  await assert.rejects(
    balanceSurplus(
      buildPaywallActions(parse()),
      async () => {
        calls++;
        throw new Error("Surplus of 1 found in the transaction");
      },
      "0x1",
      ASSET,
    ),
    /Could not balance the note surplus in 4 attempts/,
  );
  assert.equal(calls, 4);
});

test("no surplus leaves the action list alone", async () => {
  const base = buildPaywallActions(parse());
  const { actions } = await balanceSurplus(base, async () => {}, "0x1", ASSET);
  assert.deepEqual(actions, base);
});

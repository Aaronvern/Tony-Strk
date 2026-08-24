import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PAYWALL_PAID, verifyReceipt } from "../src/receipt.ts";
import type { ChainReceipt, PaywallTerms } from "../src/receipt.ts";

/**
 * The real thing: Sepolia transaction 0x94c9a566…82cf5, in which the pool
 * withdrew 0.1 STRK to the anonymizer, the anonymizer paid the merchant
 * exactly 0.05, and the change went back into an open note. Testing the
 * verifier against a hand-built event would only prove it agrees with my
 * assumptions about the event layout.
 */
const settlement = JSON.parse(
  readFileSync(new URL("./settlement-receipt.json", import.meta.url), "utf8"),
) as ChainReceipt;

const TERMS: PaywallTerms = {
  anonymizer: "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d",
  merchant: "0x4d45524348414e54",
  resourceHash: "0x61727469636c652f3432",
  asset: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  minPrice: 50_000_000_000_000_000n,
};

test("the selector matches the one the deployed contract actually emitted", () => {
  assert.equal(BigInt(PAYWALL_PAID), BigInt("0x2e3540de0435cb25e3603e57e8a02f180bc6fe9285cfff1244e4ca9d7679a66"));
});

test("a real settlement verifies", () => {
  const verdict = verifyReceipt(settlement, TERMS);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.ok && verdict.price, 50_000_000_000_000_000n);
});

test("the price paid satisfies a cheaper asking price", () => {
  const verdict = verifyReceipt(settlement, { ...TERMS, minPrice: 10_000_000_000_000_000n });
  assert.equal(verdict.ok, true);
});

test("a receipt below the asking price is refused", () => {
  const verdict = verifyReceipt(settlement, { ...TERMS, minPrice: 50_000_000_000_000_001n });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /below the asking price/);
});

test("addresses compare as field elements, not as strings", () => {
  // Same merchant, written with a leading zero the way some explorers print it.
  const padded = "0x04d45524348414e54";
  assert.notEqual(padded, TERMS.merchant);
  assert.equal(verifyReceipt(settlement, { ...TERMS, merchant: padded }).ok, true);

  // And the anonymizer, zero-padded to a full 64 hex digits.
  const wide = "0x00767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
  assert.equal(verifyReceipt(settlement, { ...TERMS, anonymizer: wide }).ok, true);
});

test("a receipt for another merchant does not unlock this one", () => {
  const verdict = verifyReceipt(settlement, { ...TERMS, merchant: "0x1234" });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /no PaywallPaid receipt/);
});

test("a receipt for another resource does not unlock this one", () => {
  const verdict = verifyReceipt(settlement, { ...TERMS, resourceHash: "0x9999" });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /no PaywallPaid receipt/);
});

test("an event from a contract we do not trust is ignored", () => {
  // The exact same event, emitted by an impostor contract. Without the
  // from_address check anyone could deploy a contract that emits PaywallPaid
  // and unlock every article for free.
  const impostor: ChainReceipt = {
    ...settlement,
    events: (settlement.events ?? []).map((event) => ({ ...event, from_address: "0xbadc0de" })),
  };
  assert.equal(verifyReceipt(impostor, TERMS).ok, false);
});

test("a receipt paid in the wrong token is refused", () => {
  const verdict = verifyReceipt(settlement, { ...TERMS, asset: "0xdeadbeef" });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /wrong token/);
});

test("a reverted transaction is refused even if it carries events", () => {
  const reverted: ChainReceipt = { ...settlement, execution_status: "REVERTED" };
  const verdict = verifyReceipt(reverted, TERMS);
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /did not succeed/);
});

test("a transaction that is not in a block yet is refused", () => {
  for (const finality of ["RECEIVED", "PRE_CONFIRMED", undefined]) {
    const pending: ChainReceipt = { ...settlement, finality_status: finality };
    const verdict = verifyReceipt(pending, TERMS);
    assert.equal(verdict.ok, false, `accepted finality ${finality}`);
    assert.match(verdict.ok === false ? verdict.reason : "", /not in a block yet/);
  }
});

test("a receipt with no events at all is refused", () => {
  assert.equal(verifyReceipt({ ...settlement, events: [] }, TERMS).ok, false);
  assert.equal(verifyReceipt({ ...settlement, events: undefined }, TERMS).ok, false);
});

test("a malformed event cannot crash the verifier", () => {
  const malformed: ChainReceipt = {
    ...settlement,
    events: [
      { from_address: TERMS.anonymizer, keys: [], data: [] },
      { from_address: TERMS.anonymizer, keys: [PAYWALL_PAID], data: [] },
      { from_address: "not-a-felt", keys: ["nonsense"], data: ["also-nonsense"] },
      ...(settlement.events ?? []),
    ],
  };
  assert.equal(verifyReceipt(malformed, TERMS).ok, true);
});

import assert from "node:assert/strict";
import test from "node:test";

import { fmt, toWei, u256 } from "../src/amount.js";

test("toWei keeps precision a float would lose", () => {
  assert.equal(toWei("1"), 10n ** 18n);
  assert.equal(toWei("0.05"), 50_000_000_000_000_000n);
  // Below 2^53 wei — the range where Number would start rounding.
  assert.equal(toWei("0.000000000000000001"), 1n);
  assert.equal(toWei("49.870785899598602544"), 49_870_785_899_598_602_544n);
});

test("toWei accepts the shapes a text field actually produces", () => {
  assert.equal(toWei(" 30 "), 30n * 10n ** 18n);
  assert.equal(toWei("30."), 30n * 10n ** 18n);
  assert.equal(toWei(".5"), 500_000_000_000_000_000n);
  assert.equal(toWei("0"), 0n);
});

test("toWei rejects anything that is not a plain decimal", () => {
  for (const bad of ["", " ", ".", "-1", "1e18", "abc", "1.2.3", "0x10", "1,000"]) {
    assert.throws(() => toWei(bad), /not a decimal amount/, `accepted ${JSON.stringify(bad)}`);
  }
});

test("toWei refuses more precision than the token has", () => {
  assert.throws(() => toWei("0.0000000000000000001"), /more than 18 decimals/);
});

test("fmt round-trips through toWei", () => {
  for (const text of ["0", "1", "0.05", "30", "49.870785899598602544", "0.000000000000000001"]) {
    assert.equal(fmt(toWei(text)), text.replace(/^\./, "0."));
  }
});

test("fmt trims trailing zeros but keeps the integer part", () => {
  assert.equal(fmt(10n ** 18n), "1");
  assert.equal(fmt(1_500_000_000_000_000_000n), "1.5");
  assert.equal(fmt(0n), "0");
  assert.equal(fmt(-(10n ** 18n)), "-1");
});

test("u256 reassembles both felts, not just the low one", () => {
  assert.equal(u256(["0x1", "0x0"]), 1n);
  assert.equal(u256(["0x0"]), 0n);
  assert.equal(u256(["0x0", "0x1"]), 1n << 128n);
  assert.equal(u256(["0x2", "0x1"]), (1n << 128n) + 2n);
});

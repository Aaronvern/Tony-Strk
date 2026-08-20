import test from "node:test";
import assert from "node:assert/strict";

import { toWei } from "../src/pay/amount.ts";

// Money parsing is where quiet bugs cost real funds, so it gets its own tests
// rather than being exercised incidentally through the pay tool.
test("toWei converts whole and fractional STRK", () => {
  assert.equal(toWei("1"), 10n ** 18n);
  assert.equal(toWei("1.5"), 1_500_000_000_000_000_000n);
  assert.equal(toWei("0.000000000000000001"), 1n);
  assert.equal(toWei("12.34"), 12_340_000_000_000_000_000n);
});

test("toWei does not lose precision through floating point", () => {
  // 0.1 + 0.2 style error: a Number-based implementation returns
  // 8250000000000000000 for this, one wei short of correct.
  assert.equal(toWei("8.25"), 8_250_000_000_000_000_000n);
  assert.equal(toWei("0.07"), 70_000_000_000_000_000n);
  assert.equal(toWei("1234567.891234567891"), 1_234_567_891_234_567_891_000_000n);
});

test("toWei rejects amounts that are not positive numbers", () => {
  for (const bad of ["0", "-1", "", "abc", "1.2.3", "1e18", " ", "0.0"]) {
    assert.throws(() => toWei(bad), new RegExp("amount", "i"), `expected ${JSON.stringify(bad)} to throw`);
  }
});

test("toWei rejects more precision than STRK has", () => {
  // 19 decimal places is finer than a wei; silently truncating would be worse.
  assert.throws(() => toWei("0.0000000000000000001"), /decimal/i);
});

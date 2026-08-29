import assert from "node:assert/strict";
import test from "node:test";

import {
  MAINNET_POOL,
  STRK,
  assertFeeQuote,
  assertSuccessfulPoolTransaction,
  buildMainnetPlan,
} from "../src/pay/mainnet-three.ts";

const ACCOUNT = "0x0123456789abcdef";
const HASH = "0xabcdef";

test("the approved plan spends exactly three capped pool fees", () => {
  assert.deepEqual(buildMainnetPlan(ACCOUNT), [
    {
      kind: "shield",
      actions: [
        { type: "deposit", token: STRK, amount: "0x1158e460913d00000" },
      ],
    },
    {
      kind: "transfer",
      actions: [
        {
          type: "transfer",
          token: STRK,
          amount: "0x16345785d8a0000",
          recipient: ACCOUNT,
        },
      ],
    },
    {
      kind: "unshield",
      actions: [
        {
          type: "withdraw",
          token: STRK,
          amount: "0x1bc16d674ec80000",
          recipient: ACCOUNT,
        },
      ],
    },
  ]);
});

test("fee quotes must use STRK and stay at or below six STRK", () => {
  assert.doesNotThrow(() =>
    assertFeeQuote({
      type: "withdraw",
      token: STRK,
      amount: "0x53444835ec580000",
      recipient: "0xfee-recipient",
    }),
  );
  assert.throws(
    () => assertFeeQuote({ type: "withdraw", token: "0xother", amount: "0x1" }),
    /fee token/i,
  );
  assert.throws(
    () =>
      assertFeeQuote({
        type: "withdraw",
        token: STRK,
        amount: "0x53444835ec580001",
      }),
    /fee cap|6 STRK/i,
  );
});

test("pool transaction checks reject reverted, mismatched, and unbound receipts", () => {
  const good = {
    transaction_hash: HASH,
    execution_status: "SUCCEEDED",
    finality_status: "ACCEPTED_ON_L2",
    events: [{ from_address: MAINNET_POOL }],
  };
  assert.doesNotThrow(() => assertSuccessfulPoolTransaction(good, HASH));
  assert.throws(
    () =>
      assertSuccessfulPoolTransaction(
        { ...good, execution_status: "REVERTED" },
        HASH,
      ),
    /succeed|revert/i,
  );
  assert.throws(
    () => assertSuccessfulPoolTransaction(good, "0xother"),
    /hash/i,
  );
  assert.throws(
    () => assertSuccessfulPoolTransaction({ ...good, events: [] }, HASH),
    /pool/i,
  );
});

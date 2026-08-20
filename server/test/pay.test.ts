import test from "node:test";
import assert from "node:assert/strict";

import { pay } from "../src/pay/pay.ts";

const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const RECIPIENT =
  "0x077F1679D6B758f63b33Ac3eba46c33b0218185156efc9041cB4ba1A2162FC87";

function fakeWallet(hash = "0xdeadbeef") {
  const calls: unknown[][] = [];
  return {
    calls,
    strk20InvokeTransaction: async (actions: unknown[]) => {
      calls.push(actions);
      return { transaction_hash: hash };
    },
  };
}

const deps = (wallet: ReturnType<typeof fakeWallet> | null) => ({
  wallet,
  token: STRK,
  explorerBase: "https://sepolia.starkscan.co",
});

test("pay refuses when no wallet is configured", async () => {
  await assert.rejects(
    () => pay({ to: RECIPIENT, amount: "1" }, deps(null)),
    /no spending key/i,
  );
});

test("pay rejects a recipient that is not a Starknet address", async () => {
  const wallet = fakeWallet();

  for (const bad of ["", "0x", "not-an-address", "0xzz", "0x0", "1234"]) {
    await assert.rejects(
      () => pay({ to: bad, amount: "1" }, deps(wallet)),
      /recipient/i,
      `expected ${JSON.stringify(bad)} to be rejected`,
    );
  }

  assert.equal(
    wallet.calls.length,
    0,
    "nothing should reach the chain when the recipient is invalid",
  );
});

test("pay withdraws from the pool to the recipient and reports the transaction", async () => {
  const wallet = fakeWallet("0xabc123");

  const result = await pay({ to: RECIPIENT, amount: "1.5" }, deps(wallet));

  assert.equal(wallet.calls.length, 1);
  assert.deepEqual(wallet.calls[0], [
    {
      type: "withdraw",
      token: STRK,
      recipient: RECIPIENT,
      amount: `0x${(1_500_000_000_000_000_000n).toString(16)}`,
    },
  ]);

  assert.equal(result.transactionHash, "0xabc123");
  assert.equal(result.amountWei, "1500000000000000000");
  assert.equal(result.recipient, RECIPIENT);
  assert.equal(
    result.explorerUrl,
    "https://sepolia.starkscan.co/tx/0xabc123",
  );
});

test("pay does not submit when the amount is invalid", async () => {
  const wallet = fakeWallet();

  await assert.rejects(
    () => pay({ to: RECIPIENT, amount: "0" }, deps(wallet)),
    /amount/i,
  );

  assert.equal(wallet.calls.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";

import { createWalletManager } from "../src/pay/wallet-manager.ts";

const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

function fakeWallet(hash = "0xshielded") {
  const calls: unknown[][] = [];
  return {
    calls,
    strk20InvokeTransaction: async (actions: unknown[]) => {
      calls.push(actions);
      return { transaction_hash: hash };
    },
  };
}

function manager(
  wallet: ReturnType<typeof fakeWallet>,
  waitForTransaction: (hash: string) => Promise<Record<string, unknown>>,
) {
  return createWalletManager({
    store: { load: async () => null, save: async () => {} },
    paymaster: { load: async () => null, save: async () => {} },
    wallet,
    waitForTransaction,
    rpcUrl: "https://rpc.example.invalid",
    provingUrl: "https://prover.example.invalid",
    indexerUrl: "https://indexer.example.invalid",
    paymasterUrl: "https://paymaster.example.invalid",
    pool: "0x123",
    token: STRK,
    chainId: "0x534e5f5345504f4c4941",
    ohttpEnabled: false,
    explorerBase: "https://sepolia.starkscan.co",
  });
}

const receiptFor = (transaction_hash = "0xshielded", block_number: number | unknown = 100) => ({
  transaction_hash,
  execution_status: "SUCCEEDED",
  finality_status: "ACCEPTED_ON_L2",
  block_number,
});

test("shield deposits public STRK and reports conservative note maturity", async () => {
  const wallet = fakeWallet();
  const waited: string[] = [];
  const result = await manager(wallet, async (hash) => {
    waited.push(hash);
    return receiptFor(hash);
  }).shield("1");

  assert.deepEqual(wallet.calls, [
    [{ type: "deposit", token: STRK, amount: "0xde0b6b3a7640000" }],
  ]);
  assert.deepEqual(waited, ["0xshielded"]);
  assert.deepEqual(result, {
    transactionHash: "0xshielded",
    amountWei: "1000000000000000000",
    explorerUrl: "https://sepolia.starkscan.co/tx/0xshielded",
    receiptBlock: 100,
    spendableAfterBlock: 112,
  });
});

test("shield accepts L1 finality as mature", async () => {
  const result = await manager(fakeWallet(), async () => ({
    ...receiptFor(),
    finality_status: "ACCEPTED_ON_L1",
  })).shield("1");

  assert.equal(result.receiptBlock, 100);
});

test("shield validates before loading or submitting the wallet", async () => {
  const wallet = fakeWallet();
  let waited = 0;
  const shield = manager(wallet, async () => {
    waited += 1;
    return { block_number: 100 };
  }).shield;

  for (const amount of ["", "0", "0.0000000000000000001", "1e2"]) {
    await assert.rejects(() => shield(amount), /amount/i);
  }

  assert.equal(wallet.calls.length, 0);
  assert.equal(waited, 0);
});

test("shield rejects a receipt bound to another transaction", async () => {
  const wallet = fakeWallet();

  await assert.rejects(
    () => manager(wallet, async () => receiptFor("0xother")).shield("1"),
    /transaction hash/i,
  );
});

test("shield rejects reverted, pending, and pre-confirmed receipts", async () => {
  for (const receipt of [
    receiptFor("0xshielded", 100),
    { ...receiptFor(), execution_status: "REVERTED" },
    { ...receiptFor(), execution_status: "PENDING" },
    { ...receiptFor(), finality_status: "RECEIVED" },
    { ...receiptFor(), finality_status: "PRE_CONFIRMED" },
  ]) {
    if (receipt.execution_status === "SUCCEEDED" && receipt.finality_status === "ACCEPTED_ON_L2") continue;
    await assert.rejects(
      () => manager(fakeWallet(), async () => receipt).shield("1"),
      /receipt|succeed|finality|accept|block/i,
    );
  }
});

test("shield rejects missing or malformed receipt fields", async () => {
  const missingExecution = { ...receiptFor() };
  delete missingExecution.execution_status;
  const malformedBlock = receiptFor("0xshielded", "100");

  for (const receipt of [missingExecution, malformedBlock, { ...receiptFor(), block_number: NaN }]) {
    await assert.rejects(
      () => manager(fakeWallet(), async () => receipt).shield("1"),
      /receipt|execution|block/i,
    );
  }
});

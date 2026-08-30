import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSnip36RpcVersion,
  submitPublicPrivacyRelay,
} from "../src/pay/wallet.ts";

const actions = [
  {
    type: "withdraw",
    token: "0xtoken",
    amount: "0x1",
    recipient: "0xmerchant",
  },
  {
    type: "invoke",
    contract: "0xhelper",
    calldata: ["0xmerchant", "0xtoken", "0x1"],
  },
];
const call = {
  contractAddress: "0xpool",
  entrypoint: "apply_actions",
  calldata: ["0x1", "0x2"],
};
const proof = {
  data: "base64-proof",
  output: ["0xout"],
  proof_facts: ["0xfact"],
};
const resourceBounds = {
  l1_gas: { max_amount: 11n, max_price_per_unit: 13n },
  l2_gas: { max_amount: 17n, max_price_per_unit: 19n },
  l1_data_gas: { max_amount: 23n, max_price_per_unit: 29n },
};

function harness(overall_fee: bigint, expectedActions = actions) {
  const seen: { estimated?: unknown; executed?: unknown } = {};
  const account = {
    estimateInvokeFee: async (candidate: unknown, details: unknown) => {
      seen.estimated = { candidate, details };
      return { overall_fee, resourceBounds, unit: "FRI" as const };
    },
    execute: async (candidate: unknown, details: unknown) => {
      seen.executed = { candidate, details };
      return { transaction_hash: "0xsubmitted" };
    },
  };
  const prover = {
    prove: async (candidate: unknown) => {
      assert.deepEqual(candidate, expectedActions);
      return { call, proof };
    },
  };
  return { account, prover, seen };
}

test("public relay refuses to execute when the estimated fee exceeds its cap", async () => {
  const { account, prover, seen } = harness(6n);

  await assert.rejects(
    () => submitPublicPrivacyRelay(actions, { account, prover, feeCapWei: 5n }),
    /estimated fee.*cap/i,
  );
  assert.equal(seen.executed, undefined);
});

test("public relay submits the exact proven call, proof facts, and estimated bounds", async () => {
  const { account, prover, seen } = harness(4n);

  const result = await submitPublicPrivacyRelay(actions, {
    account,
    prover,
    feeCapWei: 5n,
    warn: () => {},
  });

  assert.deepEqual(seen.estimated, {
    candidate: call,
    details: { proof: proof.data, proofFacts: proof.proof_facts },
  });
  assert.deepEqual(seen.executed, {
    candidate: call,
    details: {
      tip: 0n,
      resourceBounds,
      proof: proof.data,
      proofFacts: proof.proof_facts,
    },
  });
  assert.deepEqual(result, { transaction_hash: "0xsubmitted" });
});

test("public relay inserts its configured refill before the final invoke", async () => {
  const refill = {
    type: "withdraw",
    token: "0xtoken",
    amount: "0x2",
    recipient: "0xpayer",
  };
  const expectedActions = [actions[0], refill, actions[1]];
  const { account, prover } = harness(4n, expectedActions);

  await submitPublicPrivacyRelay(actions, {
    account,
    prover,
    feeCapWei: 5n,
    refillWei: 2n,
    refillToken: "0xtoken",
    refillRecipient: "0xpayer",
    warn: () => {},
  });
});

test("public relay appends its configured refill when no invoke exists", async () => {
  const onlyWithdraw = [actions[0]];
  const refill = {
    type: "withdraw",
    token: "0xtoken",
    amount: "0x2",
    recipient: "0xpayer",
  };
  const { account, prover } = harness(4n, [onlyWithdraw[0], refill]);

  await submitPublicPrivacyRelay(onlyWithdraw, {
    account,
    prover,
    feeCapWei: 5n,
    refillWei: 2n,
    refillToken: "0xtoken",
    refillRecipient: "0xpayer",
    warn: () => {},
  });
});

test("public relay rejects RPC versions that cannot carry SNIP-36 proof fields", () => {
  assert.throws(
    () => assertSnip36RpcVersion("0.8.1"),
    /requires RPC spec >= 0\.10\.1/i,
  );
  assert.throws(
    () => assertSnip36RpcVersion("unknown"),
    /requires RPC spec >= 0\.10\.1/i,
  );
  assert.doesNotThrow(() => assertSnip36RpcVersion("0.10.1"));
  assert.doesNotThrow(() => assertSnip36RpcVersion("0.10.3-rc.0"));
});

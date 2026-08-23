import test from "node:test";
import assert from "node:assert/strict";

import {
  createCounterfactualAccount,
  determineWalletState,
} from "../src/pay/account.ts";

test("a private key derives the Ready counterfactual account address", () => {
  const account = createCounterfactualAccount("0x1", "test-passphrase");

  assert.equal(
    account.publicKey,
    "0x1ef15c18599971b7beced415a40f0c7deacfd9b0d1819e03d723d8bc943cfca",
  );
  assert.equal(
    account.address,
    "0x708f02087dd8cf3ded078ab3034dea597602af4a0ea00704fe9994eb8f730f",
  );
  assert.equal(account.passphrase, "test-passphrase");
});

test("wallet state tells the agent when funding or deployment is required", () => {
  assert.equal(determineWalletState(false, false, 0n, false), "needs_creation");
  assert.equal(determineWalletState(true, false, 0n, false), "needs_funding");
  assert.equal(determineWalletState(true, false, 1n, false), "needs_deployment");
  assert.equal(determineWalletState(true, true, 0n, false), "needs_paymaster");
  assert.equal(determineWalletState(true, true, 0n, true), "ready");
});

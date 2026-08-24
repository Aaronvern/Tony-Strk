import assert from "node:assert/strict";
import test from "node:test";

import {
  createEnvPaymasterStore,
  createEnvWalletStore,
  envWalletConfigured,
} from "../src/pay/env-wallet.ts";

const ENV = {
  ACCOUNT_PRIVATE_KEY: "0x1234",
  ACCOUNT_ADDRESS: "0x077f1679",
  PRIVACY_PASSPHRASE: "a-passphrase",
  AVNU_API_KEY: "key",
};

const quiet = () => {};

test("the env wallet needs both a key and the address it controls", () => {
  assert.equal(envWalletConfigured(ENV), true);
  assert.equal(envWalletConfigured({ ...ENV, ACCOUNT_ADDRESS: undefined }), false);
  assert.equal(envWalletConfigured({ ...ENV, ACCOUNT_PRIVATE_KEY: undefined }), false);
  assert.equal(envWalletConfigured({ ...ENV, ACCOUNT_ADDRESS: "  " }), false);
  assert.equal(envWalletConfigured({}), false);
});

test("it carries the address so an imported account is not re-derived", async () => {
  // Without this the manager computes a counterfactual address from the key,
  // finds an empty account there, and reports the real one as unfunded.
  const secret = await createEnvWalletStore(ENV, quiet).load();
  assert.equal(secret?.address, "0x077f1679");
  assert.equal(secret?.privateKey, "0x1234");
  assert.equal(secret?.passphrase, "a-passphrase");
});

test("it warns that the environment is weaker than the Keychain", async () => {
  const said: string[] = [];
  createEnvWalletStore(ENV, (message) => said.push(message));
  assert.equal(said.length, 1);
  assert.match(said[0], /weaker than the macOS Keychain/);
});

test("the passphrase falls back to a stable default, never a random one", async () => {
  // The passphrase derives the viewing key. A random default would silently
  // hide the notes that funded the account.
  const first = await createEnvWalletStore({ ...ENV, PRIVACY_PASSPHRASE: undefined }, quiet).load();
  const second = await createEnvWalletStore({ ...ENV, PRIVACY_PASSPHRASE: "" }, quiet).load();
  assert.equal(first?.passphrase, second?.passphrase);
  assert.ok(first?.passphrase);
});

test("values are trimmed, because a trailing newline in .env is invisible", async () => {
  const secret = await createEnvWalletStore(
    { ...ENV, ACCOUNT_PRIVATE_KEY: " 0x1234\n", ACCOUNT_ADDRESS: "0x077f1679 " },
    quiet,
  ).load();
  assert.equal(secret?.privateKey, "0x1234");
  assert.equal(secret?.address, "0x077f1679");
});

test("an env wallet refuses to be overwritten at runtime", async () => {
  const store = createEnvWalletStore(ENV, quiet);
  await assert.rejects(
    () => store.save({ privateKey: "0x9", passphrase: "p" }),
    /cannot be changed at runtime/,
  );
});

test("the paymaster key comes from the same place", async () => {
  assert.equal(await createEnvPaymasterStore(ENV).load(), "key");
  assert.equal(await createEnvPaymasterStore({ ...ENV, AVNU_API_KEY: undefined }).load(), null);
  assert.equal(await createEnvPaymasterStore({ ...ENV, AVNU_API_KEY: "  " }).load(), null);
});

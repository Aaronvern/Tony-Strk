import test from "node:test";
import assert from "node:assert/strict";

import { createKeychainStore, createPaymasterKeyStore } from "../src/pay/keychain.ts";

const wallet = {
  privateKey: "0x123",
  passphrase: "a local passphrase",
};

test("the Keychain store saves and loads the local wallet secret", async () => {
  let secret = "";
  const store = createKeychainStore({
    exec: async (args) => {
      if (args[0] === "find-generic-password") return secret;
      secret = args[args.indexOf("-w") + 1];
      return "";
    },
  });

  await store.save(wallet);

  assert.deepEqual(await store.load(), wallet);
});

test("the Keychain store treats a missing secret as an uncreated wallet", async () => {
  const store = createKeychainStore({
    exec: async () => {
      const error = new Error("not found") as Error & { code?: number };
      error.code = 44;
      throw error;
    },
  });

  assert.equal(await store.load(), null);
});

test("the wallet Keychain service can be selected independently", async () => {
  const calls: string[][] = [];
  let secret = "";
  const store = createKeychainStore({
    serviceName: "tony-strk.mainnet.wallet",
    exec: async (args) => {
      calls.push(args);
      if (args[0] === "find-generic-password") return secret;
      secret = args[args.indexOf("-w") + 1];
      return "";
    },
  });

  await store.save(wallet);
  assert.deepEqual(await store.load(), wallet);
  assert.ok(calls.every((args) => args[args.indexOf("-s") + 1] === "tony-strk.mainnet.wallet"));
});

test("the Keychain stores the paymaster key separately from the wallet", async () => {
  let secret = "";
  const store = createPaymasterKeyStore({
    exec: async (args) => {
      if (args[0] === "find-generic-password") return secret;
      secret = args[args.indexOf("-w") + 1];
      return "";
    },
  });

  await store.save("paymaster-key");

  assert.equal(await store.load(), "paymaster-key");
});

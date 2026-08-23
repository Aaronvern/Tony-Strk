import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { WalletSecret } from "./account.ts";

const execFileAsync = promisify(execFile);
const WALLET_SERVICE = "tony-strk.sepolia.wallet";
const PAYMASTER_SERVICE = "tony-strk.sepolia.paymaster";
const ACCOUNT = "default";

type KeychainExec = (args: string[]) => Promise<string>;

export interface KeychainStore {
  load(): Promise<WalletSecret | null>;
  save(secret: WalletSecret): Promise<void>;
}

export interface PaymasterKeyStore {
  load(): Promise<string | null>;
  save(key: string): Promise<void>;
}

function createGenericStore(
  service: string,
  deps: { exec?: KeychainExec } = {},
): PaymasterKeyStore {
  if (process.platform !== "darwin") {
    throw new Error("The local wallet requires the macOS Keychain.");
  }

  const execute = deps.exec ?? (async (args: string[]) => {
    const { stdout } = await execFileAsync("security", args, {
      maxBuffer: 1024 * 1024,
    });
    return stdout.trim();
  });

  return {
    async load() {
      try {
        const value = await execute([
          "find-generic-password",
          "-s",
          service,
          "-a",
          ACCOUNT,
          "-w",
        ]);
        return value;
      } catch (error) {
        if ((error as { code?: number }).code === 44) return null;
        throw error;
      }
    },
    async save(secret) {
      await execute([
        "add-generic-password",
        "-U",
        "-s",
        service,
        "-a",
        ACCOUNT,
        "-w",
        secret,
      ]);
    },
  };
}

export function createKeychainStore(
  deps: { exec?: KeychainExec } = {},
): KeychainStore {
  const store = createGenericStore(WALLET_SERVICE, deps);
  return {
    async load() {
      const value = await store.load();
      if (!value) return null;
      const secret = JSON.parse(value) as WalletSecret;
      if (!secret.privateKey || !secret.passphrase) {
        throw new Error("The macOS Keychain wallet entry is invalid.");
      }
      return secret;
    },
    save: (secret) => store.save(JSON.stringify(secret)),
  };
}

export function createPaymasterKeyStore(
  deps: { exec?: KeychainExec } = {},
): PaymasterKeyStore {
  return createGenericStore(PAYMASTER_SERVICE, deps);
}

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { WalletSecret } from "./account.ts";

const execFileAsync = promisify(execFile);
const SERVICE = "tony-strk.sepolia.wallet";
const ACCOUNT = "default";

type KeychainExec = (args: string[]) => Promise<string>;

export interface KeychainStore {
  load(): Promise<WalletSecret | null>;
  save(secret: WalletSecret): Promise<void>;
}

export function createKeychainStore(
  deps: { exec?: KeychainExec } = {},
): KeychainStore {
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
          SERVICE,
          "-a",
          ACCOUNT,
          "-w",
        ]);
        const secret = JSON.parse(value) as WalletSecret;
        if (!secret.privateKey || !secret.passphrase) {
          throw new Error("The macOS Keychain wallet entry is invalid.");
        }
        return secret;
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
        SERVICE,
        "-a",
        ACCOUNT,
        "-w",
        JSON.stringify(secret),
      ]);
    },
  };
}

import type { WalletSecret } from "./account.ts";
import type { KeychainStore, PaymasterKeyStore } from "./keychain.ts";

/**
 * A wallet held in environment variables.
 *
 * The Keychain store is the right default and the only one on macOS. It is
 * also unavailable everywhere else, which left the whole payment path dead on
 * Linux — the server started, reported a wallet it could never load, and only
 * failed when an agent tried to spend.
 *
 * So: if the environment names a key, use it and say plainly that it is
 * weaker. A key in `.env` is readable by every process running as this user
 * and survives in shell history, backups and crash dumps. That is a real
 * downgrade from the Keychain, not a neutral alternative, and the warning
 * exists so nobody adopts it by accident.
 */
export interface EnvWalletVars {
  ACCOUNT_PRIVATE_KEY?: string;
  ACCOUNT_ADDRESS?: string;
  PRIVACY_PASSPHRASE?: string;
  AVNU_API_KEY?: string;
}

export function envWalletConfigured(env: EnvWalletVars): boolean {
  return Boolean(env.ACCOUNT_PRIVATE_KEY?.trim() && env.ACCOUNT_ADDRESS?.trim());
}

export function createEnvWalletStore(
  env: EnvWalletVars,
  warn: (message: string) => void = console.warn,
): KeychainStore {
  warn(
    "wallet: reading the spending key from the environment. This is weaker than the " +
      "macOS Keychain — a key in .env is readable by anything running as this user. " +
      "Use it for local development, never for an account you care about.",
  );

  const secret: WalletSecret = {
    privateKey: env.ACCOUNT_PRIVATE_KEY!.trim(),
    address: env.ACCOUNT_ADDRESS!.trim(),
    // The passphrase derives the viewing key. Changing it changes which notes
    // this wallet can see, so a default here has to be stable rather than
    // random, and it must match whatever shielded the funds.
    passphrase: env.PRIVACY_PASSPHRASE?.trim() || "tony-stark-sepolia-dev",
  };

  return {
    load: async () => secret,
    save: async () => {
      throw new Error(
        "This wallet comes from the environment and cannot be changed at runtime. " +
          "Edit .env, or unset ACCOUNT_PRIVATE_KEY to use the Keychain.",
      );
    },
  };
}

/** The AVNU key alongside it, so the env path does not half-work. */
export function createEnvPaymasterStore(env: EnvWalletVars): PaymasterKeyStore {
  return {
    load: async () => env.AVNU_API_KEY?.trim() || null,
    save: async () => {
      throw new Error("The paymaster key comes from AVNU_API_KEY in the environment.");
    },
  };
}

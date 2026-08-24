import { randomBytes } from "node:crypto";
import { ec, hash } from "starknet";

export const READY_ACCOUNT_CLASS_HASH =
  "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f";

export interface WalletSecret {
  privateKey: string;
  passphrase: string;
}

export interface CounterfactualAccount extends WalletSecret {
  publicKey: string;
  address: string;
}

export type WalletState =
  | "needs_creation"
  | "needs_funding"
  | "needs_deployment"
  | "needs_paymaster"
  | "ready";

export function createCounterfactualAccount(
  privateKey: string,
  passphrase: string,
): CounterfactualAccount {
  const publicKey = ec.starkCurve.getStarkKey(privateKey);
  const address = hash.calculateContractAddressFromHash(
    publicKey,
    READY_ACCOUNT_CLASS_HASH,
    ["0x0", publicKey, "0x1"],
    "0x0",
  );

  return { privateKey, passphrase, publicKey, address };
}

export function createWalletSecret(): WalletSecret {
  const privateKey = `0x${Buffer.from(ec.starkCurve.utils.randomPrivateKey()).toString("hex")}`;
  return { privateKey, passphrase: randomBytes(32).toString("hex") };
}

export function determineWalletState(
  hasSecret: boolean,
  deployed: boolean,
  balanceWei: bigint,
  hasPaymaster: boolean,
): WalletState {
  if (!hasSecret) return "needs_creation";
  if (!deployed) return balanceWei > 0n ? "needs_deployment" : "needs_funding";
  return hasPaymaster ? "ready" : "needs_paymaster";
}

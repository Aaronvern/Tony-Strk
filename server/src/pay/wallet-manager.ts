import { Account, RpcProvider } from "starknet";

import {
  createCounterfactualAccount,
  createWalletSecret,
  determineWalletState,
  READY_ACCOUNT_CLASS_HASH,
  type WalletState,
} from "./account.ts";
import type { KeychainStore, PaymasterKeyStore } from "./keychain.ts";
import { createWallet, type WalletEnv } from "./wallet.ts";
import type { PayWallet } from "./pay.ts";

export interface WalletStatus {
  state: WalletState;
  address?: string;
  balanceWei?: string;
  transactionHash?: string;
}

export interface WalletManager {
  status(): Promise<WalletStatus>;
  create(): Promise<WalletStatus>;
  deploy(): Promise<WalletStatus>;
  getPayWallet(): Promise<PayWallet | null>;
}

interface WalletManagerOptions extends Omit<WalletEnv, "privateKey" | "address" | "passphrase" | "avnuApiKey"> {
  store: KeychainStore;
  paymaster: PaymasterKeyStore;
}

export function createWalletManager(options: WalletManagerOptions): WalletManager {
  const node = new RpcProvider({ nodeUrl: options.rpcUrl });

  async function accountState() {
    const secret = await options.store.load();
    if (!secret) return { secret: null, account: null, deployed: false, balanceWei: 0n };

    const account = createCounterfactualAccount(secret.privateKey, secret.passphrase);
    // An imported account names its own address; a created one derives it.
    const address = secret.address ?? account.address;
    const deployed = await node.getClassHashAt(address).then(() => true).catch(() => false);
    const balance = await node.callContract({
      contractAddress: options.token,
      entrypoint: "balanceOf",
      calldata: [address],
    });
    const balanceWei = BigInt(balance[0]) + (BigInt(balance[1]) << 128n);
    return { secret, account, address, deployed, balanceWei };
  }

  async function status(): Promise<WalletStatus> {
    const [state, paymasterKey] = await Promise.all([accountState(), options.paymaster.load()]);
    return {
      state: determineWalletState(
        Boolean(state.secret),
        state.deployed,
        state.balanceWei,
        Boolean(paymasterKey),
      ),
      ...(state.address ? { address: state.address, balanceWei: state.balanceWei.toString() } : {}),
    };
  }

  return {
    status,
    async create() {
      if (await options.store.load()) {
        throw new Error("A local wallet already exists. Call wallet_status instead.");
      }
      const secret = createWalletSecret();
      await options.store.save(secret);
      const account = createCounterfactualAccount(secret.privateKey, secret.passphrase);
      return { state: "needs_funding", address: account.address, balanceWei: "0" };
    },
    async deploy() {
      const current = await accountState();
      if (!current.secret || !current.account) {
        throw new Error("Create a wallet before deployment.");
      }
      if (current.deployed) return status();
      if (current.secret.address) {
        throw new Error(
          "That account was imported rather than created here, so this server cannot deploy " +
            "it. Deploy it from the wallet that owns it.",
        );
      }
      if (current.balanceWei === 0n) {
        throw new Error(`Fund ${current.account.address} before deployment.`);
      }

      const account = new Account({
        provider: node,
        address: current.account.address,
        signer: current.secret.privateKey,
      });
      const deployment = await account.deployAccount({
        classHash: READY_ACCOUNT_CLASS_HASH,
        constructorCalldata: ["0x0", current.account.publicKey, "0x1"],
        addressSalt: current.account.publicKey,
        contractAddress: current.account.address,
      });
      await node.waitForTransaction(deployment.transaction_hash);
      return { ...(await status()), transactionHash: deployment.transaction_hash };
    },
    async getPayWallet() {
      const [current, paymasterKey] = await Promise.all([accountState(), options.paymaster.load()]);
      const state = determineWalletState(
        Boolean(current.secret),
        current.deployed,
        current.balanceWei,
        Boolean(paymasterKey),
      );
      if (state !== "ready" || !current.secret || !current.account) {
        throw new Error(`Wallet ${state}. Call wallet_status for the required action.`);
      }
      return createWallet({
        ...options,
        privateKey: current.secret.privateKey,
        address: current.address,
        passphrase: current.secret.passphrase,
        avnuApiKey: paymasterKey ?? undefined,
      });
    },
  };
}

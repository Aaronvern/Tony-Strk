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
import { toWei } from "./amount.ts";

export interface WalletStatus {
  state: WalletState;
  address?: string;
  balanceWei?: string;
  transactionHash?: string;
}

export interface WalletShieldResult {
  transactionHash: string;
  amountWei: string;
  explorerUrl: string;
  receiptBlock: number;
  spendableAfterBlock: number;
}

export interface WalletManager {
  status(): Promise<WalletStatus>;
  create(): Promise<WalletStatus>;
  deploy(): Promise<WalletStatus>;
  getPayWallet(): Promise<PayWallet | null>;
  shield(amount: string): Promise<WalletShieldResult>;
}

interface ShieldReceipt {
  transaction_hash?: unknown;
  execution_status?: unknown;
  finality_status?: unknown;
  block_number?: unknown;
}

interface WalletManagerOptions extends Omit<WalletEnv, "privateKey" | "address" | "passphrase" | "avnuApiKey"> {
  store: KeychainStore;
  paymaster: PaymasterKeyStore;
  explorerBase?: string;
  /** Test seams; production loads the wallet and waits through the manager. */
  wallet?: PayWallet | null;
  waitForTransaction?: (transactionHash: string) => Promise<ShieldReceipt>;
}

const ACCEPTED_FINALITY = new Set(["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"]);

const sameFelt = (left: unknown, right: string) => {
  if (typeof left !== "string") return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
};

export function createWalletManager(options: WalletManagerOptions): WalletManager {
  const node = new RpcProvider({ nodeUrl: options.rpcUrl });
  const waitForTransaction =
    options.waitForTransaction ??
    (async (transactionHash: string) =>
      (await node.waitForTransaction(transactionHash)) as ShieldReceipt);

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

  async function getPayWallet() {
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
    getPayWallet,
    async shield(amount) {
      const amountWei = toWei(amount);
      const wallet = options.wallet === undefined ? await getPayWallet() : options.wallet;
      if (!wallet) {
        throw new Error(
          "Refusing to shield: no spending key is available locally. Call wallet_status " +
            "to create, fund, and deploy the local wallet.",
        );
      }

      const { transaction_hash } = await wallet.strk20InvokeTransaction([
        {
          type: "deposit",
          token: options.token,
          amount: `0x${amountWei.toString(16)}`,
        },
      ]);
      const receipt = await waitForTransaction(transaction_hash);
      if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
        throw new Error("Shield transaction returned a malformed receipt.");
      }
      if (
        receipt.transaction_hash !== undefined &&
        (typeof receipt.transaction_hash !== "string" ||
          (receipt.transaction_hash !== transaction_hash && !sameFelt(receipt.transaction_hash, transaction_hash)))
      ) {
        throw new Error("Shield transaction receipt hash does not match the submitted transaction hash.");
      }
      if (receipt.execution_status !== "SUCCEEDED") {
        throw new Error(
          `Shield transaction did not succeed (${String(receipt.execution_status ?? "missing execution status")}).`,
        );
      }
      if (!ACCEPTED_FINALITY.has(String(receipt.finality_status ?? ""))) {
        throw new Error(
          `Shield transaction is not accepted (${String(receipt.finality_status ?? "missing finality status")}).`,
        );
      }
      if (
        typeof receipt.block_number !== "number" ||
        !Number.isSafeInteger(receipt.block_number) ||
        receipt.block_number < 0
      ) {
        throw new Error("Shield transaction receipt has no valid block number.");
      }
      const receiptBlock = receipt.block_number;

      return {
        transactionHash: transaction_hash,
        amountWei: amountWei.toString(),
        explorerUrl: `${options.explorerBase ?? "https://sepolia.starkscan.co"}/tx/${transaction_hash}`,
        receiptBlock,
        spendableAfterBlock: receiptBlock + 12,
      };
    },
  };
}

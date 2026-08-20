import { toWei } from "./amount.ts";

/** Just the slice of the privacy SDK's wallet that paying needs. */
export interface PayWallet {
  strk20InvokeTransaction(
    actions: unknown[],
  ): Promise<{ transaction_hash: string }>;
}

export interface PayDeps {
  /** Null when the server holds no spending key, which is the hosted default. */
  wallet: PayWallet | null;
  token: string;
  explorerBase: string;
}

export interface PayInput {
  to: string;
  amount: string;
}

export interface PayResult {
  transactionHash: string;
  recipient: string;
  amountWei: string;
  explorerUrl: string;
}

/** Starknet addresses are field elements: at most 63 hex digits, and not zero. */
function assertAddress(value: string): string {
  const ok =
    typeof value === "string" &&
    /^0x[0-9a-fA-F]{1,64}$/.test(value.trim()) &&
    BigInt(value.trim()) > 0n;

  if (!ok) {
    throw new Error(
      `Invalid recipient ${JSON.stringify(value)}: expected a non-zero ` +
        "Starknet address such as 0x077f16…",
    );
  }

  return value.trim();
}

/**
 * Pay an address out of the shielded pool.
 *
 * This is a pool `withdraw`, which is sender-anonymous: the payee sees an
 * amount arrive but cannot tell which shielded depositor sent it. The amount
 * itself is visible on-chain - see docs/THREAT-MODEL.md, which is explicit
 * that we do not claim otherwise.
 */
export async function pay(
  input: PayInput,
  deps: PayDeps,
): Promise<PayResult> {
  // Validate before touching the wallet, so bad input can never reach the pool.
  const recipient = assertAddress(input.to);
  const amountWei = toWei(input.amount);

  if (!deps.wallet) {
    throw new Error(
      "Refusing to pay: this server holds no spending key. Paying requires a " +
        "self-hosted instance configured with ACCOUNT_PRIVATE_KEY, so that the " +
        "key stays with whoever owns the funds.",
    );
  }

  const { transaction_hash } = await deps.wallet.strk20InvokeTransaction([
    {
      type: "withdraw",
      token: deps.token,
      recipient,
      amount: `0x${amountWei.toString(16)}`,
    },
  ]);

  return {
    transactionHash: transaction_hash,
    recipient,
    amountWei: amountWei.toString(),
    explorerUrl: `${deps.explorerBase}/tx/${transaction_hash}`,
  };
}

export const MAINNET_CHAIN_ID = "0x534e5f4d41494e";
export const MAINNET_POOL =
  "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a";
export const STRK =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

export const MAX_POOL_FEE = 6n * 10n ** 18n;

export interface MainnetPlanStep {
  kind: "shield" | "transfer" | "unshield";
  actions: Array<Record<string, string>>;
}

export interface FeeQuoteAction {
  type: "withdraw";
  token: string;
  amount: string | bigint;
  recipient?: string;
}

export interface PoolTransactionReceipt {
  transaction_hash?: string;
  execution_status?: string;
  finality_status?: string;
  events?: Array<{ from_address?: string }>;
}

const sameFelt = (left: unknown, right: string): boolean => {
  if (typeof left !== "string") return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
};

/** The immutable shield → self-transfer → unshield sequence for the mainnet run. */
export function buildMainnetPlan(account: string): MainnetPlanStep[] {
  return [
    {
      kind: "shield",
      actions: [
        { type: "deposit", token: STRK, amount: "0x1158e460913d00000" },
      ],
    },
    {
      kind: "transfer",
      actions: [
        {
          type: "transfer",
          token: STRK,
          amount: "0x16345785d8a0000",
          recipient: account,
        },
      ],
    },
    {
      kind: "unshield",
      actions: [
        {
          type: "withdraw",
          token: STRK,
          amount: "0x1bc16d674ec80000",
          recipient: account,
        },
      ],
    },
  ];
}

/** Reject a paymaster fee unless it is a pool-funded STRK withdrawal within the hard cap. */
export function assertFeeQuote(
  quote: FeeQuoteAction | { feeAction: FeeQuoteAction },
): FeeQuoteAction {
  const feeAction =
    quote && typeof quote === "object" && "feeAction" in quote
      ? quote.feeAction
      : quote && typeof quote === "object" && "type" in quote
        ? quote
        : undefined;
  if (!feeAction || feeAction.type !== "withdraw") {
    throw new Error("Refusing fee quote: expected a withdraw fee action.");
  }
  if (!sameFelt(feeAction.token, STRK)) {
    throw new Error(`Refusing fee quote: fee token must be STRK (${STRK}).`);
  }
  let amount: bigint;
  try {
    amount = BigInt(feeAction.amount);
  } catch {
    throw new Error("Refusing fee quote: fee amount is not an integer.");
  }
  if (amount < 0n || amount > MAX_POOL_FEE) {
    throw new Error("Refusing fee quote: pool fee exceeds the 6 STRK cap.");
  }
  return feeAction;
}

/** Require an accepted successful receipt for the expected hash that emitted from the exact pool. */
export function assertSuccessfulPoolTransaction(
  receipt: PoolTransactionReceipt,
  expectedHash: string,
  poolAddress?: string,
): void;
export function assertSuccessfulPoolTransaction(
  expectedHash: string,
  receipt: PoolTransactionReceipt,
  poolAddress?: string,
): void;
export function assertSuccessfulPoolTransaction(
  first: PoolTransactionReceipt | string,
  second: PoolTransactionReceipt | string,
  poolAddress = MAINNET_POOL,
): void {
  const receipt = typeof first === "string" ? second : first;
  const expectedHash = typeof first === "string" ? first : second;
  if (
    !receipt ||
    typeof receipt === "string" ||
    typeof expectedHash !== "string"
  ) {
    throw new Error("Transaction receipt and expected hash are required.");
  }
  if (receipt.execution_status !== "SUCCEEDED") {
    throw new Error(
      `Transaction did not succeed (${receipt.execution_status ?? "unknown"}).`,
    );
  }
  if (
    receipt.finality_status !== "ACCEPTED_ON_L2" &&
    receipt.finality_status !== "ACCEPTED_ON_L1"
  ) {
    throw new Error(
      `Transaction was not accepted (${receipt.finality_status ?? "unknown"}).`,
    );
  }
  if (!sameFelt(receipt.transaction_hash, expectedHash)) {
    throw new Error(
      "Transaction receipt hash does not match the returned hash.",
    );
  }
  if (
    !receipt.events?.some((event) => sameFelt(event.from_address, poolAddress))
  ) {
    throw new Error("Transaction receipt does not show the exact STRK20 pool.");
  }
}

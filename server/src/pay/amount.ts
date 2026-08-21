export const STRK_DECIMALS = 18;

/**
 * Convert a decimal STRK amount to wei.
 *
 * Done on strings and BigInt throughout. Going via Number would be correct for
 * small values and quietly wrong for large ones - 2^53 wei is about 0.009 STRK,
 * so anything interesting overflows the safe integer range long before it
 * reaches the chain.
 */
export function toWei(amount: string, decimals = STRK_DECIMALS): bigint {
  if (typeof amount !== "string" || !/^\d+(\.\d+)?$/.test(amount.trim())) {
    throw new Error(
      `Invalid amount ${JSON.stringify(amount)}: expected a positive decimal ` +
        'number such as "1.5". Exponent notation is not accepted.',
    );
  }

  const [whole, fraction = ""] = amount.trim().split(".");

  if (fraction.length > decimals) {
    throw new Error(
      `Invalid amount ${JSON.stringify(amount)}: more than ${decimals} ` +
        "decimal places is finer than one wei.",
    );
  }

  const wei =
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");

  if (wei <= 0n) {
    throw new Error(`Invalid amount ${JSON.stringify(amount)}: must be above zero.`);
  }

  return wei;
}

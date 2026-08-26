import { hash, num } from "starknet";

/**
 * Verifying a paywall receipt.
 *
 * The merchant is handed a transaction hash and has to answer one question:
 * did somebody pay me, for this resource, at least this much? It answers that
 * from the chain alone. It never learns who paid, because nobody who paid ever
 * appears: the pool is the caller, the anonymizer is the sender of record, and
 * the payer is a note inside the pool. That is the entire point of the scheme —
 * the merchant gets a verifiable payment and no customer identity to leak,
 * store, or be subpoenaed for.
 */

/**
 * `PaywallAnonymizer::PaywallPaid`. Cairo puts `#[key]` fields in `keys` after
 * the variant selector and the rest in `data`, so a receipt event reads:
 *
 *   keys = [selector, merchant, resource_hash]
 *   data = [token, price]
 *
 * Verified against the real Sepolia settlement 0x94c9a566…82cf5 — see the
 * fixture in test/, which is that transaction's actual receipt.
 */
export const PAYWALL_PAID = num.toHex(hash.starknetKeccak("PaywallPaid"));

export interface ChainEvent {
  from_address: string;
  keys: string[];
  data: string[];
}

export interface ChainReceipt {
  transaction_hash?: string;
  execution_status?: string;
  finality_status?: string;
  events?: ChainEvent[];
}

/** What the merchant demanded in its 402. */
export interface PaywallTerms {
  /** The helper contract whose receipts this merchant trusts. */
  anonymizer: string;
  /** The merchant's own address, as it appeared in `payTo`. */
  merchant: string;
  /** felt252 identifying the resource that was paid for. */
  resourceHash: string;
  /** The token the price is denominated in. */
  asset: string;
  /** Minimum acceptable price, in the token's smallest unit. */
  minPrice: bigint;
}

export type Verdict =
  | { ok: true; price: bigint; finality: string }
  | { ok: false; reason: string };

/**
 * Starknet addresses are field elements, so `0x4d45…` and `0x04d45…` are the
 * same address written two ways. Every comparison here goes through BigInt:
 * a string compare would reject a valid payment depending on which explorer,
 * wallet, or RPC produced the hex.
 */
const sameFelt = (left: string, right: string) => {
  if (typeof left !== "string") return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
};

/**
 * A payment is only final once it is in a block. `ACCEPTED_ON_L2` can still be
 * reorged in principle; waiting for `ACCEPTED_ON_L1` would mean holding the
 * customer for hours. We take L2 and say so — for a paywall the exposure is
 * one article, which is the right trade. A merchant selling something
 * expensive should raise this to L1.
 */
const ACCEPTED = new Set(["ACCEPTED_ON_L2", "ACCEPTED_ON_L1"]);

/**
 * Decide whether a receipt satisfies the terms. Pure, so it can be tested
 * against a real on-chain receipt rather than a hand-built object.
 */
export function verifyReceipt(
  receipt: ChainReceipt,
  terms: PaywallTerms,
  expectedTransactionHash: string,
): Verdict {
  if (!sameFelt(receipt.transaction_hash ?? "", expectedTransactionHash)) {
    return { ok: false, reason: "receipt transaction hash does not match submitted transaction hash" };
  }

  if (receipt.execution_status !== "SUCCEEDED") {
    return {
      ok: false,
      reason: `transaction did not succeed (${receipt.execution_status ?? "missing execution status"})`,
    };
  }

  const finality = receipt.finality_status ?? "";
  if (!ACCEPTED.has(finality)) {
    return {
      ok: false,
      reason: finality
        ? `transaction is not in a block yet (${finality})`
        : "transaction is not in a block yet",
    };
  }

  // Narrow by the whole key tuple at once. Matching on the selector alone and
  // then checking the merchant would accept a receipt addressed to somebody
  // else that happens to share a transaction with ours.
  const receipts = (Array.isArray(receipt.events) ? receipt.events : []).filter(
    (event) =>
      typeof event === "object" && event !== null &&
      typeof event.from_address === "string" &&
      Array.isArray(event.keys) && event.keys.every((key) => typeof key === "string") &&
      Array.isArray(event.data) && event.data.every((value) => typeof value === "string") &&
      sameFelt(event.from_address, terms.anonymizer) &&
      event.keys.length >= 3 &&
      sameFelt(event.keys[0], PAYWALL_PAID) &&
      sameFelt(event.keys[1], terms.merchant) &&
      sameFelt(event.keys[2], terms.resourceHash),
  );

  if (receipts.length === 0) {
    return {
      ok: false,
      reason: "no PaywallPaid receipt for this merchant and resource in that transaction",
    };
  }

  for (const event of receipts) {
    if (event.data.length < 2) continue;
    if (!sameFelt(event.data[0], terms.asset)) continue;
    let price: bigint;
    try {
      price = BigInt(event.data[1]);
    } catch {
      continue;
    }
    if (price === terms.minPrice) return { ok: true, price, finality };
  }

  return { ok: false, reason: "the receipt is for the wrong token or does not exactly match the asking price" };
}

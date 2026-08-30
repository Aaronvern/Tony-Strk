import { browse, type BrowseDeps, type BrowseResult } from "../tools/browse.ts";
import type { PayWallet } from "./pay.ts";
import {
  balanceSurplus,
  buildPaywallActions,
  buildPaymentPayload,
  parsePaymentRequiredHeader,
  type PaymentTerms,
} from "./paywall.ts";

/**
 * Settle a 402 and read what was behind it.
 *
 * Both fetches go through `browse`, which means the paid retry inherits every
 * guard the first request had: the Tor requirement, the SSRF policy, redirect
 * re-validation, and the body size cap. A paid re-fetch that skipped those
 * would be the obvious hole — pay once, then get talked into fetching
 * something private with the receipt in hand.
 */

export interface SettleDeps extends BrowseDeps {
  /** x402 network identifier expected from the merchant. Sepolia by default. */
  network?: string;
  /** Null when no spending key is available, which is the hosted default. */
  getWallet: () => Promise<PayWallet | null>;
  /** The payer's own address — the surplus sink pays back to it. */
  getPayerAddress: () => Promise<string | undefined>;
  /** Helper contracts whose 402s this wallet is willing to settle. */
  trustedAnonymizers: string[];
  /** Ceiling for a single resource, in the asset's smallest unit. */
  maxPrice: bigint;
  asset: string;
  explorerBase: string;
  /** Injected so tests do not wait out real confirmation delays. */
  sleep?: (ms: number) => Promise<void>;
}

export interface SettleInput {
  url: string;
  /** Lower the ceiling for this one call. It can never raise it. */
  maxPrice?: bigint;
}

export interface SettleResult extends BrowseResult {
  paid: boolean;
  transactionHash?: string;
  explorerUrl?: string;
  amountWei?: string;
  description?: string;
}

/** How long to keep retrying while the merchant cannot see the payment yet. */
const CONFIRM_ATTEMPTS = 8;
const CONFIRM_DELAY_MS = 5_000;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sameFelt = (left: unknown, right: string) => {
  if (typeof left !== "string") return false;
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
};

const amountMatches = (value: unknown, expected: bigint) => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  try {
    return BigInt(value) === expected;
  } catch {
    return false;
  }
};

function decodePaymentResponse(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value || !BASE64.test(value)) return undefined;
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) return undefined;
  try {
    const parsed: unknown = JSON.parse(decoded.toString("utf8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function responseMatches(
  response: Record<string, unknown>,
  terms: PaymentTerms,
  transactionHash: string,
) {
  return sameFelt(response.transaction, transactionHash) &&
    response.network === terms.network &&
    (response.amount === undefined || amountMatches(response.amount, terms.amount));
}

export async function settlePaywall(
  input: SettleInput,
  deps: SettleDeps,
): Promise<SettleResult> {
  const first = await browse({ url: input.url }, deps);
  if (first.status !== 402) {
    // Nothing to pay for. Hand back what was fetched rather than treating a
    // free page as an error.
    return { ...first, paid: false };
  }

  if (!first.paymentRequiredHeader) {
    throw new Error(
      `${input.url} answered 402 without a canonical PAYMENT-REQUIRED header, so there is ` +
        "nothing safe to settle.",
    );
  }

  // A per-call ceiling may only tighten the configured one. Otherwise the
  // guard would be advisory: anything able to call this tool could raise it.
  const ceiling =
    input.maxPrice === undefined
      ? deps.maxPrice
      : input.maxPrice < deps.maxPrice
        ? input.maxPrice
        : deps.maxPrice;

  const terms: PaymentTerms = parsePaymentRequiredHeader(first.paymentRequiredHeader, {
    network: deps.network,
    trustedAnonymizers: deps.trustedAnonymizers,
    maxPrice: ceiling,
    asset: deps.asset,
    requestedUrl: input.url,
  });

  const wallet = await deps.getWallet();
  if (!wallet) {
    throw new Error(
      `${input.url} wants ${terms.amount} of ${terms.asset}, but no spending key is ` +
        "available locally. Call wallet_status to create, fund, and deploy the wallet.",
    );
  }

  const payer = await deps.getPayerAddress();
  if (!payer) {
    throw new Error("Refusing to pay: the local wallet has no address yet.");
  }

  const { result } = await balanceSurplus(
    buildPaywallActions(terms),
    (actions) => wallet.strk20InvokeTransaction(actions),
    payer,
    terms.asset,
  );
  const transactionHash = result.transaction_hash;
  const explorerUrl = `${deps.explorerBase}/tx/${transactionHash}`;
  const settled = {
    paid: true,
    transactionHash,
    explorerUrl,
    amountWei: terms.amount.toString(),
    description: terms.description,
  };

  const sleep = deps.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));

  // The merchant checks the chain, so it cannot see the payment until the
  // transaction is in a block. A 402 here means "not yet", not "refused".
  for (let attempt = 0; ; attempt++) {
    const paid = await browse(
      {
        url: input.url,
        headers: {
          "PAYMENT-SIGNATURE": encode(buildPaymentPayload(terms, transactionHash)),
        },
      },
      deps,
    );
    const response = decodePaymentResponse(paid.paymentResponseHeader);
    if (paid.status >= 200 && paid.status < 300) {
      if (
        response?.success === true &&
        amountMatches(response.amount, terms.amount) &&
        responseMatches(response, terms, transactionHash)
      ) {
        return { ...paid, ...settled };
      }
      throw new Error(
        `Paid ${terms.amount} in ${transactionHash} (${explorerUrl}), but the merchant returned ` +
          "a missing, malformed, or mismatched successful PAYMENT-RESPONSE. Keep that hash — " +
          "retry the URL with the PAYMENT-SIGNATURE payload rather than paying again.",
      );
    }
    if (
      paid.status !== 402 ||
      response?.success !== false ||
      response.errorReason !== "settlement_pending" ||
      !responseMatches(response, terms, transactionHash)
    ) {
      throw new Error(
        `Paid ${terms.amount} in ${transactionHash} (${explorerUrl}), but the merchant returned ` +
          "a missing, malformed, mismatched, or permanent PAYMENT-RESPONSE. Keep that hash — " +
          "retry the URL with the PAYMENT-SIGNATURE payload rather than paying again.",
      );
    }

    if (attempt >= CONFIRM_ATTEMPTS - 1) {
      // Lead with the hash. The money is gone either way, and a caller that
      // loses the receipt has no way to claim what it bought.
      throw new Error(
        `Paid ${terms.amount} in ${transactionHash} (${explorerUrl}), but ${input.url} still ` +
          `answers 402 after ${CONFIRM_ATTEMPTS} attempts. Keep that hash — retry the URL ` +
          `with the PAYMENT-SIGNATURE payload rather than paying again. Last response: ${paid.text.slice(0, 300)}`,
      );
    }
    await sleep(CONFIRM_DELAY_MS);
  }
}

/**
 * Paying an HTTP 402.
 *
 * A merchant answers 402 with terms; this turns those terms into a STRK20
 * action list that settles them through the anonymizer, so the merchant is
 * paid and never learns who paid. The envelope is x402's `PaymentRequirements`
 * because it is a good shape and agents already understand it. The scheme name
 * is not: x402's Starknet `exact` scheme needs a signed OutsideExecution from
 * an identified payer, which is exactly the thing this exists to avoid.
 *
 * Two guards live here rather than in the caller, because an agent paying
 * automatically cannot be asked to remember them.
 *
 *   1. The `invoke` leg calls a contract of the *merchant's* choosing with the
 *      payer's money in hand. A merchant that could name any contract could
 *      name one that keeps everything. So the helper must be one the payer
 *      already trusts, by address, and an unknown one is refused outright.
 *   2. A price the payer never agreed to is refused. Without a ceiling, a 402
 *      asking for a thousand STRK is indistinguishable from one asking for
 *      0.05, and the agent would pay it.
 */

/** The subset of x402's PaymentRequirements this scheme uses. */
export interface PaymentTerms {
  scheme: string;
  network: string;
  /** Price in the asset's smallest unit. */
  amount: bigint;
  /** The URL these terms are for. */
  resource: string;
  description: string;
  /** Where the money goes. */
  payTo: string;
  /** Token the price is denominated in. */
  asset: string;
  /** Helper contract that will emit the receipt. */
  anonymizer: string;
  /** felt252 identifying the resource. */
  resourceHash: string;
}

export interface ParseOptions {
  /** Anonymizer addresses the payer is willing to call. Required. */
  trustedAnonymizers: string[];
  /** Most the payer will spend on one resource, in the asset's smallest unit. */
  maxPrice: bigint;
  /** The token the payer holds. */
  asset: string;
  /** The URL that produced this 402, so terms for another resource are caught. */
  requestedUrl?: string;
}

export const SCHEME = "strk20-anonymizer";

const isFelt = (value: unknown): value is string =>
  typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value.trim());

const sameFelt = (left: string, right: string) => {
  try {
    return BigInt(left) === BigInt(right);
  } catch {
    return false;
  }
};

/** Compare URLs by origin and path, ignoring the query and fragment. */
function sameResource(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

/**
 * Read a 402 body and return terms that are safe to act on, or throw with a
 * reason a human can act on. Pure: no network, no wallet.
 */
export function parsePaymentRequired(body: unknown, options: ParseOptions): PaymentTerms {
  if (options.trustedAnonymizers.length === 0) {
    throw new Error("Refusing to pay: no anonymizer contract is trusted, so no 402 can be settled.");
  }

  const accepts = (body as { accepts?: unknown })?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error("That 402 carries no payment terms (`accepts` is missing or empty).");
  }

  const offer = accepts.find(
    (entry) => (entry as { scheme?: unknown })?.scheme === SCHEME,
  ) as Record<string, any> | undefined;

  if (!offer) {
    const seen = accepts
      .map((entry) => (entry as { scheme?: unknown })?.scheme)
      .filter((scheme) => typeof scheme === "string");
    throw new Error(
      `No ${SCHEME} terms in that 402 (offered: ${seen.join(", ") || "nothing recognisable"}). ` +
        "Other x402 schemes identify the payer, so this wallet cannot settle them.",
    );
  }

  const extra = (offer.extra ?? {}) as Record<string, unknown>;
  const anonymizer = extra.anonymizer;
  const resourceHash = extra.resourceHash;

  for (const [name, value] of [
    ["payTo", offer.payTo],
    ["asset", offer.asset],
    ["extra.anonymizer", anonymizer],
    ["extra.resourceHash", resourceHash],
  ] as const) {
    if (!isFelt(value)) {
      throw new Error(`That 402 has no usable \`${name}\`: ${JSON.stringify(value)}`);
    }
  }

  // The guard that matters most. `invoke` hands the money to this contract.
  if (!options.trustedAnonymizers.some((trusted) => sameFelt(trusted, anonymizer as string))) {
    throw new Error(
      `Refusing to pay: that 402 names anonymizer ${anonymizer}, which this wallet does not ` +
        "trust. Paying would call an unknown contract while holding the funds.",
    );
  }

  if (!sameFelt(offer.asset, options.asset)) {
    throw new Error(
      `That 402 wants ${offer.asset}, and this wallet pays in ${options.asset}.`,
    );
  }

  let amount: bigint;
  try {
    amount = BigInt(offer.maxAmountRequired);
  } catch {
    throw new Error(`That 402 has an unreadable price: ${JSON.stringify(offer.maxAmountRequired)}`);
  }
  if (amount <= 0n) throw new Error("That 402 asks for a price of zero or less.");
  if (amount > options.maxPrice) {
    throw new Error(
      `Refusing to pay: that 402 asks for ${amount}, above the ${options.maxPrice} ceiling ` +
        "this wallet was given.",
    );
  }

  if (options.requestedUrl && typeof offer.resource === "string") {
    if (!sameResource(offer.resource, options.requestedUrl)) {
      throw new Error(
        `Refusing to pay: those terms are for ${offer.resource}, not the ` +
          `${options.requestedUrl} that was requested.`,
      );
    }
  }

  return {
    scheme: SCHEME,
    network: typeof offer.network === "string" ? offer.network : "",
    amount,
    resource: typeof offer.resource === "string" ? offer.resource : options.requestedUrl ?? "",
    description: typeof offer.description === "string" ? offer.description : "",
    payTo: (offer.payTo as string).trim(),
    asset: (offer.asset as string).trim(),
    anonymizer: (anonymizer as string).trim(),
    resourceHash: (resourceHash as string).trim(),
  };
}

const hex = (value: bigint) => `0x${value.toString(16)}`;

/**
 * The action list that settles one 402.
 *
 * The pool withdraws the price to the helper, calls `privacy_invoke`, and the
 * helper pays the merchant — all in one transaction, so the money is never
 * sitting anywhere it could be stranded. Funding the helper with exactly the
 * price means there is no change, which is why `change_note_id` is `None` and
 * no open note is needed.
 *
 * Calldata order must match `privacy_invoke`'s signature exactly, because the
 * pool deserialises straight into it:
 *   merchant, token, price: u128, resource_hash: felt252, change_note_id: Option<felt252>
 * `Option::None` is variant index 1 — `Some` is declared first in core — and
 * carries no payload, so it is a single felt.
 */
export function buildPaywallActions(terms: PaymentTerms): unknown[] {
  return [
    { type: "withdraw", token: terms.asset, amount: hex(terms.amount), recipient: terms.anonymizer },
    {
      type: "invoke",
      contract: terms.anonymizer,
      calldata: [terms.payTo, terms.asset, hex(terms.amount), terms.resourceHash, "0x1"],
    },
  ];
}

/**
 * Note selection is naive: it takes whole notes to cover a spend, so a small
 * withdraw funded by a large note leaves the remainder unaccounted and the
 * builder refuses with "Surplus of N found ... but no surplus action found".
 *
 * The core SDK has `surplusTo()` for this, but the STRK20 action vocabulary
 * `strk20InvokeTransaction` speaks has no surplus action, so the sink has to
 * be an explicit private transfer back to the payer. The amount depends on
 * which notes were selected, so it is read off the rejection. A privacy-enabled
 * wallet does this itself; the SDK path does not.
 */
const SURPLUS = /Surplus of (\d+) found/;

export async function balanceSurplus(
  actions: unknown[],
  dryRun: (actions: unknown[]) => Promise<unknown>,
  payer: string,
  asset: string,
  attempts = 3,
): Promise<unknown[]> {
  let candidate = [...actions];
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await dryRun(candidate);
      return candidate;
    } catch (error) {
      const found = SURPLUS.exec(String((error as Error)?.message ?? error));
      if (!found) throw error;
      candidate = [
        // Before the invoke, so the pool reads it as a plain balancing leg.
        ...candidate.slice(0, -1),
        { type: "transfer", token: asset, amount: hex(BigInt(found[1])), recipient: payer },
        candidate[candidate.length - 1],
      ];
    }
  }
  throw new Error(`Could not balance the note surplus in ${attempts} attempts.`);
}

/**
 * Paying an HTTP 402.
 *
 * A merchant answers 402 with terms; this turns those terms into a STRK20
 * action list that settles them through the anonymizer, so the merchant is
 * paid and never learns who paid. The wire envelope is x402 v2. The scheme
 * name is custom: x402's Starknet `exact` scheme needs a signed
 * OutsideExecution from an identified payer, which is exactly the thing this
 * exists to avoid.
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

export const NETWORK = "starknet:SN_SEPOLIA";

const PAYMENT_FLOW = "upfront";
const ASSET_TRANSFER_METHOD = "strk20-privacy-invoke";

export interface PaymentResource {
  url: string;
  description?: string;
  mimeType?: string;
  serviceName?: string;
  tags?: string[];
}

export interface AcceptedPaymentRequirement {
  scheme: string;
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: {
    assetTransferMethod: string;
    paymentFlow: string;
    anonymizer: string;
    resourceHash: string;
  };
}

/** The checked x402 v2 terms used to build both legs of a payment. */
export interface PaymentTerms {
  scheme: string;
  network: string;
  /** Price in the asset's smallest unit. */
  amount: bigint;
  /** The exact top-level x402 v2 resource object. */
  resource: PaymentResource;
  /** The exact accepted x402 v2 requirement object. */
  accepted: AcceptedPaymentRequirement;
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
  /** x402 network identifier expected from the merchant. Sepolia by default. */
  network?: string;
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

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sameKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
};

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodePaymentRequiredHeader(value: unknown): unknown {
  if (typeof value !== "string" || value.length === 0 || !BASE64.test(value)) {
    throw new Error("PAYMENT-REQUIRED must be canonical standard Base64-encoded JSON.");
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error("PAYMENT-REQUIRED must be canonical standard Base64-encoded JSON.");
  }
  try {
    return JSON.parse(decoded.toString("utf8"));
  } catch {
    throw new Error("PAYMENT-REQUIRED must contain JSON payment requirements.");
  }
}

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
 * Decode a canonical x402 v2 PAYMENT-REQUIRED header and return terms that are
 * safe to act on, or throw with a reason a human can act on. Pure: no network,
 * no wallet.
 */
export function parsePaymentRequiredHeader(value: string, options: ParseOptions): PaymentTerms {
  const body = decodePaymentRequiredHeader(value);
  if (!isRecord(body)) {
    throw new Error("PAYMENT-REQUIRED must contain JSON payment requirements.");
  }
  if (body.x402Version !== 2) {
    throw new Error("PAYMENT-REQUIRED x402Version must be 2.");
  }

  const resource = body.resource;
  if (!isRecord(resource) || typeof resource.url !== "string" || !resource.url.trim()) {
    throw new Error("PAYMENT-REQUIRED must include a top-level resource.url.");
  }
  try {
    new URL(resource.url);
  } catch {
    throw new Error("PAYMENT-REQUIRED resource.url must be an absolute URL.");
  }

  if (options.trustedAnonymizers.length === 0) {
    throw new Error("Refusing to pay: no anonymizer contract is trusted, so no 402 can be settled.");
  }

  const accepts = body.accepts;
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

  if (!offer || !sameKeys(offer, [
    "scheme",
    "network",
    "amount",
    "asset",
    "payTo",
    "maxTimeoutSeconds",
    "extra",
  ])) {
    throw new Error("That 402 has an invalid accepted payment requirement shape.");
  }

  const extra = offer.extra;
  if (!isRecord(extra) || !sameKeys(extra, [
    "assetTransferMethod",
    "paymentFlow",
    "anonymizer",
    "resourceHash",
  ])) {
    throw new Error("That 402 has an invalid payment helper configuration.");
  }
  const expectedNetwork = options.network ?? NETWORK;
  if (offer.network !== expectedNetwork) {
    throw new Error(
      `That 402 uses network ${JSON.stringify(offer.network)}, not ${expectedNetwork}.`,
    );
  }
  if (extra.paymentFlow !== PAYMENT_FLOW) {
    throw new Error(`That 402 uses payment flow ${JSON.stringify(extra.paymentFlow)}, not ${PAYMENT_FLOW}.`);
  }
  if (extra.assetTransferMethod !== ASSET_TRANSFER_METHOD) {
    throw new Error(
      `That 402 uses asset transfer method ${JSON.stringify(extra.assetTransferMethod)}, not ${ASSET_TRANSFER_METHOD}.`,
    );
  }
  if (!Number.isSafeInteger(offer.maxTimeoutSeconds) || offer.maxTimeoutSeconds <= 0) {
    throw new Error("That 402 has an invalid maxTimeoutSeconds value.");
  }

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
    if (typeof offer.amount !== "string" || !/^\d+$/.test(offer.amount)) throw new Error();
    amount = BigInt(offer.amount);
  } catch {
    throw new Error(`That 402 has an unreadable price: ${JSON.stringify(offer.amount)}`);
  }
  if (amount <= 0n) throw new Error("That 402 asks for a price of zero or less.");
  if (amount > options.maxPrice) {
    throw new Error(
      `Refusing to pay: that 402 asks for ${amount}, above the ${options.maxPrice} ceiling ` +
        "this wallet was given.",
    );
  }

  if (options.requestedUrl) {
    if (!sameResource(resource.url, options.requestedUrl)) {
      throw new Error(
        `Refusing to pay: those terms are for ${resource.url}, not the ` +
          `${options.requestedUrl} that was requested.`,
      );
    }
  }

  return {
    scheme: SCHEME,
    network: offer.network,
    amount,
    resource: resource as PaymentResource,
    accepted: offer as AcceptedPaymentRequirement,
    description: typeof resource.description === "string" ? resource.description : "",
    payTo: (offer.payTo as string).trim(),
    asset: (offer.asset as string).trim(),
    anonymizer: (anonymizer as string).trim(),
    resourceHash: (resourceHash as string).trim(),
  };
}

/** Build the canonical x402 v2 PaymentPayload for a broadcast transaction. */
export function buildPaymentPayload(terms: PaymentTerms, transactionHash: string) {
  return {
    x402Version: 2,
    resource: terms.resource,
    accepted: terms.accepted,
    payload: { transactionHash },
    extensions: {},
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
 * be an explicit private transfer back to the payer. A privacy-enabled wallet
 * does this itself; the SDK path does not.
 *
 * The sink has to be balanced against the operation that will actually run.
 * Which notes get selected depends on what is in the pool at that moment, so a
 * sink measured during a dry run can be wrong by the time the real submission
 * builds its proof — a deposit landing in between is enough. Both the dry run
 * and the submission therefore balance themselves, starting from the same base.
 *
 * Retrying is safe: the surplus is raised by the action compiler while building
 * the proof, before the paymaster is ever handed anything, so a rejected
 * attempt costs nothing and settles nothing.
 */
const SURPLUS = /Surplus of (\d+) found/;

export interface Balanced<T> {
  /** The action list that succeeded, sinks included. */
  actions: unknown[];
  result: T;
}

export async function balanceSurplus<T>(
  base: unknown[],
  run: (actions: unknown[]) => Promise<T>,
  payer: string,
  asset: string,
  attempts = 4,
): Promise<Balanced<T>> {
  // Sinks accumulate rather than replace. Each rejection reports what is still
  // unaccounted for given the sinks already present, so the totals add up.
  const sinks: unknown[] = [];

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Sinks go before the invoke, so the pool reads them as plain balancing legs.
    const actions = [...base.slice(0, -1), ...sinks, base[base.length - 1]];
    try {
      return { actions, result: await run(actions) };
    } catch (error) {
      const found = SURPLUS.exec(String((error as Error)?.message ?? error));
      if (!found) throw error;
      sinks.push({
        type: "transfer",
        token: asset,
        amount: hex(BigInt(found[1])),
        recipient: payer,
      });
    }
  }

  throw new Error(`Could not balance the note surplus in ${attempts} attempts.`);
}

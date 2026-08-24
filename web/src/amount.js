/**
 * Token amount arithmetic for the pool console.
 *
 * Kept out of the page and free of imports so it can be tested in plain Node.
 * Everything here is BigInt on purpose: 2^53 wei is about 0.009 STRK, so a
 * Number silently loses precision at the sizes a shield deals in, and the
 * failure would be a wrong amount signed by the user rather than an error.
 */

const WEI = 10n ** 18n;
const DECIMALS = 18;

/** Parse a decimal STRK string to wei. Throws on anything that is not one. */
export function toWei(text) {
  const trimmed = String(text).trim();
  if (trimmed === "" || trimmed === "." || !/^\d*\.?\d*$/.test(trimmed)) {
    throw new Error(`"${text}" is not a decimal amount`);
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > DECIMALS) {
    throw new Error(`${text} has more than ${DECIMALS} decimals`);
  }
  return BigInt(whole || "0") * WEI + BigInt((frac + "0".repeat(DECIMALS)).slice(0, DECIMALS));
}

/** Render wei as a decimal string, trailing zeros trimmed. */
export function fmt(wei) {
  const negative = wei < 0n;
  const digits = (negative ? -wei : wei).toString().padStart(DECIMALS + 1, "0");
  const frac = digits.slice(-DECIMALS).replace(/0+$/, "");
  return `${negative ? "-" : ""}${digits.slice(0, -DECIMALS)}${frac ? `.${frac}` : ""}`;
}

/** Read a u256 return value, which the RPC hands back as [low, high] felts. */
export function u256([low, high]) {
  return BigInt(low) + (BigInt(high ?? 0) << 128n);
}

import dns from "node:dns";
import { isIP } from "node:net";

type Lookup = typeof dns.promises.lookup;

export interface PublicHttpUrl {
  url: URL;
  address: string;
}

export async function assertPublicHttpUrl(
  value: string,
  lookup: Lookup = dns.promises.lookup,
): Promise<PublicHttpUrl> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Use an HTTP or HTTPS URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use an HTTP or HTTPS URL.");
  }
  if (url.username || url.password) {
    throw new Error("Public URLs must not include credentials.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("Browse only supports public addresses.");
  }

  return { url, address: addresses[0].address };
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;

  const value = ipv6ToBigInt(address);
  if (value === null) return false;
  if ((value >> 32n) === 0xffffn) return isPublicIpv4(ipv4FromBigInt(value));

  return !inCidr(value, 0n, 128) &&
    !inCidr(value, 1n, 128) &&
    !inCidr(value, 0x100n << 112n, 64) &&
    !inCidr(value, 0x64ff9b0001n << 80n, 48) &&
    !inCidr(value, 0xfc00n << 112n, 7) &&
    !inCidr(value, 0xfe80n << 112n, 10) &&
    !inCidr(value, 0xff00n << 112n, 8) &&
    !inCidr(value, 0x20010000n << 96n, 23) &&
    !inCidr(value, 0x2002n << 112n, 16);
}

function isPublicIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return !(
    address === "100.100.100.200" ||
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    address.startsWith("192.31.196.") ||
    address.startsWith("192.52.193.") ||
    address.startsWith("192.88.99.") ||
    address.startsWith("192.175.48.") ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function ipv6ToBigInt(address: string): bigint | null {
  const [left, right = ""] = address.toLowerCase().split("::");
  if (address.split("::").length > 2) return null;
  const start = left ? left.split(":") : [];
  const end = right ? right.split(":") : [];
  if (start.length + end.length > 8) return null;
  const parts = [...start, ...Array(8 - start.length - end.length).fill("0"), ...end];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
  return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part}`), 0n);
}

function ipv4FromBigInt(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => Number((value >> shift) & 255n)).join(".");
}

function inCidr(value: bigint, network: bigint, prefix: number): boolean {
  return value >> BigInt(128 - prefix) === network >> BigInt(128 - prefix);
}

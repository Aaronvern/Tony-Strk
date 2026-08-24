/**
 * OHTTP configuration for the proving and discovery providers.
 *
 * Two things about RFC 9458 as the SDK implements it drive this file.
 *
 * **One relay serves one gateway.** The client POSTs the encapsulated request
 * to the relay and nothing in it names the gateway — `OhttpClient.send()` does
 * `fetch(this.relayUrl ?? this.gatewayUrl, init)`. The destination is therefore
 * baked into the relay's own configuration, so fronting both the prover and the
 * discovery service needs two relay endpoints (which may be two paths on one
 * deployment).
 *
 * **A relay alone does not blind the IP.** `/ohttp-keys` is fetched from the
 * *gateway*, not through the relay, so a cold start still contacts the gateway
 * directly. Pin `publicKeyConfig` and the key fetch never happens. Without it,
 * setting a relay moves the leak rather than closing it.
 */

/** Matches the SDK's `OhttpOption`. */
export type OhttpOption =
  | boolean
  | { relayUrl?: string; publicKeyConfig?: Uint8Array };

export interface OhttpEnv {
  ohttpEnabled: boolean;
  /** Relay fronting the proving gateway. */
  ohttpProverRelayUrl?: string;
  /** Relay fronting the discovery gateway. */
  ohttpDiscoveryRelayUrl?: string;
  /** Pinned `application/ohttp-keys` bytes, hex, for the proving gateway. */
  ohttpProverKeyConfig?: string;
  /** Pinned `application/ohttp-keys` bytes, hex, for the discovery gateway. */
  ohttpDiscoveryKeyConfig?: string;
  /** Deprecated single relay. Cannot correctly front both gateways. */
  ohttpRelayUrl?: string;
}

/** Decode pinned key-config bytes from hex, with or without a `0x` prefix. */
export function parseKeyConfig(hex: string | undefined): Uint8Array | undefined {
  if (!hex) return undefined;
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length === 0) return undefined;
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error(
      "OHTTP key config must be hex-encoded `application/ohttp-keys` bytes",
    );
  }
  return Uint8Array.from(
    clean.match(/../g)!.map((byte) => parseInt(byte, 16)),
  );
}

/**
 * Resolve per-provider OHTTP options.
 *
 * @param warn - where to report a misconfiguration; defaults to console.warn.
 */
export function resolveOhttp(
  env: OhttpEnv,
  warn: (message: string) => void = console.warn,
): { prover: OhttpOption; discovery: OhttpOption } {
  if (!env.ohttpEnabled) return { prover: false, discovery: false };

  let proverRelay = env.ohttpProverRelayUrl;
  let discoveryRelay = env.ohttpDiscoveryRelayUrl;

  // A single relay cannot front two gateways: it forwards to whichever one it
  // was configured with, so one of the two providers would be talking to the
  // wrong service. Honour the old variable so existing setups keep working,
  // but say plainly that it is wrong.
  if (env.ohttpRelayUrl && !proverRelay && !discoveryRelay) {
    warn(
      "OHTTP_RELAY_URL is deprecated and cannot front both gateways: a relay " +
        "forwards to the one gateway it is configured with. Set " +
        "OHTTP_PROVER_RELAY_URL and OHTTP_DISCOVERY_RELAY_URL instead.",
    );
    proverRelay = env.ohttpRelayUrl;
    discoveryRelay = env.ohttpRelayUrl;
  }

  const proverKey = parseKeyConfig(env.ohttpProverKeyConfig);
  const discoveryKey = parseKeyConfig(env.ohttpDiscoveryKeyConfig);

  for (const [name, relay, key] of [
    ["prover", proverRelay, proverKey],
    ["discovery", discoveryRelay, discoveryKey],
  ] as const) {
    if (relay && !key) {
      warn(
        `OHTTP ${name} relay is set without a pinned key config. ` +
          "/ohttp-keys is still fetched from the gateway directly, so the " +
          "gateway still sees this client's IP on a cold start. Set " +
          `OHTTP_${name.toUpperCase()}_KEY_CONFIG to close it.`,
      );
    }
  }

  const build = (relayUrl?: string, publicKeyConfig?: Uint8Array): OhttpOption => {
    if (!relayUrl && !publicKeyConfig) return true;
    return {
      ...(relayUrl ? { relayUrl } : {}),
      ...(publicKeyConfig ? { publicKeyConfig } : {}),
    };
  };

  return {
    prover: build(proverRelay, proverKey),
    discovery: build(discoveryRelay, discoveryKey),
  };
}

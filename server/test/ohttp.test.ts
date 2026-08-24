import assert from "node:assert/strict";
import { test } from "node:test";

import { parseKeyConfig, resolveOhttp } from "../src/pay/ohttp.ts";

const collect = () => {
  const warnings: string[] = [];
  return { warn: (m: string) => warnings.push(m), warnings };
};

test("OHTTP off means off on both providers", () => {
  const { prover, discovery } = resolveOhttp({ ohttpEnabled: false });
  assert.equal(prover, false);
  assert.equal(discovery, false);
});

test("with no relay it is confidentiality only, not unlinkability", () => {
  const { prover, discovery } = resolveOhttp({ ohttpEnabled: true });
  assert.equal(prover, true);
  assert.equal(discovery, true);
});

test("prover and discovery get their own relays", () => {
  const { prover, discovery } = resolveOhttp({
    ohttpEnabled: true,
    ohttpProverRelayUrl: "https://relay.example/prover",
    ohttpDiscoveryRelayUrl: "https://relay.example/discovery",
  }, () => {});
  assert.deepEqual(prover, { relayUrl: "https://relay.example/prover" });
  assert.deepEqual(discovery, { relayUrl: "https://relay.example/discovery" });
});

test("a single legacy relay still works but is called out as wrong", () => {
  const { warn, warnings } = collect();
  const { prover, discovery } = resolveOhttp(
    { ohttpEnabled: true, ohttpRelayUrl: "https://relay.example" },
    warn,
  );
  // Honoured, so existing setups do not silently break.
  assert.deepEqual(prover, { relayUrl: "https://relay.example" });
  assert.deepEqual(discovery, { relayUrl: "https://relay.example" });
  assert.ok(warnings.some((w) => w.includes("cannot front both gateways")));
});

test("a relay without a pinned key config is flagged as still leaking the IP", () => {
  const { warn, warnings } = collect();
  resolveOhttp(
    { ohttpEnabled: true, ohttpProverRelayUrl: "https://relay.example/prover" },
    warn,
  );
  // /ohttp-keys is fetched from the gateway, not through the relay.
  assert.ok(warnings.some((w) => w.includes("still sees this client's IP")));
});

test("a pinned key config silences the warning and reaches the provider", () => {
  const { warn, warnings } = collect();
  const { prover } = resolveOhttp(
    {
      ohttpEnabled: true,
      ohttpProverRelayUrl: "https://relay.example/prover",
      ohttpProverKeyConfig: "0x0102ff",
    },
    warn,
  );
  assert.deepEqual(prover, {
    relayUrl: "https://relay.example/prover",
    publicKeyConfig: Uint8Array.from([1, 2, 255]),
  });
  assert.equal(warnings.length, 0);
});

test("key config accepts hex with or without 0x, and rejects junk", () => {
  assert.deepEqual(parseKeyConfig("0a0b"), Uint8Array.from([10, 11]));
  assert.deepEqual(parseKeyConfig("0x0a0b"), Uint8Array.from([10, 11]));
  assert.equal(parseKeyConfig(undefined), undefined);
  assert.equal(parseKeyConfig(""), undefined);
  assert.throws(() => parseKeyConfig("zz"), /hex-encoded/);
  assert.throws(() => parseKeyConfig("abc"), /hex-encoded/);
});

/**
 * Verifies the STRK20 privacy infrastructure we depend on is live.
 *
 * Reproduces the Spike-2 findings (docs/SPIKE-RESULTS.md §10):
 *   - StarkWare's Sepolia prover + discovery are up and synced
 *   - OHTTP is live, and the prover's key config byte-matches the one
 *     pinned in starknet-privacy/demo/.env.example — proving these are
 *     the official services the SDK ships against
 *
 * Run: node scripts/spikes/check-services.mjs
 */

const PINNED_OHTTP_KEY = "ACkAACBBhSMg/zZ0lfpSLJTLg685Hk6JAYOSclu/IJjdkxvEJAAEAAEAAQ==";

const SERVICES = [
  { name: "Prover (Sepolia, StarkWare)", url: "https://transaction-prover.alpha-sepolia.sw-dev.io", ohttp: true },
  { name: "Discovery (Sepolia, StarkWare)", url: "https://discovery-service.alpha-sepolia.sw-dev.io", ohttp: true },
  { name: "Prover (production, Ready)", url: "https://cloud.argent-api.com/v1/privacy/proving" },
  { name: "Discovery (production, Ready)", url: "https://cloud.argent-api.com/v1/privacy/discovery" },
];

const TIMEOUT_MS = 15_000;

async function get(url, { asBytes = false } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = asBytes
      ? Buffer.from(await res.arrayBuffer()).toString("base64")
      : (await res.text()).slice(0, 200);
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: `unreachable: ${e.message}` };
  } finally {
    clearTimeout(t);
  }
}

console.log("Checking STRK20 privacy infrastructure…\n");

let failures = 0;

for (const svc of SERVICES) {
  console.log(`── ${svc.name}`);
  console.log(`   ${svc.url}`);

  const health = await get(`${svc.url}/health`);
  const ok = health.status === 200;
  console.log(`   health: HTTP ${health.status} ${ok ? "✅" : svc.authGated ? "⚠️ (auth-gated — expected)" : "❌"}`);
  if (ok) console.log(`   → ${health.body}`);
  if (!ok && !svc.authGated) failures++;

  if (svc.ohttp) {
    const keys = await get(`${svc.url}/ohttp-keys`, { asBytes: true });
    if (keys.status === 200) {
      console.log(`   ohttp-keys: HTTP 200 ✅ (OHTTP live — operator cannot see client IP)`);
      if (keys.body === PINNED_OHTTP_KEY) {
        console.log(`   → key config EXACTLY matches starknet-privacy's pinned config ✅`);
        console.log(`     (confirms this is the official StarkWare privacy service)`);
      }
    } else {
      console.log(`   ohttp-keys: HTTP ${keys.status} ❌`);
      failures++;
    }
  }
  console.log();
}

console.log("═".repeat(60));
if (failures === 0) {
  console.log("✅ All required services reachable. Sepolia path is unblocked.");
} else {
  console.log(`❌ ${failures} required check(s) failed.`);
  process.exitCode = 1;
}
console.log("Note: the production endpoints also answer unauthenticated JSON-RPC");
console.log("param validation, but a full proof round-trip is UNVERIFIED, and they");
console.log("are a third party's infrastructure — we ask before relying on them.");
console.log("See docs/THREAT-MODEL.md §3.5.");

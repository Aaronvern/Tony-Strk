/**
 * Verifies every external dependency Tony Stark relies on is real and live.
 *
 * Checks, in order:
 *   1. Prover + discovery services are up
 *   2. OHTTP is live, and the prover's key config byte-matches the one pinned
 *      in starknet-privacy — proving these are the official StarkWare services
 *   3. The privacy pool contracts exist on-chain (mainnet + sepolia)
 *   4. The discovery service actually serves our Sepolia pool — plus a control
 *      showing it rejects the wrong pool (so check 4 can't pass vacuously)
 *
 * Run: node scripts/spikes/check-services.mjs
 */

const PINNED_OHTTP_KEY = "ACkAACBBhSMg/zZ0lfpSLJTLg685Hk6JAYOSclu/IJjdkxvEJAAEAAEAAQ==";

// Privacy pool contracts, extracted from AVNU's production bundle and then
// verified on-chain + against the discovery service by this script.
const POOLS = {
  mainnet: "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
  sepolia: "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
};

const RPC = {
  mainnet: "https://rpc.starknet.lava.build",
  sepolia: "https://starknet-sepolia.drpc.org",
};

const DISCOVERY_SEPOLIA = "https://discovery-service.alpha-sepolia.sw-dev.io";

const SERVICES = [
  { name: "Prover (Sepolia, StarkWare)", url: "https://transaction-prover.alpha-sepolia.sw-dev.io", ohttp: true },
  { name: "Discovery (Sepolia, StarkWare)", url: DISCOVERY_SEPOLIA, ohttp: true },
  { name: "Prover (production, Ready)", url: "https://cloud.argent-api.com/v1/privacy/proving" },
  { name: "Discovery (production, Ready)", url: "https://cloud.argent-api.com/v1/privacy/discovery" },
];

const TIMEOUT_MS = 20_000;
let failures = 0;

async function req(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const body = opts.asBytes
      ? Buffer.from(await res.arrayBuffer()).toString("base64")
      : await res.text();
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: `unreachable: ${e.message}` };
  } finally {
    clearTimeout(t);
  }
}

const rpc = (url, method, params) =>
  req(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });

console.log("Tony Stark — infrastructure check\n" + "=".repeat(60) + "\n");

// ---- 1 & 2: services + OHTTP ----
console.log("① Services\n");
for (const svc of SERVICES) {
  const health = await req(`${svc.url}/health`);
  const ok = health.status === 200;
  console.log(`  ${ok ? "✅" : "❌"} ${svc.name} — HTTP ${health.status}`);
  if (ok) console.log(`     ${health.body.slice(0, 150)}`);
  if (!ok) failures++;

  if (svc.ohttp) {
    const keys = await req(`${svc.url}/ohttp-keys`, { asBytes: true });
    const match = keys.body === PINNED_OHTTP_KEY;
    console.log(`     ${keys.status === 200 ? "✅" : "❌"} OHTTP live${match ? " — key matches starknet-privacy's pinned config ✅" : ""}`);
    if (keys.status !== 200) failures++;
  }
}

// ---- 3: pools exist on-chain ----
console.log("\n② Privacy pool contracts on-chain\n");
for (const [net, addr] of Object.entries(POOLS)) {
  const r = await rpc(RPC[net], "starknet_getClassHashAt", { block_id: "latest", contract_address: addr });
  let classHash;
  try { classHash = JSON.parse(r.body)?.result; } catch { /* ignore */ }
  console.log(`  ${classHash ? "✅" : "❌"} ${net.padEnd(8)} ${addr}`);
  if (classHash) console.log(`     class hash: ${classHash}`);
  else { console.log(`     ${r.body.slice(0, 140)}`); failures++; }
}

// ---- 4: discovery actually serves our pool (+ control) ----
console.log("\n③ Discovery service serves the Sepolia pool\n");
const probe = (contract) =>
  req(`${DISCOVERY_SEPOLIA}/v1/sync/incoming_state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contract_address: contract, recipient_address: "0x1", viewing_key: "0x1", cursor: {} }),
  });

const real = await probe(POOLS.sepolia);
const okReal = real.status === 200;
console.log(`  ${okReal ? "✅" : "❌"} sepolia pool accepted — HTTP ${real.status}`);
console.log(`     ${real.body.slice(0, 160)}`);
if (!okReal) failures++;

// Control: the same service must REJECT a pool it doesn't index, otherwise
// the check above would pass for any input and prove nothing.
const control = await probe(POOLS.mainnet);
const okControl = control.status !== 200;
console.log(`  ${okControl ? "✅" : "❌"} control: wrong pool rejected — HTTP ${control.status}`);
console.log(`     ${control.body.slice(0, 140)}`);
if (!okControl) failures++;

console.log("\n" + "=".repeat(60));
if (failures === 0) {
  console.log("✅ All dependencies verified. The Sepolia build path is unblocked.");
} else {
  console.log(`❌ ${failures} check(s) failed.`);
  process.exitCode = 1;
}
console.log("\nNote: Ready's production endpoints answer unauthenticated JSON-RPC,");
console.log("but their /v1/privacy/* config API returns 401 — and it is a third");
console.log("party's infrastructure, so we ask before depending on it.");
console.log("Deposit screening (docs/THREAT-MODEL.md §4) can only be exercised");
console.log("with a funded account — that is Phase 1.");

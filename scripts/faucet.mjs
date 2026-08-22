/**
 * Fund a Starknet Sepolia address via the public Agent API faucet.
 * No auth — gated by proof-of-work, quotas, and cooldowns.
 *
 *   node scripts/faucet.mjs 0x<address>
 */
import { createHash } from "node:crypto";

const BASE = "https://api.faucet.starknet.io";
const userAddress = process.argv[2];

if (!userAddress?.startsWith("0x")) {
  console.error("usage: node scripts/faucet.mjs 0x<address>");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

/** Count leading zero BITS (difficulty is in bits, not hex chars). */
function leadingZeroBits(buf) {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) { bits += 8; continue; }
    bits += Math.clz32(byte) - 24; // clz32 of a byte value = 24 + its leading zeros
    break;
  }
  return bits;
}

function solve(prefix, difficulty) {
  const started = Date.now();
  for (let nonce = 0; ; nonce++) {
    const digest = createHash("sha256").update(prefix + nonce).digest();
    if (leadingZeroBits(digest) >= difficulty) {
      return { nonce: String(nonce), tries: nonce + 1, ms: Date.now() - started, hash: digest.toString("hex") };
    }
  }
}

console.log(`Funding ${userAddress}\n`);

// 1 — challenge
const ch = await api("/api/public-agent/pow/challenge", { userAddress });
// The challenge is bound to the address as the faucet normalized it (lowercase).
// Submitting the original mixed-case string fails with POW_CHALLENGE_INVALID,
// which reads like a bad nonce but is an address-casing mismatch.
const { challengeId, powInputPrefix, difficulty, userAddress: boundAddress } = ch.data ?? ch;
console.log(`① challenge   id=${challengeId}  difficulty=${difficulty} bits`);

// 2 — solve locally
const sol = solve(powInputPrefix, difficulty);
console.log(`② solved      nonce=${sol.nonce}  (${sol.tries.toLocaleString()} tries, ${sol.ms} ms)`);
console.log(`              sha256=${sol.hash.slice(0, 24)}…`);

// 3 — submit
const req = await api("/api/public-agent/faucet/request", {
  userAddress: boundAddress ?? userAddress,
  challengeId,
  nonce: sol.nonce,
});
const { requestId, pollAfterSeconds = 3 } = req.data ?? req;
console.log(`③ submitted   requestId=${requestId}`);

// 4 — poll
let wait = pollAfterSeconds;
for (let i = 0; i < 40; i++) {
  await sleep(wait * 1000);
  const st = await api(`/api/public-agent/faucet/status/${requestId}`);
  const d = st.data ?? st;
  console.log(`④ status      ${d.jobStatus}${d.txHash ? `  tx=${d.txHash}` : ""}`);
  if (d.jobStatus === "confirmed") {
    console.log(`\n✅ funded — https://sepolia.starkscan.co/tx/${d.txHash}`);
    process.exit(0);
  }
  if (d.jobStatus === "failed") {
    console.log(`\n❌ failed: ${JSON.stringify(d)}`);
    process.exit(1);
  }
  wait = d.pollAfterSeconds ?? wait;
}
console.log("\n⏱ still pending after 40 polls — check again later");

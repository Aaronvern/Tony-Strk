/**
 * Pay an HTTP 402 through the STRK20 pool, then read what was behind it.
 *
 * This is the whole product in one file: fetch a paywalled URL, read the
 * merchant's terms, settle them anonymously, come back with the receipt.
 * The merchant ends up paid and holding no idea who paid it.
 *
 *   node scripts/pay-paywall.mjs http://127.0.0.1:8788/article/agent-privacy
 *     --max 0.2       most STRK to spend on one resource (default 0.2)
 *     --deposit 5     shield 5 STRK first, if the pool balance is short
 *     --dry           stop after the dry run, spend nothing
 *
 * Needs ACCOUNT_PRIVATE_KEY, ACCOUNT_ADDRESS, AVNU_API_KEY and
 * HELPER_ADDRESS in .env — run with `node --env-file-if-exists=.env`.
 */
import { RpcProvider, Signer, constants, num } from "starknet";
import {
  IndexerDiscoveryProvider,
  ProvingServiceProofProvider,
} from "@starkware-libs/starknet-privacy-sdk";
import {
  AvnuPaymaster,
  CorePrivateTransfersProver,
  SdkWallet,
} from "@starkware-libs/starknet-privacy-client";

import {
  balanceSurplus,
  buildPaywallActions,
  parsePaymentRequired,
} from "../server/src/pay/paywall.ts";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > -1 ? process.argv[at + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const target = process.argv[2];
if (!target || target.startsWith("--")) {
  console.error("usage: node scripts/pay-paywall.mjs <url> [--max 0.2] [--deposit 5] [--dry]");
  process.exit(1);
}

const toWei = (text) => {
  const [whole, frac = ""] = String(text).split(".");
  return BigInt(whole || "0") * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
};
const fmt = (wei) => {
  const digits = wei.toString().padStart(19, "0");
  const frac = digits.slice(-18).replace(/0+$/, "");
  return `${digits.slice(0, -18)}${frac ? `.${frac}` : ""}`;
};

const RPC = process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia-rpc.publicnode.com";
const POOL = process.env.POOL_ADDRESS;
const STRK =
  process.env.STRK_TOKEN_ADDRESS ??
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ADDRESS = process.env.ACCOUNT_ADDRESS;
const PK = process.env.ACCOUNT_PRIVATE_KEY;
const PASSPHRASE = process.env.PRIVACY_PASSPHRASE ?? "tony-stark-sepolia-dev";
const API_KEY = process.env.AVNU_API_KEY;

// The payer's trust list. A 402 naming anything else is refused, because the
// invoke leg calls that contract while holding the money.
const TRUSTED = (process.env.HELPER_ADDRESS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

for (const [name, value] of [
  ["ACCOUNT_ADDRESS", ADDRESS],
  ["ACCOUNT_PRIVATE_KEY", PK],
  ["AVNU_API_KEY", API_KEY],
  ["HELPER_ADDRESS", TRUSTED[0]],
  ["POOL_ADDRESS", POOL],
]) {
  if (!value) {
    console.error(`missing ${name} — put it in .env and run with --env-file-if-exists=.env`);
    process.exit(1);
  }
}

console.log(`GET ${target}`);
const first = await fetch(target);
console.log(`  ${first.status} ${first.statusText}`);

if (first.status !== 402) {
  console.log("\nNo payment required. Body:\n");
  console.log((await first.text()).slice(0, 2000));
  process.exit(0);
}

const terms = parsePaymentRequired(await first.json(), {
  trustedAnonymizers: TRUSTED,
  maxPrice: toWei(arg("max", "0.2")),
  asset: STRK,
  requestedUrl: target,
});

console.log(`\n402 — "${terms.description}"`);
console.log(`  price      ${fmt(terms.amount)} STRK`);
console.log(`  pay to     ${terms.payTo}`);
console.log(`  through    ${terms.anonymizer}  (trusted)`);
console.log(`  resource   ${terms.resourceHash}`);

const node = new RpcProvider({ nodeUrl: RPC });
const provingBlock = (await node.getBlockNumber()) - 12;

let registry;
const wallet = new SdkWallet({
  prover: new CorePrivateTransfersProver({
    signer: new Signer(PK),
    address: ADDRESS,
    passphrase: PASSPHRASE,
    node,
    discovery: new IndexerDiscoveryProvider(
      process.env.INDEXER_URL ?? "https://discovery-service.alpha-sepolia.sw-dev.io",
      POOL,
    ),
    prover: new ProvingServiceProofProvider(
      process.env.PROVING_SERVICE_URL ?? "https://transaction-prover.alpha-sepolia.sw-dev.io",
      constants.StarknetChainId.SN_SEPOLIA,
      { nodeUrl: RPC, poolAddress: POOL, blockIdentifier: { block_number: provingBlock } },
    ),
    poolContractAddress: POOL,
    shadowAccountAnonymizerAddress: "0x0",
    storage: {
      loadRegistry: async () => registry,
      saveRegistry: async (value) => { registry = value; },
    },
  }),
  paymaster: new AvnuPaymaster({
    url: process.env.PAYMASTER_URL ?? "https://sepolia.paymaster.avnu.fi",
    apiKey: API_KEY,
    feeMode: { mode: "sponsored_private", poolFeeToken: STRK },
  }),
  poolContractAddress: POOL,
  signer: new Signer(PK),
  userAddress: ADDRESS,
});

const deposit = arg("deposit");
if (deposit) {
  console.log(`\nShielding ${deposit} STRK first…`);
  const { transaction_hash } = await wallet.strk20InvokeTransaction([
    { type: "deposit", token: STRK, amount: num.toHex(toWei(deposit)) },
  ]);
  console.log(`  ${transaction_hash}`);
  const receipt = await node.waitForTransaction(transaction_hash);
  console.log(`  landed in block ${receipt.block_number}`);
  if (receipt.block_number > provingBlock) {
    const behind = receipt.block_number - provingBlock;
    console.log(
      `\n⚠️  those notes are ${behind} block(s) newer than the proving block ${provingBlock}.\n` +
        `   They do not exist in the proving state yet — wait ~${Math.ceil((behind * 30) / 60)} min` +
        " and run again without --deposit.",
    );
    process.exit(1);
  }
}

console.log("\nDry run (proves the shape; the pool no-ops invoke client-side)…");
const actions = await balanceSurplus(
  buildPaywallActions(terms),
  (candidate) => wallet.strk20PrepareInvoke(candidate, true),
  ADDRESS,
  STRK,
);
console.log(`  accepted — ${actions.length} legs`);

if (flag("dry")) {
  console.log("\n--dry, so stopping here. Nothing was spent.");
  process.exit(0);
}

console.log("\nSettling…");
const { transaction_hash } = await wallet.strk20InvokeTransaction(actions);
console.log(`  ${transaction_hash}`);
console.log(`  https://sepolia.voyager.online/tx/${transaction_hash}`);
const receipt = await node.waitForTransaction(transaction_hash);
console.log(`  ${receipt.execution_status} in block ${receipt.block_number}`);

console.log(`\nGET ${target} with the receipt`);
const paid = await fetch(target, { headers: { "X-Payment": transaction_hash } });
console.log(`  ${paid.status} ${paid.statusText}`);
const token = paid.headers.get("x-access-token");
if (token) console.log(`  access token ${token}`);

const html = await paid.text();
console.log("\n" + html.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1400));

/**
 * Submit a proven STRK20 action through the AVNU paymaster.
 *
 * Proving and submitting are separate problems (docs/SPIKE-RESULTS.md §20).
 * The SDK proves; only a paymaster or a STRK20-aware wallet can attach the
 * proof to an `apply_actions` transaction. This wires the paymaster path,
 * which is how a *server-side* agent transacts at all.
 *
 *   ACCOUNT_PRIVATE_KEY=0x... node scripts/submit-via-paymaster.mjs
 */
import { RpcProvider, Signer, constants } from "starknet";
import { IndexerDiscoveryProvider, ProvingServiceProofProvider } from "@starkware-libs/starknet-privacy-sdk";
import { CorePrivateTransfersProver, AvnuPaymaster, SdkWallet } from "@starkware-libs/starknet-privacy-client";

const RPC = process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia.drpc.org";
const PROVING_URL = process.env.PROVING_SERVICE_URL ?? "https://transaction-prover.alpha-sepolia.sw-dev.io";
const INDEXER_URL = process.env.INDEXER_URL ?? "https://discovery-service.alpha-sepolia.sw-dev.io";
const PAYMASTER_URL = process.env.PAYMASTER_URL ?? "https://sepolia.paymaster.avnu.fi";
const API_KEY = process.env.AVNU_API_KEY;
const POOL = process.env.POOL_ADDRESS ?? "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ADDRESS = process.env.ACCOUNT_ADDRESS ?? "0x077F1679D6B758f63b33Ac3eba46c33b0218185156efc9041cB4ba1A2162FC87";
const PK = process.env.ACCOUNT_PRIVATE_KEY;
// The viewing key is derived from this inside the prover, so we never handle it.
const PASSPHRASE = process.env.PRIVACY_PASSPHRASE ?? "tony-stark-sepolia-dev";

if (!PK) { console.error("set ACCOUNT_PRIVATE_KEY (testnet only)"); process.exit(1); }

// The paymaster's fee is paid by *withdrawing from the pool*, and on Sepolia it
// quotes a flat 2 STRK. A first deposit must therefore exceed the fee, since the
// deposit and the fee-withdraw settle in the same proven action set — otherwise
// there is nothing in the pool to pay from. Deposit 3, keep ~1 shielded.
const DEPOSIT = 3n * 10n ** 18n;

const node = new RpcProvider({ nodeUrl: RPC });

// The sequencer rejects a proof whose base block is too recent — it must be at
// least ~10 blocks behind the block that finally includes the transaction. Prove
// against latest-12 to leave headroom for proving time and inclusion delay.
const provingBlock = (await node.getBlockNumber()) - 12;
console.log(`proving against block ${provingBlock} (latest - 12)`);

// Registry lives in memory for this run; production persists it (node:sqlite).
let registry = undefined;
const storage = {
  loadRegistry: async () => registry,
  saveRegistry: async (r) => { registry = r; },
};

const prover = new CorePrivateTransfersProver({
  signer: new Signer(PK),
  address: ADDRESS,
  passphrase: PASSPHRASE,
  node,
  discovery: new IndexerDiscoveryProvider(INDEXER_URL, POOL),
  prover: new ProvingServiceProofProvider(PROVING_URL, constants.StarknetChainId.SN_SEPOLIA, {
    nodeUrl: RPC,
    poolAddress: POOL,
    blockIdentifier: { block_number: provingBlock },
  }),
  poolContractAddress: POOL,
  shadowAccountAnonymizerAddress: "0x0", // unused — shadow accounts are roadmap
  storage,
});

const paymaster = new AvnuPaymaster({
  url: PAYMASTER_URL,
  apiKey: API_KEY,
  // Pays the fee from *inside* the pool, so settling doesn't expose the payer.
  feeMode: { mode: "sponsored_private", poolFeeToken: STRK },
});

const wallet = new SdkWallet({
  prover,
  paymaster,
  poolContractAddress: POOL,
  signer: new Signer(PK),
  userAddress: ADDRESS,
});

console.log(`paymaster ${PAYMASTER_URL}${API_KEY ? " (with API key)" : " (no API key)"}`);
console.log(`pool      ${POOL}\n`);

try {
  console.log("Shielding 3 STRK — deposit exercises mandatory sanctions screening…");
  const res = await wallet.strk20InvokeTransaction([
    { type: "deposit", token: STRK, amount: `0x${DEPOSIT.toString(16)}` },
  ]);

  console.log(`\n✅ SUBMITTED — tx ${res.transaction_hash}`);
  console.log("   screening passed, funds are shielded");
  console.log(`   https://sepolia.starkscan.co/tx/${res.transaction_hash}`);
  await node.waitForTransaction(res.transaction_hash);
  console.log("   accepted on-chain ✅");
} catch (e) {
  const msg = String(e?.message ?? e);
  console.log(`\n❌ ${msg.slice(0, 900)}`);
  if (/\b10000\b/.test(msg)) console.log("\n→ JSON-RPC error 10000 = sanctions screening rejected the deposit.");
  if (/api.?key|401|403|unauthor/i.test(msg)) console.log("\n→ looks like the paymaster wants an API key: set AVNU_API_KEY.");
  process.exit(1);
}

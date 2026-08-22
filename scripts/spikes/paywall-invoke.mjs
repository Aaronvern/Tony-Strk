/**
 * SPIKE — drive one real paywall payment through the STRK20 pool on Sepolia.
 *
 * Throwaway until it works. It answers three questions that no unit test can:
 *
 *   1. Does the pool call `privacy_invoke` with our calldata ordering, including
 *      the `Option` variant index?
 *   2. Does the change land in the open note, and is `PaywallPaid` readable?
 *   3. Does an *unregistered* helper returning a deposit demand a screening
 *      attestation? (`OpenNoteScreeningPolicy::Required` is the default and only
 *      the pool's app governor can change it.)
 *
 * Note: `strk20PrepareInvoke(actions, true)` proves without submitting, but the
 * pool's client-side pass no-ops `Invoke` — a dry run validates the action shape
 * and never calls the helper. Only a real submit tests the contract.
 *
 *   ACCOUNT_PRIVATE_KEY=0x... HELPER_ADDRESS=0x... node scripts/spikes/paywall-invoke.mjs
 *   ... --deposit 5     shield 5 STRK first, if the pool balance is short
 */
import { RpcProvider, Signer, constants, hash, num } from "starknet";
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
const PASSPHRASE = process.env.PRIVACY_PASSPHRASE ?? "tony-stark-sepolia-dev";
const HELPER = process.env.HELPER_ADDRESS;

// A stand-in merchant. Any felt is a valid ERC-20 balance key, so it does not
// need to be a deployed account for this probe.
const MERCHANT = process.env.MERCHANT_ADDRESS ?? "0x4d45524348414e54";
const RESOURCE_HASH = num.toHex(BigInt("0x" + Buffer.from("article/42").toString("hex")));

// Kept small on purpose: every pool transaction also withdraws the flat 2 STRK
// Sepolia fee, so the shielded headroom for the payment itself is thin.
const PRICE = BigInt(process.env.SPIKE_PRICE_WEI ?? 5n * 10n ** 16n);   // 0.05 STRK
const FUNDING = BigInt(process.env.SPIKE_FUNDING_WEI ?? 1n * 10n ** 17n); // 0.1 STRK -> 0.05 change

const depositArg = process.argv.indexOf("--deposit");
const DEPOSIT = depositArg > -1 ? BigInt(process.argv[depositArg + 1]) * 10n ** 18n : 0n;

if (!PK) { console.error("set ACCOUNT_PRIVATE_KEY (testnet only)"); process.exit(1); }
if (!HELPER) { console.error("set HELPER_ADDRESS (deploy the helper first)"); process.exit(1); }
const FUNDING_TX = process.env.FUNDING_TX; // optional: assert its notes have matured

const node = new RpcProvider({ nodeUrl: RPC });
const provingBlock = (await node.getBlockNumber()) - 12;
console.log(`proving against block ${provingBlock} (latest - 12)`);

/**
 * Note maturity. The proof is built against `latest - 12`, but a dry run
 * simulates against live state — so a note created in the last 12 blocks makes
 * the dry run pass and the real submission revert with NOTE_NOT_FOUND, raised
 * by `use_note` inside the prover's virtual block. It reads like a missing
 * note and is a timing problem. Cost an hour once; worth the check.
 */
async function assertNotesAreMature(txHash) {
  if (!txHash) return;
  const receipt = await node.getTransactionReceipt(txHash);
  const landed = receipt.block_number;
  if (landed > provingBlock) {
    const wait = landed - provingBlock;
    console.log(`\n⚠️  the funding tx landed in block ${landed}, ${wait} block(s) after the`);
    console.log(`   proving block ${provingBlock}. Its notes do not exist in the proving`);
    console.log(`   state yet — wait ~${Math.ceil((wait * 30) / 60)} min and re-run.`);
    process.exit(1);
  }
}

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
  shadowAccountAnonymizerAddress: "0x0",
  storage,
});

const paymaster = new AvnuPaymaster({
  url: PAYMASTER_URL,
  apiKey: API_KEY,
  feeMode: { mode: "sponsored_private", poolFeeToken: STRK },
});

const wallet = new SdkWallet({
  prover, paymaster, poolContractAddress: POOL,
  signer: new Signer(PK), userAddress: ADDRESS,
});

const balanceOf = async (who) => {
  const [lo, hi] = await node.callContract({
    contractAddress: STRK, entrypoint: "balanceOf", calldata: [who],
  });
  return BigInt(lo) + (BigInt(hi) << 128n);
};

console.log(`helper    ${HELPER}`);
console.log(`merchant  ${MERCHANT}`);
console.log(`price     ${PRICE} wei   funding ${FUNDING} wei\n`);

if (DEPOSIT > 0n) {
  console.log(`Shielding ${DEPOSIT / 10n ** 18n} STRK first…`);
  const dep = await wallet.strk20InvokeTransaction([
    { type: "deposit", token: STRK, amount: num.toHex(DEPOSIT) },
  ]);
  console.log(`  deposit tx ${dep.transaction_hash}`);
  console.log(`  voyager    https://sepolia.voyager.online/tx/${dep.transaction_hash}`);
  await node.waitForTransaction(dep.transaction_hash);
  console.log("  shielded ✅\n");
  await assertNotesAreMature(dep.transaction_hash);
}

// The three legs. Calldata order must match `privacy_invoke`'s signature:
//   merchant, token, price: u128, resource_hash: felt252, change_note_id: Option<felt252>
// `Option::Some` is variant index 0 (Some is declared first in core), so the
// last argument is two felts: the variant index, then the note id.
const actions = [
  { type: "withdraw", token: STRK, amount: num.toHex(FUNDING), recipient: HELPER },
  { type: "transfer", token: STRK, amount: "OPEN", recipient: ADDRESS },
  {
    type: "invoke",
    contract: HELPER,
    calldata: [MERCHANT, STRK, num.toHex(PRICE), RESOURCE_HASH, "0x0", "${openNoteIds[0]}"],
  },
];

await assertNotesAreMature(FUNDING_TX);

const merchantBefore = await balanceOf(MERCHANT);

/**
 * Note selection is "naive": it picks whole notes to cover the spend, so a
 * 0.1 STRK withdraw funded by a 1 STRK note leaves 0.9 unaccounted and the
 * builder refuses with "Surplus of N found ... but no surplus action found".
 *
 * The core SDK has `surplusTo()` for this, but the STRK20 action vocabulary
 * that `strk20InvokeTransaction` speaks has no surplus action — so the sink
 * has to be an explicit private transfer back to the payer. A real wallet
 * handles this itself; the SdkWallet path does not.
 *
 * The exact amount depends on which notes got selected, so read it off the
 * rejection and add the matching transfer.
 */
const SURPLUS = /Surplus of (\d+) found/;

async function dryRunWithSurplusSink(base) {
  let attempt = [...base];
  for (let i = 0; i < 3; i++) {
    try {
      await wallet.strk20PrepareInvoke(attempt, true);
      return attempt;
    } catch (e) {
      const m = SURPLUS.exec(String(e?.message ?? e));
      if (!m) throw e;
      const surplus = BigInt(m[1]);
      console.log(`  surplus ${surplus} wei — adding a private transfer back to self`);
      // Insert before the invoke so the pool sees it as a plain balancing leg.
      attempt = [
        ...attempt.slice(0, -1),
        { type: "transfer", token: STRK, amount: num.toHex(surplus), recipient: ADDRESS },
        attempt[attempt.length - 1],
      ];
    }
  }
  throw new Error("could not balance the surplus in 3 attempts");
}

console.log("Dry run (proves the action shape; does NOT call the helper)…");
let balanced;
try {
  balanced = await dryRunWithSurplusSink(actions);
  console.log("  action shape accepted ✅\n");
} catch (e) {
  console.log(`  ❌ dry run rejected: ${String(e?.message ?? e).slice(0, 600)}\n`);
  process.exit(1);
}

console.log("Submitting for real…");
let tx;
try {
  tx = await wallet.strk20InvokeTransaction(balanced);
} catch (e) {
  const msg = String(e?.message ?? e);
  console.log(`\n❌ ${msg.slice(0, 1200)}`);
  if (/SCREENING_REQUIRED|screening/i.test(msg)) {
    console.log("\n→ ANSWER TO Q3: the unregistered helper's deposit DOES require a screening");
    console.log("  attestation. The Some(note) change path needs the app governor to set this");
    console.log("  helper Exempt/Delegated. The None (exact payment) path returns no deposits.");
  }
  if (/UNDEPOSITED_OPEN_NOTES/i.test(msg)) {
    console.log("\n→ the open note was not credited — the invoke returned an empty span.");
  }
  process.exit(1);
}

console.log(`\n✅ SUBMITTED — tx ${tx.transaction_hash}`);
console.log(`   voyager   https://sepolia.voyager.online/tx/${tx.transaction_hash}`);
console.log(`   starkscan https://sepolia.starkscan.co/tx/${tx.transaction_hash}`);
const receipt = await node.waitForTransaction(tx.transaction_hash);

const paidSelector = hash.getSelectorFromName("PaywallPaid");
const events = (receipt.events ?? []).filter(
  (e) => BigInt(e.from_address) === BigInt(HELPER) && BigInt(e.keys?.[0] ?? 0) === BigInt(paidSelector)
);

const merchantAfter = await balanceOf(MERCHANT);

console.log("\n--- findings ---");
console.log(`Q1 pool called privacy_invoke:  ${events.length > 0 ? "YES ✅" : "NO ❌ (no receipt event)"}`);
console.log(`Q2 merchant paid exactly price: ${merchantAfter - merchantBefore === PRICE ? "YES ✅" : `NO ❌ (delta ${merchantAfter - merchantBefore})`}`);
console.log(`Q3 screening blocked the change path: NO ✅ (it settled)`);
if (events.length > 0) {
  const [, merchantKey, resourceKey] = events[0].keys;
  console.log(`\nreceipt: merchant=${merchantKey} resource_hash=${resourceKey} data=${JSON.stringify(events[0].data)}`);
}
console.log(`\nhelper balance left behind: ${await balanceOf(HELPER)} wei (should be 0)`);

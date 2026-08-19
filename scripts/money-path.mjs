/**
 * The money path, end to end, on Sepolia.
 *
 *   register viewing key  →  shield a deposit  →  private transfer
 *
 * The deposit step is the one that matters most: sanctions screening runs
 * *inside* the prover and cannot be exercised from outside, so this is the
 * first time we learn whether it accepts us. A rejection surfaces as
 * JSON-RPC error 10000.
 *
 *   ACCOUNT_PRIVATE_KEY=0x... node scripts/money-path.mjs
 */
import { Account, RpcProvider, constants, hash, shortString } from "starknet";
import { createPrivateTransfers, MAX_VIEWING_KEY } from "@starkware-libs/starknet-privacy-sdk";

const RPC = process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia.drpc.org";
const PROVING_URL = process.env.PROVING_SERVICE_URL ?? "https://transaction-prover.alpha-sepolia.sw-dev.io";
const INDEXER_URL = process.env.INDEXER_URL ?? "https://discovery-service.alpha-sepolia.sw-dev.io";
const POOL = process.env.POOL_ADDRESS ?? "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const ADDRESS = process.env.ACCOUNT_ADDRESS ?? "0x077F1679D6B758f63b33Ac3eba46c33b0218185156efc9041cB4ba1A2162FC87";
const PK = process.env.ACCOUNT_PRIVATE_KEY;

if (!PK) { console.error("set ACCOUNT_PRIVATE_KEY (testnet only)"); process.exit(1); }

const DEPOSIT = 10n ** 18n;          // 1 STRK
const SEND    = 4n * 10n ** 17n;     // 0.4 STRK

const provider = new RpcProvider({ nodeUrl: RPC });
const account = new Account({ provider, address: ADDRESS, signer: PK });

// Deterministic so it can be re-derived; a real wallet manages this for the user.
// Must land in [1, MAX_VIEWING_KEY] where MAX_VIEWING_KEY is *half* the STARK
// curve order — a raw Poseidon digest overflows that and the pool rejects it
// with PRIVATE_KEY_NOT_CANONICAL, so clamp into range.
const vkRaw = BigInt(hash.computePoseidonHashOnElements([PK, shortString.encodeShortString("tonystark")]));
const viewingKey = "0x" + ((vkRaw % (MAX_VIEWING_KEY - 1n)) + 1n).toString(16);

const transfers = createPrivateTransfers({
  account,
  viewingKeyProvider: { getViewingKey: async () => viewingKey },
  provingProvider: { url: PROVING_URL, chainId: constants.StarknetChainId.SN_SEPOLIA, nodeUrl: RPC },
  discoveryProvider: { url: INDEXER_URL },
  poolContractAddress: POOL,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The prover reads finalized state and the sequencer only accepts a proof whose
 * base block is >= 10 blocks old, so every private tx must wait out that window.
 */
async function settle(label, txHash) {
  const receipt = await provider.waitForTransaction(txHash);
  const at = receipt.block_number ?? (await provider.getBlockNumber());
  console.log(`   ✅ ${label} accepted in block ${at}`);
  process.stdout.write("   waiting 10 blocks for finality");
  for (;;) {
    const latest = await provider.getBlockNumber();
    if (latest - at >= 10) { console.log(` — ok (${latest})`); return; }
    process.stdout.write(".");
    await sleep(4000);
  }
}

const step = (n, t) => console.log(`\n${n}. ${t}`);

try {
  step(1, "Register viewing key — prove the action");
  const reg = await transfers.build().register().execute();
  const { call, proof } = reg.callAndProof;
  console.log(`   ✅ prover returned a proof`);
  console.log(`      target   ${call.contractAddress}`);
  console.log(`      entry    ${call.entrypoint}`);
  console.log(`      facts    ${proof.proofFacts ? "present" : "—"}`);
  console.log(`      warnings ${reg.warnings?.length ?? 0}`);

  step(2, "Submit it on-chain");
  console.log(`   ⛔ blocked — see below.

   execute() returns { callAndProof, registry }; it proves but does NOT
   submit. Submitting means calling apply_actions on the pool with the
   proof attached to the transaction, and a plain starknet.js Account
   cannot attach it. The submission path is either:

     a) the AVNU paymaster  — apply_action (private flow), or
                              invoke_and_apply_action when a deposit is
                              involved, since the ERC-20 approve must run
                              as the user rather than the paymaster
     b) a STRK20-aware wallet — WalletAccountV6.executeWithProof

   Live sepolia paymaster: https://sepolia.paymaster.avnu.fi
   Next: wire @starkware-libs/starknet-privacy-client's SdkWallet +
   AvnuPaymaster, which implements exactly this.`);
} catch (e) {
  const msg = String(e?.message ?? e);
  console.log(`\n❌ failed: ${msg.slice(0, 700)}`);
  if (msg.includes("10000")) console.log("\n→ error 10000 = screening rejected the deposit.");
  process.exit(1);
}

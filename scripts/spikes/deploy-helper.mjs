/**
 * SPIKE — declare + deploy PaywallAnonymizer to Sepolia.
 *
 *   node scripts/spikes/deploy-helper.mjs
 *
 * Deliberately NOT sncast: `sncast account import` writes the private key in
 * plaintext to ~/.starknet_accounts/, outside the repo and outside .gitignore.
 * starknet.js signs from memory and persists nothing.
 *
 * Prints HELPER_ADDRESS for scripts/spikes/paywall-invoke.mjs.
 */
import { readFileSync } from "node:fs";
import { Account, RpcProvider, json } from "starknet";

const RPC = process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia-rpc.publicnode.com";
const ADDRESS = process.env.ACCOUNT_ADDRESS;
const PK = process.env.ACCOUNT_PRIVATE_KEY;

if (!PK || !ADDRESS) { console.error("set ACCOUNT_ADDRESS and ACCOUNT_PRIVATE_KEY"); process.exit(1); }

const ART = "contracts/target/dev";
const contract = json.parse(readFileSync(`${ART}/paywall_anonymizer_PaywallAnonymizer.contract_class.json`, "utf8"));
const casm = json.parse(readFileSync(`${ART}/paywall_anonymizer_PaywallAnonymizer.compiled_contract_class.json`, "utf8"));

const provider = new RpcProvider({ nodeUrl: RPC });
console.log(`rpc      ${RPC}  (spec ${await provider.getSpecVersion()})`);
console.log(`deployer ${ADDRESS}\n`);

const account = new Account({ provider, address: ADDRESS, signer: PK });

/**
 * starknet.js pads BOTH the gas amount and the gas price by 1.5x. On a large
 * sierra class the padded price alone pushes the required bounds past the
 * account balance, and validation rejects it with "Resources bounds ... exceed
 * balance" — which reads like an empty wallet but is a headroom problem.
 *
 * Keep the amount headroom (unused gas is not charged) and trim the price
 * padding to 1.15x over the live block price.
 */
async function affordableBounds(estimate) {
  const block = await provider.getBlockWithTxHashes("latest");
  const live = (v) => BigInt(v?.price_in_fri ?? "0x0");
  // Both fields must stay bigint. Mixing a bigint amount with a hex-string
  // price makes starknet.js concatenate them while hashing the fee field, and
  // it fails deep in poseidon with "invalid bigint=<decimal><hex>".
  const trim = (bound, price) => ({
    max_amount: BigInt(bound.max_amount),
    max_price_per_unit: (price * 115n) / 100n,
  });
  return {
    l2_gas: trim(estimate.resourceBounds.l2_gas, live(block.l2_gas_price)),
    l1_gas: trim(estimate.resourceBounds.l1_gas, live(block.l1_gas_price)),
    l1_data_gas: trim(estimate.resourceBounds.l1_data_gas, live(block.l1_data_gas_price)),
  };
}

const ceiling = (b) =>
  Object.values(b).reduce((t, r) => t + BigInt(r.max_amount) * BigInt(r.max_price_per_unit), 0n);

console.log("Estimating…");
const estimate = await account.estimateDeclareFee({ contract, casm });
const resourceBounds = await affordableBounds(estimate);
console.log(`  estimate ceiling ${(Number(estimate.overall_fee) / 1e18).toFixed(3)} STRK`);
console.log(`  trimmed  ceiling ${(Number(ceiling(resourceBounds)) / 1e18).toFixed(3)} STRK\n`);

console.log("Declaring PaywallAnonymizer…");
const declared = await account.declareIfNot({ contract, casm }, { resourceBounds });
console.log(`  class hash ${declared.class_hash}`);
if (declared.transaction_hash) {
  console.log(`  declare tx ${declared.transaction_hash}`);
  console.log(`  voyager    https://sepolia.voyager.online/tx/${declared.transaction_hash}`);
  await provider.waitForTransaction(declared.transaction_hash);
  console.log("  declared ✅");
} else {
  console.log("  already declared (reusing the class) ✅");
}

console.log("\nDeploying…");
const deployed = await account.deployContract({ classHash: declared.class_hash });
console.log(`  deploy tx  ${deployed.transaction_hash}`);
await provider.waitForTransaction(deployed.transaction_hash);
console.log("  deployed ✅");

console.log(`\nHELPER_ADDRESS=${deployed.contract_address}`);
console.log(`  voyager   https://sepolia.voyager.online/contract/${deployed.contract_address}`);
console.log(`  starkscan https://sepolia.starkscan.co/contract/${deployed.contract_address}`);
console.log(`\ndeclare tx: ${declared.transaction_hash ?? "(already declared)"}`);
console.log(`deploy  tx: ${deployed.transaction_hash}`);

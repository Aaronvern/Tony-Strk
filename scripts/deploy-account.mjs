/**
 * Deploy a counterfactual Ready/Argent v0.4.0 account on Starknet Sepolia.
 *
 * A Starknet address exists before its contract does; it must be deployed
 * before it can sign anything. The class hash and constructor shape below
 * were identified by reproducing the target address from its derivation
 * (salt = public key, calldata = [0, pubkey, 1]).
 *
 *   ACCOUNT_PRIVATE_KEY=0x... node scripts/deploy-account.mjs
 */
import { Account, RpcProvider } from "starknet";

const RPC = process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia.drpc.org";
const address = process.env.ACCOUNT_ADDRESS ??
  "0x077F1679D6B758f63b33Ac3eba46c33b0218185156efc9041cB4ba1A2162FC87";
const pubkey = process.env.ACCOUNT_PUBLIC_KEY ??
  "0xacc042ca71f11feadcb9e0019866cc6ff552594633c7dc0c426ab294809709";
const privateKey = process.env.ACCOUNT_PRIVATE_KEY;

// Ready (Argent) account v0.4.0
const CLASS_HASH = "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f";
const CONSTRUCTOR = ["0x0", pubkey, "0x1"]; // owner = Starknet signer(pubkey), guardian = none

if (!privateKey) {
  console.error("set ACCOUNT_PRIVATE_KEY (testnet key only)");
  process.exit(1);
}

const provider = new RpcProvider({ nodeUrl: RPC });

const already = await provider.getClassHashAt(address).catch(() => null);
if (already) {
  console.log(`already deployed — class ${already}`);
  process.exit(0);
}

const account = new Account({ provider, address, signer: privateKey });

console.log(`deploying ${address}`);
const res = await account.deployAccount({
  classHash: CLASS_HASH,
  constructorCalldata: CONSTRUCTOR,
  addressSalt: pubkey,
  contractAddress: address,
});

console.log(`tx: ${res.transaction_hash}`);
console.log("waiting for acceptance…");
await provider.waitForTransaction(res.transaction_hash);

const classHash = await provider.getClassHashAt(address);
console.log(`✅ deployed — class ${classHash}`);
console.log(`https://sepolia.starkscan.co/tx/${res.transaction_hash}`);

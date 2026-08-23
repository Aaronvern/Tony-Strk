import { createKeychainStore } from "../server/src/pay/keychain.ts";
import { createPaymasterKeyStore } from "../server/src/pay/keychain.ts";
import { createWalletManager } from "../server/src/pay/wallet-manager.ts";

const manager = createWalletManager({
  store: createKeychainStore(),
  paymaster: createPaymasterKeyStore(),
  rpcUrl: process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia.drpc.org",
  provingUrl:
    process.env.PROVING_SERVICE_URL ?? "https://transaction-prover.alpha-sepolia.sw-dev.io",
  indexerUrl:
    process.env.INDEXER_URL ?? "https://discovery-service.alpha-sepolia.sw-dev.io",
  paymasterUrl: process.env.PAYMASTER_URL ?? "https://sepolia.paymaster.avnu.fi",
  pool:
    process.env.POOL_ADDRESS ??
    "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91",
  token:
    process.env.STRK_TOKEN_ADDRESS ??
    "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  chainId: "SN_SEPOLIA",
  ohttpEnabled: false,
});

const wallet = await manager.create();
console.log(`Fund this Sepolia account: ${wallet.address}`);
console.log("The private key stays in the macOS Keychain.");
console.log("After funding, call wallet_deploy through the local MCP server.");

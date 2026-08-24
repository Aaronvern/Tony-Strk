import { constants } from "starknet";

import { createApp } from "./app.ts";
import { createTorFetch } from "./tor/tor-fetch.ts";
import { createKeychainStore, createPaymasterKeyStore } from "./pay/keychain.ts";
import {
  createEnvPaymasterStore,
  createEnvWalletStore,
  envWalletConfigured,
} from "./pay/env-wallet.ts";
import { createWalletManager } from "./pay/wallet-manager.ts";
import { toWei } from "./pay/amount.ts";

// Routes through the SOCKS circuit by replacing the connector underneath
// undici. Node's global fetch has no SOCKS support and would silently ignore
// a proxy option, making a direct request instead.
const torFetch = createTorFetch();

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

// Binding beyond localhost turns off the SDK's automatic DNS rebinding
// protection, so the deployment has to say which hostnames it answers to.
const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const POOL =
  process.env.POOL_ADDRESS ??
  "0x254a6b2997ef52e9f830ce1f543f6b29768295e8d17e2267d672c552cfe0d91";
const TOKEN =
  process.env.STRK_TOKEN_ADDRESS ??
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const network = process.env.NETWORK ?? "sepolia";

// The Keychain is the right default and exists only on macOS. Where the
// environment names a key instead, use it — and the env store says loudly that
// it is the weaker option.
const fromEnv = envWalletConfigured(process.env);

const wallet = createWalletManager({
  store: fromEnv ? createEnvWalletStore(process.env) : createKeychainStore(),
  paymaster: fromEnv ? createEnvPaymasterStore(process.env) : createPaymasterKeyStore(),
  rpcUrl: process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia.drpc.org",
  provingUrl:
    process.env.PROVING_SERVICE_URL ??
    "https://transaction-prover.alpha-sepolia.sw-dev.io",
  indexerUrl:
    process.env.INDEXER_URL ??
    "https://discovery-service.alpha-sepolia.sw-dev.io",
  paymasterUrl: process.env.PAYMASTER_URL ?? "https://sepolia.paymaster.avnu.fi",
  pool: POOL,
  token: TOKEN,
  // The felt, not the name. The SDK hashes this into the proof request, so the
  // string "SN_SEPOLIA" fails with "Cannot convert SN_SEPOLIA to a BigInt" —
  // and only at spend time, since every test drives a fake wallet.
  chainId:
    network === "mainnet"
      ? constants.StarknetChainId.SN_MAIN
      : constants.StarknetChainId.SN_SEPOLIA,
  // Off until real relay, gateway and key-config values exist: encryption
  // without an independently operated relay is confidentiality, not anonymity.
  // Opt in explicitly once they do.
  ohttpEnabled: process.env.OHTTP_ENABLED === "true",
  ohttpProverRelayUrl: process.env.OHTTP_PROVER_RELAY_URL,
  ohttpDiscoveryRelayUrl: process.env.OHTTP_DISCOVERY_RELAY_URL,
  ohttpProverKeyConfig: process.env.OHTTP_PROVER_KEY_CONFIG,
  ohttpDiscoveryKeyConfig: process.env.OHTTP_DISCOVERY_KEY_CONFIG,
  ohttpRelayUrl: process.env.OHTTP_RELAY_URL,
});

const payDeps = {
  getWallet: () => wallet.getPayWallet(),
  token: TOKEN,
  explorerBase:
    network === "mainnet" ? "https://starkscan.co" : "https://sepolia.starkscan.co",
};

// Helper contracts whose 402s this wallet will settle. The `invoke` leg hands
// the money to whatever contract the merchant named, so an unlisted one is
// refused outright — an empty list disables paying paywalls entirely, which is
// the right default for a deployment that has not chosen who to trust.
const trustedAnonymizers = (process.env.PAYWALL_ANONYMIZER_ADDRESS ?? process.env.HELPER_ADDRESS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

// Most this wallet will spend on a single resource without being asked.
const maxPrice = toWei(process.env.PAYWALL_MAX_PRICE ?? "0.5");

const app = createApp(
  {
    torProxy: process.env.TOR_SOCKS_PROXY ?? "",
    fetchImpl: torFetch,
    wallet,
    pay: payDeps,
    settle: trustedAnonymizers.length
      ? {
          getWallet: () => wallet.getPayWallet(),
          getPayerAddress: () => wallet.status().then((s) => s.address),
          trustedAnonymizers,
          maxPrice,
          asset: TOKEN,
          explorerBase: payDeps.explorerBase,
        }
      : undefined,
  },
  { host, allowedHosts },
);

app.listen(port, host, () => {
  console.log(`Tony Strk MCP server on http://${host}:${port}/mcp`);
  console.log(
    fromEnv
      ? `wallet: ${process.env.ACCOUNT_ADDRESS} from the environment. Call wallet_status before payment.`
      : "wallet: macOS Keychain. Call wallet_status before payment.",
  );
  console.log(
    trustedAnonymizers.length
      ? `pay_paywall: on, trusting ${trustedAnonymizers.length} helper(s), ceiling ${maxPrice} wei`
      : "pay_paywall: off - set PAYWALL_ANONYMIZER_ADDRESS to name a helper you trust.",
  );
  console.log(
    process.env.TOR_SOCKS_PROXY
      ? `Tor proxy configured: ${process.env.TOR_SOCKS_PROXY}`
      : "No Tor proxy configured - browse will refuse, by design.",
  );
});

import { createApp } from "./app.ts";
import { createTorFetch } from "./tor/tor-fetch.ts";
import { createWallet } from "./pay/wallet.ts";

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

const wallet = await createWallet({
  privateKey: process.env.ACCOUNT_PRIVATE_KEY,
  address: process.env.ACCOUNT_ADDRESS,
  rpcUrl: process.env.STARKNET_RPC_URL ?? "https://starknet-sepolia.drpc.org",
  provingUrl:
    process.env.PROVING_SERVICE_URL ??
    "https://transaction-prover.alpha-sepolia.sw-dev.io",
  indexerUrl:
    process.env.INDEXER_URL ??
    "https://discovery-service.alpha-sepolia.sw-dev.io",
  paymasterUrl: process.env.PAYMASTER_URL ?? "https://sepolia.paymaster.avnu.fi",
  avnuApiKey: process.env.AVNU_API_KEY,
  pool: POOL,
  token: TOKEN,
  passphrase: process.env.PRIVACY_PASSPHRASE ?? "tony-strk-dev",
  chainId: network === "mainnet" ? "SN_MAIN" : "SN_SEPOLIA",
  ohttpEnabled: process.env.OHTTP_ENABLED !== "false",
  ohttpRelayUrl: process.env.OHTTP_RELAY_URL,
});

const app = createApp(
  {
    torProxy: process.env.TOR_SOCKS_PROXY ?? "",
    fetchImpl: torFetch,
    pay: {
      wallet,
      token: TOKEN,
      explorerBase:
        network === "mainnet"
          ? "https://starkscan.co"
          : "https://sepolia.starkscan.co",
    },
  },
  { host, allowedHosts },
);

app.listen(port, host, () => {
  console.log(`Tony Strk MCP server on http://${host}:${port}/mcp`);
  console.log(wallet ? "pay: enabled (spending key present)" : "pay: disabled - no spending key, pay will refuse.");
  console.log(
    process.env.TOR_SOCKS_PROXY
      ? `Tor proxy configured: ${process.env.TOR_SOCKS_PROXY}`
      : "No Tor proxy configured - browse will refuse, by design.",
  );
});

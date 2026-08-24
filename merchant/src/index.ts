import { RpcProvider } from "starknet";

import { createMerchantApp } from "./app.ts";

const port = Number(process.env.MERCHANT_PORT ?? 8788);
const host = process.env.MERCHANT_HOST ?? "127.0.0.1";
const network = process.env.NETWORK ?? "sepolia";

const rpcUrl =
  process.env.STARKNET_RPC_URL ??
  (network === "mainnet"
    ? "https://rpc.starknet.lava.build"
    : "https://starknet-sepolia-rpc.publicnode.com");

// The Sepolia deployment of contracts/src/paywall_anonymizer.cairo. A merchant
// only ever trusts receipts from a helper it named itself: any contract can
// emit an event called PaywallPaid.
const anonymizer =
  process.env.PAYWALL_ANONYMIZER_ADDRESS ??
  "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";

// Short string "MERCHANT", matching the spike that settled the first payment.
// A real merchant sets this to an address it controls.
const payTo = process.env.MERCHANT_ADDRESS ?? "0x4d45524348414e54";

const asset =
  process.env.STRK_TOKEN_ADDRESS ??
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const provider = new RpcProvider({ nodeUrl: rpcUrl });

const app = createMerchantApp({
  payTo,
  anonymizer,
  asset,
  network: network === "mainnet" ? "starknet-mainnet" : "starknet-sepolia",
  fetchReceipt: (txHash) => provider.getTransactionReceipt(txHash),
  explorerBase:
    network === "mainnet" ? "https://voyager.online" : "https://sepolia.voyager.online",
});

app.listen(port, host, () => {
  console.log(`Ledger & Lantern (paywalled merchant) on http://${host}:${port}`);
  console.log(`  paid to    ${payTo}`);
  console.log(`  receipts   ${anonymizer} on ${network}`);
});

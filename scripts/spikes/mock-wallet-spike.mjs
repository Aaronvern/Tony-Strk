/**
 * SPIKE B: Can a HEADLESS Node process drive the STRK20 privacy API,
 * with no browser and no window.starknet?
 *
 * We implement WalletWithStarknetFeatures ourselves (a plain object whose
 * entire Starknet surface is one `request()` fn) and hand it to WalletAccountV6.
 * If starknet.js happily calls our mock, the "headless" path is proven and we
 * learn the exact wire protocol our real wallet-adapter must speak.
 */
import { WalletAccountV6, RpcProvider, constants } from "starknet";

const ADDRESS = "0x0431dbb5cb84bb1f4a6b6a3f2c33c22c11b7d17b0e13b1a1ba3f1f3b8ee0c5b1";
const STRK = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

const seen = [];

function makeMockWallet() {
  // The ENTIRE Starknet wallet API is this one function.
  const request = async (call) => {
    const { type, params } = call;
    seen.push(type);
    console.log(`  → wallet RPC: ${type}`);
    if (params) console.log(`      params: ${JSON.stringify(params).slice(0, 240)}`);

    switch (type) {
      case "wallet_requestAccounts":
        return [ADDRESS];
      case "wallet_requestChainId":
        return constants.StarknetChainId.SN_SEPOLIA;
      case "wallet_supportedSpecs":
      case "wallet_supportedWalletApi":
        return ["0.10.4"];
      case "wallet_getPermissions":
        return ["accounts"];

      // ---- the STRK20 privacy surface ----
      case "wallet_strk20Balances":
        return [{ token: STRK, amount: "0x2386f26fc10000" }];
      case "wallet_strk20ShadowAccountCommitment":
        return "0x5f2ea1c9b3d84f7e2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f";
      case "wallet_strk20PrepareInvoke":
        return {
          call: { contract_address: "0x52107fad", entry_point: "apply_actions", calldata: ["0x1"] },
          proof: { program_variant: "VIRTUAL_SNOS", base_block: "0x64", facts: ["0xdeadbeef"] },
        };
      case "wallet_strk20InvokeTransaction":
        return { transaction_hash: "0x6f7d1c2b3a495867" };
      case "wallet_addInvokeTransaction":
        return { transaction_hash: "0x6f7d1c2b3a495867" };
      default:
        throw new Error(`mock wallet: unhandled ${type}`);
    }
  };

  return {
    version: "1.0.0",
    name: "TonyStarkHeadlessWallet",
    icon: "data:image/svg+xml;base64,PHN2Zy8+",
    chains: ["starknet:0x534e5f5345504f4c4941"],
    accounts: [],
    features: {
      "starknet:walletApi": { version: "1.0.0", request, walletVersion: "1.0.0", id: "tony-mock" },
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [] }) },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
      "standard:events": { version: "1.0.0", on: () => () => {} },
    },
  };
}

const provider = new RpcProvider({ nodeUrl: "https://rpc.starknet.lava.build" });
const account = new WalletAccountV6({
  provider,
  walletProvider: makeMockWallet(),
  address: ADDRESS,
});

console.log("✓ WalletAccountV6 constructed headlessly (no browser, no window.starknet)\n");

const run = async (label, fn) => {
  console.log(`── ${label}`);
  try {
    const r = await fn();
    console.log(`  ✅ ${label} → ${JSON.stringify(r).slice(0, 200)}\n`);
  } catch (e) {
    console.log(`  ⚠️  ${label} threw: ${String(e.message).slice(0, 220)}\n`);
  }
};

await run("strk20Balances (private balance in pool)", () => account.strk20Balances([STRK]));

await run("strk20ShadowAccountCommitment (unlinkable per-dapp identity)", () =>
  account.strk20ShadowAccountCommitment("tonyStark", "0x0"),
);

await run("strk20PrepareInvoke (build call + SNIP-36 ZK proof)", () =>
  account.strk20PrepareInvoke([
    { type: "transfer", token: STRK, recipient: ADDRESS, amount: "0x2386f26fc10000" },
  ]),
);

await run("strk20InvokeTransaction (atomic submit)", () =>
  account.strk20InvokeTransaction([
    { type: "deposit", token: STRK, amount: "0x2386f26fc10000" },
  ]),
);

console.log("═".repeat(64));
console.log("RPC methods starknet.js actually invoked on our wallet:");
[...new Set(seen)].forEach((m) => console.log("  •", m));
console.log("═".repeat(64));

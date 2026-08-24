import type { PayWallet } from "./pay.ts";
import { resolveOhttp } from "./ohttp.ts";

export interface WalletEnv {
  privateKey?: string;
  address?: string;
  rpcUrl: string;
  provingUrl: string;
  indexerUrl: string;
  paymasterUrl: string;
  avnuApiKey?: string;
  pool: string;
  token: string;
  passphrase: string;
  chainId: string;
  ohttpEnabled: boolean;
  /** Relay fronting the proving gateway. */
  ohttpProverRelayUrl?: string;
  /** Relay fronting the discovery gateway. */
  ohttpDiscoveryRelayUrl?: string;
  /** Pinned key-config bytes (hex) so `/ohttp-keys` is never fetched. */
  ohttpProverKeyConfig?: string;
  ohttpDiscoveryKeyConfig?: string;
  /** Deprecated: one relay cannot correctly front both gateways. */
  ohttpRelayUrl?: string;
}

/**
 * Build a wallet that can spend from the pool, or return null.
 *
 * Null is the normal hosted case: no spending key, so `pay` refuses. The
 * privacy SDK is imported dynamically because it is built from source into a
 * gitignored `vendor/`, so it is absent from a clean checkout and from the
 * container image. A missing SDK must degrade to "cannot pay" rather than
 * stopping the server from starting at all.
 */
export async function createWallet(env: WalletEnv): Promise<PayWallet | null> {
  if (!env.privateKey || !env.address) return null;

  let starknet, sdk, client;
  try {
    starknet = await import("starknet");
    sdk = await import("@starkware-libs/starknet-privacy-sdk");
    client = await import("@starkware-libs/starknet-privacy-client");
  } catch (error) {
    console.warn(
      `pay disabled: the privacy SDK is not installed (${(error as Error).message}). ` +
        "Run `npm run setup` to build it into vendor/.",
    );
    return null;
  }

  const { RpcProvider, Signer } = starknet;
  const node = new RpcProvider({ nodeUrl: env.rpcUrl });

  // The sequencer rejects a proof whose base block is too recent: it must be
  // roughly ten blocks behind the one that finally includes the transaction.
  const provingBlock = (await node.getBlockNumber()) - 12;

  // OHTTP encapsulates proving and discovery traffic so the operator of those
  // services reads neither request nor response. Each gateway needs its own
  // relay, and a relay without a pinned key config still leaks the IP on the
  // `/ohttp-keys` fetch. See server/src/pay/ohttp.ts and docs/THREAT-MODEL.md 3.5.
  const ohttp = resolveOhttp(env);

  let registry: unknown;
  const storage = {
    loadRegistry: async () => registry,
    saveRegistry: async (value: unknown) => {
      registry = value;
    },
  };

  const prover = new client.CorePrivateTransfersProver({
    signer: new Signer(env.privateKey),
    address: env.address,
    passphrase: env.passphrase,
    node,
    discovery: new sdk.IndexerDiscoveryProvider(env.indexerUrl, env.pool, {
      ohttp: ohttp.discovery,
    }),
    prover: new sdk.ProvingServiceProofProvider(env.provingUrl, env.chainId, {
      nodeUrl: env.rpcUrl,
      poolAddress: env.pool,
      blockIdentifier: { block_number: provingBlock },
      ohttp: ohttp.prover,
    }),
    poolContractAddress: env.pool,
    shadowAccountAnonymizerAddress: "0x0",
    storage,
  });

  // The SDK proves but cannot submit: only a paymaster or a STRK20-aware
  // wallet can attach the proof. sponsored_private also settles the fee from
  // inside the pool, so paying the fee does not expose the payer.
  const paymaster = new client.AvnuPaymaster({
    url: env.paymasterUrl,
    apiKey: env.avnuApiKey,
    feeMode: { mode: "sponsored_private", poolFeeToken: env.token },
  });

  return new client.SdkWallet({
    prover,
    paymaster,
    poolContractAddress: env.pool,
    signer: new Signer(env.privateKey),
    userAddress: env.address,
  }) as PayWallet;
}

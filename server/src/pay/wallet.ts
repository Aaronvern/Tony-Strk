import type {
  Call,
  EstimateFeeResponseOverhead,
  ResourceBoundsBN,
} from "starknet";

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
  /** Submit the proven pool call from this account instead of using AVNU. */
  publicPrivacyRelay?: boolean;
  /** Hard cap for the account-paid invoke fee, in STRK wei. */
  publicFeeCapWei?: bigint;
  /** Optional private-pool STRK withdrawal back to this public account. */
  publicRelayRefillWei?: bigint;
  /** Require an RPC that supports SNIP-36 proof fields. */
  requireSnip36Rpc?: boolean;
}

interface PublicRelayAccount {
  estimateInvokeFee(
    calls: Call,
    details: { proof: string; proofFacts: string[] },
  ): Promise<EstimateFeeResponseOverhead>;
  execute(
    calls: Call,
    details: {
      tip: bigint;
      resourceBounds: ResourceBoundsBN;
      proof: string;
      proofFacts: string[];
    },
  ): Promise<{ transaction_hash: string }>;
}

interface PublicRelayProver {
  prove(
    actions: unknown[],
    simulate?: boolean,
  ): Promise<{
    call: {
      contractAddress?: string;
      contract_address?: string;
      entrypoint?: string;
      entry_point?: string;
      calldata?: Call["calldata"];
    };
    proof: { data: string; proof_facts: string[] };
  }>;
}

interface PublicRelayOptions {
  account: PublicRelayAccount;
  prover: PublicRelayProver;
  feeCapWei?: bigint;
  refillWei?: bigint;
  refillToken?: string;
  refillRecipient?: string;
  warn?: (message: string) => void;
}

const DEFAULT_PUBLIC_FEE_CAP_WEI = 5_000_000_000_000_000_000n;

/** Starknet RPC 0.10.1 added the proof fields required by STRK20. */
export function assertSnip36RpcVersion(version: string): void {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  const supported =
    match &&
    (Number(match[1]) > 0 ||
      Number(match[2]) > 10 ||
      (Number(match[2]) === 10 && Number(match[3]) >= 1));
  if (!supported) {
    throw new Error(
      `Configured RPC reports spec ${JSON.stringify(version)}; STRK20 proof submission ` +
        "requires RPC spec >= 0.10.1.",
    );
  }
}

/**
 * Prove an exact STRK20 action set and submit its pool call from the public
 * account. This is the opt-in fallback for environments where AVNU cannot
 * sponsor: the account pays the Starknet fee and its linkage is public.
 */
export async function submitPublicPrivacyRelay(
  actions: unknown[],
  options: PublicRelayOptions,
): Promise<{ transaction_hash: string }> {
  const actionsToProve = addPublicRelayRefill(actions, options);
  const { call: provenCall, proof } =
    await options.prover.prove(actionsToProve);
  const contractAddress =
    provenCall.contractAddress ?? provenCall.contract_address;
  const entrypoint = provenCall.entrypoint ?? provenCall.entry_point;
  if (!contractAddress || !entrypoint) {
    throw new Error("The privacy prover returned a malformed pool call.");
  }

  const call: Call = {
    contractAddress,
    entrypoint,
    calldata: provenCall.calldata,
  };
  const proofDetails = { proof: proof.data, proofFacts: proof.proof_facts };
  const estimate = await options.account.estimateInvokeFee(call, proofDetails);
  const feeCapWei = options.feeCapWei ?? DEFAULT_PUBLIC_FEE_CAP_WEI;
  if (estimate.overall_fee > feeCapWei) {
    throw new Error(
      `Refusing public privacy relay: estimated fee ${estimate.overall_fee} wei exceeds ` +
        `the configured cap of ${feeCapWei} wei.`,
    );
  }

  options.warn?.(
    "PUBLIC_PRIVACY_RELAY is enabled: this account pays the Starknet fee directly, " +
      "so the account-to-payment linkage is public on-chain and is not anonymous.",
  );
  return options.account.execute(call, {
    tip: 0n,
    resourceBounds: estimate.resourceBounds,
    ...proofDetails,
  });
}

function addPublicRelayRefill(
  actions: unknown[],
  options: PublicRelayOptions,
): unknown[] {
  if (options.refillWei === undefined) return actions;
  if (options.refillWei <= 0n) {
    throw new Error("The public privacy relay refill must be above zero.");
  }
  if (!options.refillToken || !options.refillRecipient) {
    throw new Error(
      "The public privacy relay refill needs a token and recipient.",
    );
  }

  const refill = {
    type: "withdraw",
    token: options.refillToken,
    amount: `0x${options.refillWei.toString(16)}`,
    recipient: options.refillRecipient,
  };
  const invokeIndex = actions.findLastIndex(
    (action) =>
      typeof action === "object" &&
      action !== null &&
      (action as { type?: unknown }).type === "invoke",
  );
  return invokeIndex < 0
    ? [...actions, refill]
    : [...actions.slice(0, invokeIndex), refill, ...actions.slice(invokeIndex)];
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

  if (env.requireSnip36Rpc) {
    assertSnip36RpcVersion(await node.getSpecVersion());
  }

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

  if (env.publicPrivacyRelay) {
    const account = new starknet.Account({
      provider: node,
      address: env.address,
      signer: env.privateKey,
    });
    console.warn(
      "PUBLIC_PRIVACY_RELAY is enabled: AVNU sponsorship is bypassed; the configured " +
        "account pays the fee directly, so its payment linkage is public and not anonymous on-chain.",
    );
    return {
      strk20InvokeTransaction: (actions: unknown[]) =>
        submitPublicPrivacyRelay(actions, {
          account,
          prover,
          feeCapWei: env.publicFeeCapWei,
          refillWei: env.publicRelayRefillWei,
          refillToken: env.token,
          refillRecipient: env.address,
        }),
    } as PayWallet;
  }

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

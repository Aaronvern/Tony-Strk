import { execFile } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { cairo, constants, hash, num, RpcProvider, Signer } from "starknet";
import {
  IndexerDiscoveryProvider,
  ProvingServiceProofProvider,
} from "@starkware-libs/starknet-privacy-sdk";
import {
  AvnuPaymaster,
  CorePrivateTransfersProver,
  SdkWallet,
  passphraseViewingKeyProvider,
} from "@starkware-libs/starknet-privacy-client";

import {
  MAINNET_CHAIN_ID,
  MAINNET_POOL,
  MAX_POOL_FEE,
  STRK,
  assertFeeQuote,
  assertSuccessfulPoolTransaction,
  buildMainnetPlan,
} from "../server/src/pay/mainnet-three.ts";

const execFileAsync = promisify(execFile);
const ACCOUNT_SERVICE = "tony-strk.mainnet.oneoff";
const PAYMASTER_SERVICE = "tony-strk.sepolia.paymaster";
const KEYCHAIN_ACCOUNT = "default";
const MATURITY_BLOCKS = 12;
const STATE_PATH =
  process.env.MAINNET_THREE_STATE ?? ".mainnet-three-state.json";
const RPC_URL =
  process.env.STARKNET_RPC_URL ?? "https://rpc.starknet.lava.build";
const PROVING_URL =
  process.env.PROVING_SERVICE_URL ??
  "https://cloud.argent-api.com/v1/privacy/proving";
const INDEXER_URL =
  process.env.INDEXER_URL ??
  "https://cloud.argent-api.com/v1/privacy/discovery";
const PAYMASTER_URL =
  process.env.PAYMASTER_URL ?? "https://starknet.paymaster.avnu.fi";
const POLL_MS = Number(process.env.MAINNET_THREE_POLL_MS ?? 15_000);
const STEP_NAMES = ["shield", "transfer", "unshield"];

function fail(message) {
  throw new Error(message);
}

async function loadKeychain(service) {
  if (process.platform !== "darwin")
    fail("mainnet:three requires the macOS Keychain.");
  try {
    const { stdout } = await execFileAsync(
      "security",
      ["find-generic-password", "-s", service, "-a", KEYCHAIN_ACCOUNT, "-w"],
      { maxBuffer: 1024 * 1024 },
    );
    return stdout.trim();
  } catch (error) {
    if (error?.code === 44) return null;
    throw new Error(`could not load the ${service} Keychain entry`);
  }
}

async function loadAccountBundle() {
  const encoded = await loadKeychain(ACCOUNT_SERVICE);
  if (!encoded) fail(`missing ${ACCOUNT_SERVICE} Keychain entry`);
  try {
    const bundle = JSON.parse(encoded);
    if (
      typeof bundle?.privateKey !== "string" ||
      !bundle.privateKey ||
      typeof bundle?.passphrase !== "string" ||
      !bundle.passphrase ||
      typeof bundle?.address !== "string" ||
      !bundle.address
    ) {
      throw new Error();
    }
    return bundle;
  } catch {
    fail(`invalid ${ACCOUNT_SERVICE} Keychain entry`);
  }
}

function emptyState() {
  return { hashes: {}, completed: [] };
}

function isHash(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{1,64}$/.test(value);
}

function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("mainnet:three state must be a JSON object");
  }
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "completed,hashes")
    fail("mainnet:three state contains unsupported data");
  if (
    !Array.isArray(value.completed) ||
    !value.completed.every((step) => STEP_NAMES.includes(step))
  ) {
    fail("mainnet:three state has invalid completed steps");
  }
  if (new Set(value.completed).size !== value.completed.length) {
    fail("mainnet:three state repeats a completed step");
  }
  if (
    !value.hashes ||
    typeof value.hashes !== "object" ||
    Array.isArray(value.hashes)
  ) {
    fail("mainnet:three state has invalid hashes");
  }
  for (const [step, txHash] of Object.entries(value.hashes)) {
    if (!STEP_NAMES.includes(step) || !isHash(txHash))
      fail("mainnet:three state has an invalid hash");
  }
  for (const [index, step] of STEP_NAMES.entries()) {
    const completed = value.completed.includes(step);
    const hasHash = Boolean(value.hashes[step]);
    if (completed !== hasHash)
      fail("mainnet:three state must pair every completed step with a hash");
    if (index < value.completed.length && !completed)
      fail("mainnet:three state is out of order");
    if (index >= value.completed.length && completed)
      fail("mainnet:three state is out of order");
  }
  const firstIncomplete = value.completed.length;
  for (let index = firstIncomplete + 1; index < STEP_NAMES.length; index += 1) {
    if (value.hashes[STEP_NAMES[index]])
      fail("mainnet:three state is out of order");
  }
  return { hashes: { ...value.hashes }, completed: [...value.completed] };
}

async function loadState() {
  try {
    return validateState(JSON.parse(await readFile(STATE_PATH, "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return emptyState();
    if (error instanceof SyntaxError)
      fail("mainnet:three state is not valid JSON");
    throw error;
  }
}

async function saveState(state) {
  const temporary = `${STATE_PATH}.${process.pid}.tmp`;
  const publicState =
    JSON.stringify(
      { hashes: state.hashes, completed: state.completed },
      null,
      2,
    ) + "\n";
  await writeFile(temporary, publicState, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, STATE_PATH);
}

function u256([low, high]) {
  return BigInt(low) + (BigInt(high) << 128n);
}

async function readPublicBalance(node, address) {
  return u256(
    await node.callContract({
      contractAddress: STRK,
      entrypoint: "balanceOf",
      calldata: [address],
    }),
  );
}

async function readPoolFee(node) {
  const [fee] = await node.callContract({
    contractAddress: MAINNET_POOL,
    entrypoint: "get_fee_amount",
    calldata: [],
  });
  return BigInt(fee);
}

async function isRegistered(node, address) {
  const [publicKey] = await node.callContract({
    contractAddress: MAINNET_POOL,
    entrypoint: "get_public_key",
    calldata: [address],
  });
  return BigInt(publicKey) !== 0n;
}

function buildApproveCall(amount) {
  const value = cairo.uint256(num.toBigInt(amount));
  return {
    to: STRK,
    selector: hash.getSelectorFromName("approve"),
    calldata: [MAINNET_POOL, num.toHex(value.low), num.toHex(value.high)],
  };
}

function paymasterBuild(step, address) {
  if (step.kind !== "shield")
    return { kind: "applyAction", poolAddress: MAINNET_POOL };
  return {
    kind: "invokeAndApplyAction",
    poolAddress: MAINNET_POOL,
    userAddress: address,
    calls: [buildApproveCall(step.actions[0].amount)],
  };
}

function makePaymaster(apiKey) {
  return new AvnuPaymaster({
    url: PAYMASTER_URL,
    apiKey,
    feeMode: { mode: "sponsored_private", poolFeeToken: STRK },
  });
}

async function preflight(node, address, paymaster, state) {
  if (BigInt(await node.getChainId()) !== BigInt(MAINNET_CHAIN_ID)) {
    fail("refusing to run: RPC is not Starknet mainnet");
  }
  try {
    await node.getClassAt(address);
  } catch {
    fail("refusing to run: the Ready account is not deployed");
  }

  const poolFee = await readPoolFee(node);
  if (poolFee !== MAX_POOL_FEE)
    fail("refusing to run: mainnet pool fee is not 6 STRK");

  const quote = await paymaster.buildTransaction({
    kind: "applyAction",
    poolAddress: MAINNET_POOL,
  });
  assertFeeQuote(quote);

  if (!state.hashes.shield) {
    if ((await readPublicBalance(node, address)) < 20n * 10n ** 18n) {
      fail("refusing to run: public STRK balance is below 20 STRK");
    }
    if (await isRegistered(node, address)) {
      fail("refusing to run: the pool user is already registered");
    }
  }
}

async function createStepContext(account, apiKey) {
  const node = new RpcProvider({ nodeUrl: RPC_URL });
  const provingBlock = (await node.getBlockNumber()) - MATURITY_BLOCKS;
  if (provingBlock < 0)
    fail("refusing to run: mainnet has fewer than 12 blocks");

  const discovery = new IndexerDiscoveryProvider(INDEXER_URL, MAINNET_POOL);
  const prover = new CorePrivateTransfersProver({
    signer: new Signer(account.privateKey),
    address: account.address,
    passphrase: account.passphrase,
    node,
    discovery,
    prover: new ProvingServiceProofProvider(
      PROVING_URL,
      constants.StarknetChainId.SN_MAIN,
      {
        nodeUrl: RPC_URL,
        poolAddress: MAINNET_POOL,
        blockIdentifier: { block_number: provingBlock },
      },
    ),
    poolContractAddress: MAINNET_POOL,
    shadowAccountAnonymizerAddress: "0x0",
    storage: {
      loadRegistry: async () => undefined,
      saveRegistry: async () => {},
    },
  });
  const rawPaymaster = makePaymaster(apiKey);
  return {
    node,
    discovery,
    prover,
    rawPaymaster,
    provingBlock,
  };
}

function guardedWallet(context, account, expectedFee) {
  const paymaster = {
    buildTransaction: async (build) => {
      const quote = await context.rawPaymaster.buildTransaction(build);
      const fee = assertFeeQuote(quote);
      if (
        BigInt(fee.token) !== BigInt(expectedFee.token) ||
        BigInt(fee.amount) !== BigInt(expectedFee.amount)
      ) {
        fail(
          "refusing to submit: paymaster fee quote changed after simulation",
        );
      }
      return quote;
    },
    executeTransaction: (execute) =>
      context.rawPaymaster.executeTransaction(execute),
  };
  return new SdkWallet({
    prover: context.prover,
    paymaster,
    poolContractAddress: MAINNET_POOL,
    signer: new Signer(account.privateKey),
    userAddress: account.address,
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForMaturity(node, blockNumber) {
  for (;;) {
    if ((await node.getBlockNumber()) - Number(blockNumber) >= MATURITY_BLOCKS)
      return;
    await sleep(POLL_MS);
  }
}

async function waitForZero(discovery, account) {
  const viewingKey = await passphraseViewingKeyProvider(
    account.passphrase,
    account.address,
  ).getViewingKey();
  for (;;) {
    const { notes } = await discovery.discoverNotes(
      BigInt(account.address),
      viewingKey,
      {
        tokens: [BigInt(STRK)],
      },
    );
    let total = 0n;
    for (const tokenNotes of notes.values()) {
      for (const note of tokenNotes) total += BigInt(note.amount);
    }
    if (total === 0n) return;
    await sleep(POLL_MS);
  }
}

async function settleStep(context, account, step, state) {
  const expectedFee = assertFeeQuote(
    await context.rawPaymaster.buildTransaction(
      paymasterBuild(step, account.address),
    ),
  );
  const wallet = guardedWallet(context, account, expectedFee);
  const actions = step.actions.map((action) => ({ ...action }));

  // This is the exact action list the submit path will prove, including its fee withdrawal.
  await wallet.strk20PrepareInvoke([...actions, expectedFee], true);
  const { transaction_hash: transactionHash } =
    await wallet.strk20InvokeTransaction(actions);
  if (!isHash(transactionHash))
    fail("paymaster returned an invalid transaction hash");

  state.hashes[step.kind] = transactionHash;
  await saveState(state);
  const receipt = await context.node.waitForTransaction(transactionHash);
  assertSuccessfulPoolTransaction(receipt, transactionHash);
  if (step.kind !== "unshield")
    await waitForMaturity(context.node, receipt.block_number);
  if (step.kind === "unshield") await waitForZero(context.discovery, account);
  state.completed.push(step.kind);
  await saveState(state);
  return transactionHash;
}

async function resumeStep(context, account, step, state) {
  const transactionHash = state.hashes[step.kind];
  if (!transactionHash) return null;
  const receipt = await context.node.waitForTransaction(transactionHash);
  assertSuccessfulPoolTransaction(receipt, transactionHash);
  if (step.kind !== "unshield")
    await waitForMaturity(context.node, receipt.block_number);
  if (step.kind === "unshield") await waitForZero(context.discovery, account);
  state.completed.push(step.kind);
  await saveState(state);
  return transactionHash;
}

async function run() {
  const [account, apiKey, state] = await Promise.all([
    loadAccountBundle(),
    loadKeychain(PAYMASTER_SERVICE),
    loadState(),
  ]);
  if (!apiKey) fail(`missing ${PAYMASTER_SERVICE} Keychain entry`);

  const preflightNode = new RpcProvider({ nodeUrl: RPC_URL });
  await preflight(preflightNode, account.address, makePaymaster(apiKey), state);

  const hashes = [];
  const plan = buildMainnetPlan(account.address);
  for (const step of plan) {
    if (state.completed.includes(step.kind)) {
      hashes.push(state.hashes[step.kind]);
      continue;
    }
    const context = await createStepContext(account, apiKey);
    const hash = state.hashes[step.kind]
      ? await resumeStep(context, account, step, state)
      : await settleStep(context, account, step, state);
    hashes.push(hash);
  }

  if (state.completed.length !== STEP_NAMES.length)
    fail("mainnet:three did not complete all steps");
  console.log(JSON.stringify(hashes));
}

try {
  await run();
} catch {
  console.error(
    "mainnet:three stopped before all three verified receipts completed",
  );
  process.exitCode = 1;
}

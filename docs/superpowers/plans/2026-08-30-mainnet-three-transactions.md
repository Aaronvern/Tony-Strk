# Mainnet Three STRK20 Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute and record three successful Starknet mainnet STRK20 pool transactions: shield, private self-transfer, and unshield.

**Architecture:** Reuse the existing privacy SDK client, AVNU paymaster adapter, and Ready account signer. Add one operator script with pure, tested safety helpers; it rebuilds the wallet at a fresh proving block for each step, simulates the exact actions including the quoted fee, submits only under the approved cap, waits for note maturity, and verifies the accepted receipt and pool binding before continuing.

**Tech Stack:** Node.js 24, TypeScript, starknet.js 10.7, StarkWare privacy SDK/client, AVNU managed paymaster, macOS Keychain.

**Spec:** `docs/TRANSACTIONS.md`

## Global Constraints

- Use Starknet mainnet, pool `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a`, and STRK `0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d`.
- Execute exactly three qualifying pool transactions: deposit 20 STRK, self-transfer 0.1 STRK, withdraw 2 STRK to the same Ready account.
- Maximum public outflow is 20 STRK. Maximum irreversible pool fees are 18 STRK: at most 6 STRK per transaction. Abort before proving or signing if a quote exceeds the cap or names another fee token.
- Use `sponsored_private`; abort if the mainnet paymaster is unavailable. Never fall back to user-paid gas.
- Never write or print the private key, privacy passphrase, or AVNU API key. Subagents must not receive secrets.
- Read the one-off account bundle and existing AVNU key from separate macOS Keychain services. Do not delete or modify the AVNU key.
- Simulate the exact action list, including the paymaster fee withdrawal, immediately before each submission.
- Wait 12 blocks after shield and private transfer before spending their notes.
- Continue only after an accepted receipt is bound to the returned hash and the transaction calldata touches the exact mainnet pool.
- Record hashes in `strk20.json` and `docs/TRANSACTIONS.md` only after all three receipts pass verification.
- Delete the one-off mainnet Keychain entry only after discovery confirms zero remaining shielded STRK.

---

### Task 1: Capped, resumable mainnet runner

**Files:**
- Create: `server/src/pay/mainnet-three.ts`
- Create: `server/test/mainnet-three.test.ts`
- Create: `scripts/mainnet-three.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing `CorePrivateTransfersProver`, `SdkWallet`, `AvnuPaymaster`, `IndexerDiscoveryProvider`, `ProvingServiceProofProvider`, and macOS Keychain entries.
- Produces: `buildMainnetPlan`, `assertFeeQuote`, `assertSuccessfulPoolTransaction`, and `npm run mainnet:three`.

- [ ] **Step 1: Write failing safety tests**

Test that the plan is exactly deposit 20, self-transfer 0.1, and withdraw 2; that a non-STRK or greater-than-6-STRK fee quote is rejected; and that reverted, hash-mismatched, or pool-unbound transactions are rejected.

```ts
test("the approved plan spends exactly three capped pool fees", () => {
  assert.deepEqual(buildMainnetPlan(ACCOUNT), [
    { kind: "shield", actions: [{ type: "deposit", token: STRK, amount: "0x1158e460913d00000" }] },
    { kind: "transfer", actions: [{ type: "transfer", token: STRK, amount: "0x16345785d8a0000", recipient: ACCOUNT }] },
    { kind: "unshield", actions: [{ type: "withdraw", token: STRK, amount: "0x1bc16d674ec80000", recipient: ACCOUNT }] },
  ]);
});
```

- [ ] **Step 2: Verify RED**

Run: `node --test server/test/mainnet-three.test.ts`

Expected: FAIL because `server/src/pay/mainnet-three.ts` does not exist.

- [ ] **Step 3: Implement the pure safety helpers**

Implement only the constants, exact plan builder, fee-token/amount cap, accepted-receipt/hash checks, and pool-address presence check used by the runner.

- [ ] **Step 4: Verify GREEN**

Run: `node --test server/test/mainnet-three.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Implement the operator runner**

The runner must:

1. Load the one-off account bundle from `tony-strk.mainnet.oneoff` and AVNU key from `tony-strk.sepolia.paymaster` without printing either.
2. Confirm mainnet chain ID, deployed account, public balance at least 20 STRK, unregistered pool user, 6 STRK pool fee, and paymaster availability.
3. Resume from a JSON state file containing only public hashes and completed step names.
4. For each incomplete step, create fresh SDK/prover/discovery/paymaster objects at `latest - 12`, get and cap the fee quote, simulate the exact actions plus fee withdrawal, submit, wait for acceptance, verify hash and pool binding, persist the public hash, then wait 12 blocks when another note spend follows.
5. After unshield, poll discovery until shielded STRK totals zero, print the three hashes, and leave Keychain deletion to the primary operator.

- [ ] **Step 6: Add the package command and run verification**

Add:

```json
"mainnet:three": "node scripts/mainnet-three.mjs"
```

Run: `npm test`

Expected: 182 tests pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add server/src/pay/mainnet-three.ts server/test/mainnet-three.test.ts scripts/mainnet-three.mjs package.json
git commit -m "Add capped mainnet STRK20 transaction runner"
```

### Task 2: Execute and record the three verified transactions

**Files:**
- Modify: `strk20.json`
- Modify: `docs/TRANSACTIONS.md`

**Interfaces:**
- Consumes: the three accepted hashes emitted by `npm run mainnet:three`.
- Produces: the hackathon submission transaction list and human-readable evidence.

- [ ] **Step 1: Install the one-off secret securely**

Use a no-echo terminal prompt to store `{ privateKey, passphrase, address }` in the `tony-strk.mainnet.oneoff` Keychain service. Do not touch `tony-strk.sepolia.paymaster`.

- [ ] **Step 2: Execute the runner**

Run: `npm run mainnet:three`

Expected: three distinct accepted hashes, in shield → transfer → unshield order, with no cap violation.

- [ ] **Step 3: Independently verify all three hashes**

Query fresh mainnet receipts and transactions. Require `SUCCEEDED`, accepted finality, matching hashes, and exact pool binding for every hash.

- [ ] **Step 4: Verify zero shielded balance and remove only the one-off secret**

Delete `tony-strk.mainnet.oneoff` only after the runner's discovery check reports zero. Re-query the public account balance. Preserve the AVNU key.

- [ ] **Step 5: Record evidence**

Write the three hashes to `strk20.json` in order and add three dated mainnet rows to `docs/TRANSACTIONS.md` with Voyager and Starkscan links.

- [ ] **Step 6: Final verification and commit**

Run: `npm test && npm run build`

Expected: all tests pass and the production build exits 0.

```bash
git add strk20.json docs/TRANSACTIONS.md
git commit -m "Record three STRK20 mainnet transactions"
```

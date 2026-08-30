# Three mainnet x402 product runs

**Goal:** Use the funded guardian-free Ready account to deploy the missing mainnet PaywallAnonymizer, then prove three complete MCP → Tor → x402 → STRK20 → HTTP 200 runs on Starknet mainnet.

## Task 1: Make the existing product network-aware

- Add failing tests proving `PAYMENT-REQUIRED` accepts the configured mainnet network and still rejects a mismatched network.
- Pass the configured network through `SettleDeps` instead of relying on the Sepolia constant.
- Let the existing Keychain constructors accept an optional service name so mainnet uses a separate wallet entry while preserving the existing AVNU entry.
- Run the focused tests, then the full deterministic suite and production build.

## Task 2: Deploy the funded account and helper

- Rebuild and test `contracts/src/paywall_anonymizer.cairo`.
- Preflight the funded counterfactual address, class hashes, balances, chain ID, calldata, and capped resource bounds.
- Deploy the Ready account with guardian `None` using the already funded address.
- Declare and deploy the current PaywallAnonymizer on mainnet; verify class/address and successful receipts.
- Store the same owner key/passphrase with the new address under a separate mainnet Keychain service. Do not modify or delete the existing wallet or AVNU entries.

## Task 3: Run the actual product three times

- Start the merchant in mainnet mode and expose it with the existing HTTPS tunnel approach.
- Start the MCP in mainnet mode with Tor, mainnet pool/token/helper, mainnet proving/discovery/paymaster endpoints, and the separate mainnet wallet Keychain service.
- Confirm health, `IsTor:true`, wallet address/state, price ceiling, advertised helper, and initial private balance.
- Shield only the amount required for three 0.05 STRK payments plus the quoted private fees; wait until the SDK-safe proving block.
- Execute `verify-x402.mjs --live` three times sequentially. After each broadcast, persist the transaction hash immediately and verify the submitted transaction, helper receipt, merchant `PAYMENT-RESPONSE`, HTTP 200, and protected content before continuing.

## Task 4: Evidence and final verification

- Record account deployment, helper declaration/deployment, shield, and three payment hashes in `docs/TRANSACTIONS.md` without secrets.
- Run focused tests, full deterministic tests, contract tests, and production build.
- Report the three mainnet explorer links and exact end-to-end result.

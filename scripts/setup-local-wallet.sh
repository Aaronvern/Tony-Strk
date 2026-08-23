#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This local wallet setup requires macOS."
  exit 1
fi

if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  echo "Install Node.js 24 before you run this script."
  exit 1
fi

has_keychain_item() {
  security find-generic-password -s "$1" -a default -w >/dev/null 2>&1
}

if ! has_keychain_item "tony-strk.sepolia.wallet"; then
  npm run wallet:create
fi

if ! has_keychain_item "tony-strk.sepolia.paymaster"; then
  npm run paymaster:set
fi

address="$(node --input-type=module -e '
  import { createKeychainStore } from "./server/src/pay/keychain.ts";
  import { createCounterfactualAccount } from "./server/src/pay/account.ts";
  const secret = await createKeychainStore().load();
  if (!secret) process.exit(1);
  console.log(createCounterfactualAccount(secret.privateKey, secret.passphrase).address);
')"

echo ""
echo "Wallet setup is complete."
echo "Fund this Sepolia address: $address"
echo "Then ask your MCP client to call wallet_status and wallet_deploy."

#!/usr/bin/env bash
# The StarkWare privacy SDK and client are not published to npm, so they have to
# be built from source. This clones them into ./vendor (gitignored) and installs
# them by relative path, so it works on any machine.
set -euo pipefail

REPO="https://github.com/starkware-libs/starknet-privacy.git"
DIR="vendor/starknet-privacy"

echo "→ fetching the privacy SDK"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only --quiet || true
else mkdir -p vendor && git clone --depth 1 --quiet "$REPO" "$DIR"; fi

for pkg in sdk client; do
  echo "→ building $pkg"
  ( cd "$DIR/$pkg" && { [ -d node_modules ] || npm ci --silent; } && npm run build --silent )
done

echo "→ linking into this project"
npm install "./$DIR/sdk" "./$DIR/client" --no-audit --no-fund --silent

echo "✅ done — the privacy SDK and client are installed."

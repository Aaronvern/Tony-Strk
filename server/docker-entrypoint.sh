#!/bin/bash
set -euo pipefail

# Tor first, in the background. The server starts either way: if no circuit is
# available the browse tool refuses, which is the behaviour we want rather than
# a fallback that would quietly leak the caller's IP.
tor --SocksPort 9050 --Log "notice stdout" &

for _ in $(seq 1 60); do
  if (exec 3<>/dev/tcp/127.0.0.1/9050) 2>/dev/null; then
    echo "tor: SOCKS port open"
    break
  fi
  sleep 1
done

exec node src/index.ts

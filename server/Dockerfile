# Local diagnostics image: the MCP server and a Tor daemon in one container.
# The server stays on loopback and is not a remote deployment target.
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends tor ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# server/ is self-contained: it does not import the vendored privacy SDK, which
# is gitignored and so is absent from this build context. That changes the day
# the pay tool lands - see the note in README.
COPY server/package.json ./
RUN npm install --omit=dev

COPY server/ ./

ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=8787 \
    TOR_SOCKS_PROXY=socks5://127.0.0.1:9050

ENTRYPOINT ["/app/docker-entrypoint.sh"]

# The MCP server, with a Tor daemon beside it.
#
# This is the reason the backend left Vercel: browse needs a local SOCKS
# circuit, and Tor is a daemon that has to bootstrap and stay up, which a
# serverless function cannot host.
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
    HOST=0.0.0.0 \
    PORT=8787 \
    TOR_SOCKS_PROXY=socks5://127.0.0.1:9050

EXPOSE 8787

ENTRYPOINT ["/app/docker-entrypoint.sh"]

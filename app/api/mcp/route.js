import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createServer } from "../../../src/mcp/server.mjs";

/**
 * Node's global fetch has no SOCKS support, and it ignores options it doesn't
 * recognise. Handing it `{ proxy }` would therefore make an ordinary direct
 * request while the caller believed it was on a Tor circuit, which is the one
 * failure this whole tool exists to prevent. Until a real SOCKS dispatcher is
 * wired up, refuse loudly instead.
 */
function torFetch(target, { proxy }) {
  throw new Error(
    `Tor egress is not wired into the hosted server yet (configured proxy: ${proxy}). ` +
      "Refusing rather than falling back to a direct request.",
  );
}

export async function POST(request) {
  const server = createServer({
    torProxy: process.env.TOR_SOCKS_PROXY ?? "",
    fetchImpl: torFetch,
  });

  // Stateless: no sessionIdGenerator, so each request stands alone. That suits
  // a serverless deployment, where nothing survives between invocations.
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}

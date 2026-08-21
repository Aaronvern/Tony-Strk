import test from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/mcp/server.ts";

// Talks to the server the way a real client does, over the SDK's own
// transport, so these exercise the actual protocol rather than a stand-in.
async function connect(deps = {}) {
  const server = createServer({ torProxy: "", fetchImpl: () => {}, ...deps });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tony-strk-tests", version: "0.0.0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  return client;
}

test("an MCP client can discover the tools", async () => {
  const client = await connect();

  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["browse", "pay"],
  );
});

test("a paywalled page tells the client that payment is required", async () => {
  const client = await connect({
    torProxy: "socks5://127.0.0.1:9050",
    fetchImpl: () =>
      new Response("<html><body>Pay 5 STRK to read this</body></html>", {
        status: 402,
      }),
  });

  const result = await client.callTool({
    name: "browse",
    arguments: { url: "https://paywalled.example/article" },
  });

  // Without this the agent gets the paywall's HTML and no way to tell it
  // apart from the article it asked for.
  assert.equal(result.structuredContent?.paymentRequired, true);
  assert.equal(result.structuredContent?.status, 402);
});

import test from "node:test";
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../server/src/mcp/server.ts";

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

test("an MCP client can discover the browse tool", async () => {
  const client = await connect();

  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["browse"],
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { createApp } from "../server/src/app.ts";

// The in-memory tests prove the server logic. This one proves the thing a
// client actually dials - an HTTP port - is really speaking the protocol.
test("the Express server speaks MCP over Streamable HTTP", async (t) => {
  const app = createApp({
    torProxy: "",
    fetchImpl: () => new Response(""),
  });

  const httpServer = app.listen(0);
  t.after(() => new Promise((resolve) => httpServer.close(resolve)));

  const { port } = httpServer.address() as AddressInfo;
  const client = new Client({ name: "tony-strk-tests", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)),
  );
  t.after(() => client.close());

  const { tools } = await client.listTools();

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["browse"],
  );
});

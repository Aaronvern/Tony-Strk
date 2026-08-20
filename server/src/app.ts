import express from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createServer } from "./mcp/server.ts";
import type { BrowseDeps } from "./tools/browse.ts";

/**
 * Build the HTTP surface for the MCP server.
 *
 * `createMcpExpressApp` brings DNS rebinding protection with it, which matters
 * because an MCP server bound to localhost is otherwise reachable by any page
 * the user happens to have open.
 */
export function createApp(
  deps: BrowseDeps,
  opts: { host?: string; allowedHosts?: string[] } = {},
) {
  const app = createMcpExpressApp(opts);
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    // A fresh server and transport per request: stateless, so nothing about
    // one agent's task can leak into the next one's.
    const server = createServer(deps);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, torProxy: deps.torProxy ? "configured" : "absent" });
  });

  return app;
}

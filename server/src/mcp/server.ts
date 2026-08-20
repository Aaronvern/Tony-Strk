import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { browse, type BrowseDeps } from "../tools/browse.ts";

/**
 * Build the Tony Strk MCP server.
 *
 * Dependencies are injected rather than read from the environment here, so the
 * server can be exercised by tests without a live Tor circuit.
 */
export function createServer(deps: BrowseDeps): McpServer {
  const server = new McpServer({ name: "tony-strk", version: "0.1.0" });

  server.registerTool(
    "browse",
    {
      title: "Browse anonymously",
      description:
        "Fetch a public URL through a Tor circuit so the destination sees an " +
        "exit relay rather than your IP. Refuses to run if no circuit is available.",
      inputSchema: {
        url: z.string().describe("The http(s) URL to fetch."),
      },
    },
    async ({ url }) => {
      const result = await browse({ url }, deps);
      return { content: [{ type: "text" as const, text: result.text }] };
    },
  );

  return server;
}

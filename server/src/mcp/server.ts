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
        raw: z
          .boolean()
          .optional()
          .describe(
            "Return the response body untouched. By default HTML is reduced " +
              "to readable text, which is far cheaper to read.",
          ),
      },
      outputSchema: {
        url: z.string().describe("The URL that was fetched."),
        status: z.number().describe("HTTP status returned by the destination."),
        title: z.string().describe("The page title, when there is one."),
        paymentRequired: z
          .boolean()
          .describe(
            "True when the destination answered 402. The page body is the " +
              "paywall, not the content that was asked for.",
          ),
        text: z.string().describe("The response body."),
      },
    },
    async ({ url, raw }) => {
      const result = await browse({ url, raw }, deps);
      return {
        content: [{ type: "text" as const, text: result.text }],
        structuredContent: result,
      };
    },
  );

  return server;
}

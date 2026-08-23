import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { browse, type BrowseDeps } from "../tools/browse.ts";
import { pay, type PayDeps } from "../pay/pay.ts";

interface WalletToolDeps {
  status(): Promise<Record<string, unknown>>;
  create(): Promise<Record<string, unknown>>;
  deploy(): Promise<Record<string, unknown>>;
}

export type ServerDeps = BrowseDeps & { pay?: PayDeps; wallet?: WalletToolDeps };

/**
 * Build the Tony Strk MCP server.
 *
 * Dependencies are injected rather than read from the environment here, so the
 * server can be exercised by tests without a live Tor circuit.
 */
export function createServer(deps: ServerDeps): McpServer {
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

  if (deps.wallet) {
    server.registerTool(
      "wallet_status",
      {
        title: "Show local wallet status",
        description:
          "Use this before a payment. It reports whether the local Sepolia " +
          "wallet needs creation, funding, deployment, or is ready.",
        inputSchema: {},
      },
      async () => {
        const result = await deps.wallet!.status();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );

    server.registerTool(
      "wallet_create",
      {
        title: "Create the local Sepolia wallet",
        description:
          "Create a fresh Starknet keypair in the macOS Keychain. Return the " +
          "public counterfactual address that the user must fund.",
        inputSchema: {},
      },
      async () => {
        const result = await deps.wallet!.create();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );

    server.registerTool(
      "wallet_deploy",
      {
        title: "Deploy the funded local wallet",
        description:
          "Deploy the local Sepolia account after the user funds its public " +
          "address. This sends a deployment transaction but does not pay anyone.",
        inputSchema: {},
      },
      async () => {
        const result = await deps.wallet!.deploy();
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      },
    );
  }

  if (deps.pay) {
    server.registerTool(
      "pay",
      {
        title: "Pay privately",
        description:
          "Pay a Starknet address out of the shielded STRK20 pool. The payee " +
          "sees an amount arrive but cannot tell which depositor sent it. The " +
          "amount itself is visible on-chain. Use wallet_status first. The " +
          "local macOS Keychain holds the spending key.",
        inputSchema: {
          to: z.string().describe("Recipient Starknet address, 0x-prefixed."),
          amount: z
            .string()
            .describe('Amount in STRK as a decimal string, e.g. "1.5".'),
        },
        outputSchema: {
          transactionHash: z.string(),
          recipient: z.string(),
          amountWei: z.string().describe("The amount actually sent, in wei."),
          explorerUrl: z.string(),
        },
      },
      async ({ to, amount }) => {
        const result = await pay({ to, amount }, deps.pay);
        return {
          content: [
            {
              type: "text" as const,
              text: `Paid ${amount} STRK to ${result.recipient}. ${result.explorerUrl}`,
            },
          ],
          structuredContent: result,
        };
      },
    );
  }

  return server;
}

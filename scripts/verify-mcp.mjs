/**
 * Drive the hosted MCP endpoint with a real MCP client.
 *
 * The unit tests exercise the server in memory; this proves the HTTP endpoint
 * a client would actually connect to is really speaking the protocol.
 *
 *   npm run dev                     # in one terminal
 *   node scripts/verify-mcp.mjs     # in another
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://127.0.0.1:3000/api/mcp";

const client = new Client({ name: "tony-strk-verify", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(new URL(url)));

console.log(`connected  ${url}`);

const { tools } = await client.listTools();
console.log(`tools/list ${tools.map((t) => t.name).join(", ") || "(none)"}`);

// No Tor circuit is configured on the hosted server, so this must come back as
// a refusal. A success here would mean the guard failed open and the request
// went out directly.
const result = await client.callTool({
  name: "browse",
  arguments: { url: "https://check.torproject.org/api/ip" },
});

const text = result.content?.[0]?.text ?? "";
console.log(`tools/call isError=${result.isError === true}`);
console.log(`           ${text.split("\n")[0]}`);

if (result.isError !== true) {
  console.error("\nFAIL: browse succeeded without a Tor circuit.");
  process.exit(1);
}

console.log("\nOK: the endpoint speaks MCP, and browse failed closed.");
await client.close();

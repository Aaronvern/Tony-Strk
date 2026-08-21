/**
 * Drive the MCP server with a real MCP client.
 *
 * The unit tests exercise the server in memory; this proves the HTTP endpoint
 * a client would actually connect to is really speaking the protocol, and that
 * browse traverses the configured Tor circuit.
 *
 *   npm run start:server            # in one terminal
 *   npm run verify:mcp              # in another
 *   MCP_URL=https://host/mcp npm run verify:mcp
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://127.0.0.1:8787/mcp";
const base = new URL(url);

const health = await fetch(new URL("/healthz", base)).then((r) => r.json());
const torConfigured = health.torProxy === "configured";
console.log(`health     ${JSON.stringify(health)}`);

const client = new Client({ name: "tony-strk-verify", version: "0.1.0" });
await client.connect(new StreamableHTTPClientTransport(base));
console.log(`connected  ${url}`);

const { tools } = await client.listTools();
console.log(`tools/list ${tools.map((t) => t.name).join(", ") || "(none)"}`);

const result = await client.callTool({
  name: "browse",
  arguments: { url: "https://check.torproject.org/api/ip" },
});
const text = result.content?.[0]?.text ?? "";
console.log(`tools/call isError=${result.isError === true}`);
console.log(`           ${text.split("\n")[0].slice(0, 160)}`);

await client.close();

if (!torConfigured || result.isError === true) {
  console.error("\nFAIL: browse requires a configured Tor circuit.");
  process.exit(1);
}

if (!text.includes('"IsTor":true')) {
  console.error(`\nFAIL: the request did not exit through Tor (${text}).`);
  process.exit(1);
}

console.log("\nOK: browsed through Tor. The destination reported IsTor: true.");

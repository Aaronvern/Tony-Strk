/**
 * Drive the MCP server with a real MCP client.
 *
 * The unit tests exercise the server in memory; this proves the HTTP endpoint
 * a client would actually connect to is really speaking the protocol, and that
 * browse behaves correctly for however the server is configured:
 *
 *   with a Tor circuit  -> the destination reports it saw a Tor exit
 *   without one         -> browse refuses rather than leaking the caller's IP
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

if (!torConfigured) {
  // No circuit: the only acceptable outcome is a refusal.
  if (result.isError !== true) {
    console.error("\nFAIL: browse succeeded without a Tor circuit.");
    process.exit(1);
  }
  console.log("\nOK: the endpoint speaks MCP, and browse failed closed.");
  process.exit(0);
}

// A circuit is configured, so the destination itself must confirm it saw Tor.
if (result.isError === true) {
  console.error("\nFAIL: a Tor circuit is configured but browse errored.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(text);
} catch {
  console.error("\nFAIL: could not parse the Tor Project's response.");
  process.exit(1);
}

if (report.IsTor !== true) {
  console.error(`\nFAIL: the request did not exit through Tor (${text}).`);
  process.exit(1);
}

console.log(`\nOK: browsed through Tor. The destination saw ${report.IP}.`);

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const usage = "Usage: npm run verify:x402 -- --url <public-paid-url> [--live]";

function parseArgs(argv) {
  let target;
  let live = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--live") {
      live = true;
    } else if (argument === "--url") {
      target = argv[++index];
    } else if (argument.startsWith("--url=")) {
      target = argument.slice("--url=".length);
    } else {
      throw new Error(`Unknown argument ${JSON.stringify(argument)}. ${usage}`);
    }
  }

  if (!target) throw new Error(`--url is required. ${usage}`);
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new Error(`--url must be an absolute HTTP(S) URL. ${usage}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`--url must be an absolute HTTP(S) URL. ${usage}`);
  }

  return { target: url.toString(), live };
}

const textFrom = (result) =>
  result?.content?.find((part) => part.type === "text")?.text ?? "";

const jsonForLog = (value) => {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const { target, live } = parseArgs(process.argv.slice(2));
const mcpUrl = process.env.MCP_URL ?? "http://127.0.0.1:8787/mcp";
const mcp = new URL(mcpUrl);
let client;

try {
  const healthResponse = await fetch(new URL("/healthz", mcp));
  if (!healthResponse.ok) {
    throw new Error(`/healthz returned HTTP ${healthResponse.status}`);
  }
  const health = await healthResponse.json();
  console.log(`health     ${jsonForLog(health)}`);
  if (health?.ok !== true) {
    throw new Error("the MCP server health check did not report ok=true");
  }
  if (health.torProxy !== "configured") {
    throw new Error("the MCP server does not report a configured Tor proxy");
  }

  client = new Client({ name: "tony-strk-x402-verify", version: "0.1.0" });
  await client.connect(new StreamableHTTPClientTransport(mcp));
  console.log(`connected  ${mcp}`);

  const { tools } = await client.listTools();
  const names = tools.map((tool) => tool.name);
  console.log(`tools/list ${names.join(", ") || "(none)"}`);
  if (!names.includes("browse")) throw new Error("the MCP server does not advertise browse");
  if (!names.includes("pay_paywall")) {
    throw new Error("the MCP server does not advertise pay_paywall");
  }
  if (!names.includes("wallet_status")) {
    throw new Error("the MCP server does not advertise wallet_status");
  }

  const torResult = await client.callTool({
    name: "browse",
    arguments: { url: "https://check.torproject.org/api/ip" },
  });
  const torText = textFrom(torResult);
  console.log(`tor        isError=${torResult.isError === true} ${torText.split("\n")[0].slice(0, 160)}`);
  if (torResult.isError === true || !/"IsTor"\s*:\s*true/.test(torText)) {
    throw new Error(`the Tor check did not report IsTor=true (${torText})`);
  }

  const walletResult = await client.callTool({
    name: "wallet_status",
    arguments: {},
  });
  if (walletResult.isError === true) {
    throw new Error(`wallet_status failed: ${textFrom(walletResult)}`);
  }
  console.log(`wallet_status ${jsonForLog(walletResult.structuredContent ?? textFrom(walletResult))}`);

  if (!live) {
    console.log("\nOK: x402 preflight passed. No payment attempted; add --live to spend test STRK.");
  } else {
    const result = await client.callTool({
      name: "pay_paywall",
      arguments: { url: target },
    });
    const structured = result.structuredContent ?? {};
    const protectedText = typeof structured.text === "string" ? structured.text : "";
    if (
      result.isError === true ||
      structured.paid !== true ||
      structured.status !== 200 ||
      typeof structured.transactionHash !== "string" ||
      structured.transactionHash.length === 0 ||
      typeof structured.explorerUrl !== "string" ||
      structured.explorerUrl.length === 0 ||
      protectedText.trim().length === 0
    ) {
      throw new Error(`live pay_paywall did not return a paid HTTP 200 response: ${jsonForLog(structured)}`);
    }
    console.log(`pay_paywall paid=${structured.paid} status=${structured.status}`);
    console.log(`transactionHash ${structured.transactionHash}`);
    console.log(`explorerUrl     ${structured.explorerUrl}`);
    console.log(`protected       ${protectedText.split("\n")[0].slice(0, 160)}`);
    console.log("\nOK: live x402 payment settled and protected content was returned.");
  }
} catch (error) {
  console.error(`\nFAIL: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
}

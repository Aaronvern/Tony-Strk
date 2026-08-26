import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

test("x402 verifier stops when health is not explicitly ok", async (t) => {
  let mcpRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === "/healthz") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ ok: false, torProxy: "configured" }));
      return;
    }
    mcpRequests++;
    response.statusCode = 500;
    response.end();
  }).listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const mcpUrl = `http://127.0.0.1:${address.port}/mcp`;
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("../verify-x402.mjs", import.meta.url)), "--url", "https://PUBLIC_HOST/article/agent-privacy"],
    { env: { PATH: process.env.PATH, MCP_URL: mcpUrl }, stdio: ["ignore", "pipe", "pipe"] },
  );
  const [stdout, stderr] = await Promise.all([
    new Promise<string>((resolve) => {
      let output = "";
      child.stdout.on("data", (chunk) => { output += chunk; });
      child.stdout.on("end", () => resolve(output));
    }),
    new Promise<string>((resolve) => {
      let output = "";
      child.stderr.on("data", (chunk) => { output += chunk; });
      child.stderr.on("end", () => resolve(output));
    }),
  ]);
  const [code] = await once(child, "close");

  assert.equal(code, 1);
  assert.match(`${stdout}\n${stderr}`, /health|ok=true/i);
  assert.equal(mcpRequests, 0, "must stop before connecting to MCP after an unhealthy response");
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the landing page presents the verified Mainnet MCP product and links to setup", async () => {
  const page = await readFile(new URL("../app/page.js", import.meta.url), "utf8");

  assert.equal((page.match(/tony-strk-armour-assembly-blueprint\.png/g) || []).length, 1);
  assert.match(page, /technical-dissect/);
  assert.match(page, /tony-strk-helmet-blueprint\.png/);
  assert.match(page, /tony-strk-reactor-blueprint\.png/);
  assert.match(page, /local MCP.*Tor.*STRK20 x402/i);
  assert.match(page, /working end to end/i);
  assert.match(page, /three Mainnet/i);
  assert.match(page, /MCP server — active local tool/i);
  assert.match(page, /href=["']\/setup["']/i);
  assert.match(page, /href=["']\/demo\/tony-strk-demo\.mp4["']/i);
  assert.match(page, /STRK20.*x402.*settlement/i);
  assert.doesNotMatch(page, /prototype/i);
  assert.doesNotMatch(page, /testnet-only/i);
  assert.doesNotMatch(page, /does not invoke the MCP server/i);
  assert.doesNotMatch(page, /STRK20, x402, and wallet actions remain future work/i);
  assert.doesNotMatch(page, /separately runnable local MCP server/i);
});

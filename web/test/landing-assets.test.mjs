import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the landing page has one dissected torso plate and three selected blueprint assets", async () => {
  const page = await readFile(new URL("../app/page.js", import.meta.url), "utf8");

  assert.equal((page.match(/tony-strk-armour-assembly-blueprint\.png/g) || []).length, 1);
  assert.match(page, /technical-dissect/);
  assert.match(page, /tony-strk-helmet-blueprint\.png/);
  assert.match(page, /tony-strk-reactor-blueprint\.png/);
  assert.match(page, /local Web2 route-mapping prototype/i);
  assert.match(page, /Prototype scope/i);
  assert.match(page, /does not invoke the MCP server/i);
  assert.match(page, /MCP server — local tool/i);
  assert.match(page, /STRK20, x402, and wallet actions remain future work/i);
});

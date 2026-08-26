import assert from "node:assert/strict";
import test from "node:test";

import { buildRoute } from "../src/route.js";

test("buildRoute describes the active MCP and STRK20 payment path", () => {
  const route = buildRoute("https://example.com/research");

  assert.equal(route.target, "example.com");
  assert.deepEqual(route.steps.map(({ label }) => label), [
    "Route input",
    "MCP browse through Tor",
    "x402 paywall (when configured)",
    "STRK20 settlement",
  ]);
  assert.equal(route.payment, "STRK20 x402 settlement is available through the local MCP.");
});

test("buildRoute rejects non-http input", () => {
  assert.throws(() => buildRoute("file:///etc/passwd"), /http/i);
});

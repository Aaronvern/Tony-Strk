import assert from "node:assert/strict";
import test from "node:test";

import { buildRoute } from "../src/route.js";

test("buildRoute describes the Web2 privacy path without claiming STRK20", () => {
  const route = buildRoute("https://example.com/research");

  assert.equal(route.target, "example.com");
  assert.deepEqual(route.steps.map(({ label }) => label), [
    "Route input",
    "MCP server (planned)",
    "Isolated worker (planned)",
    "No execution today",
  ]);
  assert.equal(route.payment, "Not enabled in this demo");
});

test("buildRoute rejects non-http input", () => {
  assert.throws(() => buildRoute("file:///etc/passwd"), /http/i);
});

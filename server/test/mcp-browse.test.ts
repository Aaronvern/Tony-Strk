import test from "node:test";
import assert from "node:assert/strict";

import { browse } from "../src/tools/browse.ts";

test("browse refuses to fetch when no Tor proxy is configured", async () => {
  let attempted = false;
  const fetchImpl = () => {
    attempted = true;
    return new Response("leaked");
  };

  await assert.rejects(
    () => browse({ url: "https://example.com" }, { torProxy: "", fetchImpl }),
    /tor/i,
  );

  // The point of the guard: a missing proxy must not degrade into a direct
  // request, which would expose the caller's IP to the destination.
  assert.equal(attempted, false, "must not fall back to a direct request");
});

test("browse rejects non-http schemes even when a proxy is configured", async () => {
  let attempted = false;
  const fetchImpl = () => {
    attempted = true;
    return new Response("root:x:0:0:");
  };

  await assert.rejects(
    () =>
      browse(
        { url: "file:///etc/passwd" },
        { torProxy: "socks5://127.0.0.1:9050", fetchImpl },
      ),
    /http/i,
  );

  assert.equal(attempted, false, "must not read local files for the agent");
});

test("browse returns page text fetched through the configured proxy", async () => {
  const seen = {};
  const fetchImpl = (target, options) => {
    seen.target = target;
    seen.proxy = options?.proxy;
    return new Response("<html><body><h1>Hello</h1></body></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };

  const result = await browse(
    { url: "https://example.com/research" },
    { torProxy: "socks5://127.0.0.1:9050", fetchImpl },
  );

  assert.equal(seen.target, "https://example.com/research");
  assert.equal(
    seen.proxy,
    "socks5://127.0.0.1:9050",
    "the request must be routed through Tor, not sent directly",
  );
  assert.equal(result.status, 200);
  assert.match(result.text, /Hello/);
});

test("browse flags a 402 as a paywall rather than returning the page", async () => {
  const fetchImpl = () =>
    new Response("<html>Pay 5 STRK to read this</html>", { status: 402 });

  const result = await browse(
    { url: "https://paywalled.example/article" },
    { torProxy: "socks5://127.0.0.1:9050", fetchImpl },
  );

  // The agent needs to know it hit a paywall so it can decide whether to pay.
  // Handing back the paywall's HTML as if it were the article makes that
  // decision invisible.
  assert.equal(result.paymentRequired, true);
  assert.equal(result.status, 402);
});

import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { browse } from "../src/tools/browse.ts";
import { createServer } from "../src/mcp/server.ts";

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

test("browse rejects credential-bearing URLs before fetching", async () => {
  let attempted = false;

  await assert.rejects(
    () =>
      browse(
        { url: "https://token@example.com/article" },
        {
          torProxy: "socks5://127.0.0.1:9050",
          fetchImpl: () => {
            attempted = true;
            return new Response("leaked");
          },
        },
      ),
    /credentials/i,
  );

  assert.equal(attempted, false, "must reject credentials before the request");
});

test("browse rejects redirects to private addresses", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      browse(
        { url: "https://8.8.8.8/article" },
        {
          torProxy: "socks5://127.0.0.1:9050",
          fetchImpl: () => {
            attempts++;
            return new Response(null, {
              status: 302,
              headers: { location: "http://127.0.0.1:8787/private" },
            });
          },
        },
      ),
    /public/i,
  );

  assert.equal(attempts, 1, "must not fetch the rejected redirect target");
});

test("browse rejects private addresses before fetching", async () => {
  let attempted = false;

  await assert.rejects(
    () =>
      browse(
        { url: "http://127.0.0.1:8787" },
        {
          torProxy: "socks5://127.0.0.1:9050",
          fetchImpl: () => {
            attempted = true;
            return new Response("leaked");
          },
        },
      ),
    /public/i,
  );

  assert.equal(attempted, false, "must reject private targets before the request");
});

test("browse rejects Alibaba metadata addresses before fetching", async () => {
  let attempted = false;

  await assert.rejects(
    () =>
      browse(
        { url: "http://100.100.100.200/latest/meta-data" },
        {
          torProxy: "socks5://127.0.0.1:9050",
          fetchImpl: () => {
            attempted = true;
            return new Response("leaked");
          },
        },
      ),
    /public/i,
  );

  assert.equal(attempted, false, "must reject metadata before the request");
});

test("browse rejects non-public IPv4 hidden in IPv6 translation prefixes", async () => {
  const targets = [
    "http://[64:ff9b::7f00:1]/",
    "http://[64:ff9b::a9fe:a9fe]/",
    "http://[::ffff:0:7f00:1]/",
    "http://[::ffff:0:a9fe:a9fe]/",
  ];

  for (const url of targets) {
    let attempted = false;
    await assert.rejects(
      () =>
        browse(
          { url },
          {
            torProxy: "socks5://127.0.0.1:9050",
            fetchImpl: () => {
              attempted = true;
              return new Response("leaked");
            },
          },
        ),
      /public/i,
    );
    assert.equal(attempted, false, `must reject translated private target ${url}`);
  }
});

test("browse allows public IPv4 in IPv6 translation prefixes", async () => {
  for (const url of [
    "http://[64:ff9b::808:808]/",
    "http://[::ffff:0:808:808]/",
  ]) {
    const result = await browse(
      { url },
      {
        torProxy: "socks5://127.0.0.1:9050",
        fetchImpl: () => new Response("public"),
      },
    );
    assert.equal(result.text, "public");
  }
});

test("browse rejects a response larger than 1 MiB", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });

  await assert.rejects(
    () =>
      browse(
        { url: "https://8.8.8.8/article" },
        {
          torProxy: "socks5://127.0.0.1:9050",
          fetchImpl: () =>
            new Response(stream, { headers: { "content-length": "1048577" } }),
        },
      ),
    /1 MiB/i,
  );

  assert.equal(cancelled, true, "must stop a sender with an oversized declaration");
});

test("browse cancels an oversized response stream", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024 + 1));
    },
    cancel() {
      cancelled = true;
    },
  });

  await assert.rejects(
    () =>
      browse(
        { url: "https://8.8.8.8/article" },
        {
          torProxy: "socks5://127.0.0.1:9050",
          fetchImpl: () => new Response(stream),
        },
      ),
    /1 MiB/i,
  );

  assert.equal(cancelled, true, "must stop an oversized sender");
});

test("browse cancels a redirect response before following it", async () => {
  let attempts = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
  });

  const result = await browse(
    { url: "https://8.8.8.8/old" },
    {
      torProxy: "socks5://127.0.0.1:9050",
      fetchImpl: () => {
        attempts++;
        if (attempts === 1) {
          return new Response(stream, {
            status: 302,
            headers: { location: "https://1.1.1.1/new" },
          });
        }
        assert.equal(cancelled, true, "redirect body must be cancelled first");
        return new Response("followed");
      },
    },
  );

  assert.equal(result.text, "followed");
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
    { url: "https://example.com/article" },
    { torProxy: "socks5://127.0.0.1:9050", fetchImpl },
  );

  // The agent needs to know it hit a paywall so it can decide whether to pay.
  // Handing back the paywall's HTML as if it were the article makes that
  // decision invisible.
  assert.equal(result.paymentRequired, true);
  assert.equal(result.status, 402);
});

test("browse returns readable text, not markup", async () => {
  const page = `<!doctype html><html><head><title>  The Article  </title>
    <style>body{color:red}</style><script>console.log("tracker")</script></head>
    <body><h1>Headline</h1><p>First paragraph &amp; more.</p>
    <script>analytics()</script><p>Second paragraph.</p></body></html>`;

  const result = await browse(
    { url: "https://example.com/a" },
    {
      torProxy: "socks5://127.0.0.1:9050",
      fetchImpl: () =>
        new Response(page, { headers: { "content-type": "text/html" } }),
    },
  );

  assert.equal(result.title, "The Article");
  assert.match(result.text, /Headline/);
  assert.match(result.text, /First paragraph & more\./);
  assert.match(result.text, /Second paragraph\./);
  // Script and style bodies are noise that costs the agent tokens.
  assert.doesNotMatch(result.text, /tracker|analytics|color:red/);
  assert.doesNotMatch(result.text, /</, "markup should be stripped");
});

test("browse can return the raw markup when asked", async () => {
  const page = "<html><body><p>Hi</p></body></html>";

  const result = await browse(
    { url: "https://example.com/a", raw: true },
    {
      torProxy: "socks5://127.0.0.1:9050",
      fetchImpl: () => new Response(page),
    },
  );

  assert.equal(result.text, page);
});

test("browse retains only the selected x402 response headers internally", async () => {
  const result = await browse(
    { url: "https://example.com/a" },
    {
      torProxy: "socks5://127.0.0.1:9050",
      fetchImpl: () => new Response("paid", {
        headers: {
          "PAYMENT-REQUIRED": "required-header",
          "PAYMENT-RESPONSE": "response-header",
          authorization: "do-not-retain",
          "X-Access-Token": "do-not-retain-either",
        },
      }),
    },
  );

  assert.equal(result.paymentRequiredHeader, "required-header");
  assert.equal(result.paymentResponseHeader, "response-header");
  assert.equal("authorization" in result, false);
  assert.equal("headers" in result, false);
});

test("the public MCP browse result strips internal x402 headers", async () => {
  const server = createServer({
    torProxy: "socks5://127.0.0.1:9050",
    fetchImpl: () => new Response("paid", {
      headers: {
        "PAYMENT-REQUIRED": "required-header",
        "PAYMENT-RESPONSE": "response-header",
        authorization: "do-not-retain",
      },
    }),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "browse-boundary-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const result = await client.callTool({
    name: "browse",
    arguments: { url: "https://example.com/a" },
  });
  const structured = result.structuredContent as Record<string, unknown>;
  assert.equal(structured.paymentRequiredHeader, undefined);
  assert.equal(structured.paymentResponseHeader, undefined);
  assert.equal(structured.authorization, undefined);
  assert.equal(structured.headers, undefined);
  await client.close();
  await server.close();
});

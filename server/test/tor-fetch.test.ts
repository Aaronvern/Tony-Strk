import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import type { AddressInfo } from "node:net";

import { createTorFetch } from "../src/tor/tor-fetch.ts";

/**
 * A minimal SOCKS5 proxy - just enough of RFC 1928 to prove that traffic
 * really is going through it rather than around it. Records every target it
 * was asked to connect to.
 */
function startSocks5(seen: string[]) {
  return net.createServer((client) => {
    // One buffering handler rather than chained `once` listeners: the greeting
    // and the connect request can land in the same segment, and a `once`
    // handler that has already fired drops whatever arrives before the next
    // one is attached.
    let stage: "greeting" | "request" | "piping" = "greeting";
    let buf = Buffer.alloc(0);

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);

      if (stage === "greeting") {
        if (buf.length < 2) return;
        const methods = buf[1];
        if (buf.length < 2 + methods) return;
        buf = buf.subarray(2 + methods);
        stage = "request";
        client.write(Buffer.from([0x05, 0x00])); // no authentication
      }

      if (stage === "request") {
        if (buf.length < 5) return;
        const atyp = buf[3];
        let host: string;
        let offset: number;

        if (atyp === 0x01) {
          if (buf.length < 10) return;
          host = `${buf[4]}.${buf[5]}.${buf[6]}.${buf[7]}`;
          offset = 8;
        } else if (atyp === 0x03) {
          const len = buf[4];
          if (buf.length < 5 + len + 2) return;
          host = buf.subarray(5, 5 + len).toString("utf8");
          offset = 5 + len;
        } else {
          client.destroy();
          return;
        }

        const port = buf.readUInt16BE(offset);
        const rest = buf.subarray(offset + 2);
        stage = "piping";
        seen.push(`${host}:${port}`);

        const upstream = net.connect(port, host, () => {
          client.write(Buffer.from([0x05, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          client.removeListener("data", onData);
          if (rest.length) upstream.write(rest);
          client.pipe(upstream).pipe(client);
        });
        upstream.on("error", () => client.destroy());
      }
    };

    client.on("data", onData);
    client.on("error", () => {});
  });
}

/** listen() is asynchronous - address() is null until it has bound. */
function listen(server: net.Server | http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port),
    );
  });
}

test("torFetch routes the request through the SOCKS proxy", async (t) => {
  const origin = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("hello from the origin");
  });
  t.after(() => new Promise((r) => origin.close(r)));
  const originPort = await listen(origin);

  const seen: string[] = [];
  const socks = startSocks5(seen);
  t.after(() => new Promise((r) => socks.close(r)));
  const socksPort = await listen(socks);

  const torFetch = createTorFetch();
  t.after(() => torFetch.close());
  const response = await torFetch(`http://127.0.0.1:${originPort}/`, {
    proxy: `socks5://127.0.0.1:${socksPort}`,
  });
  const body = await response.text();

  assert.equal(body, "hello from the origin");
  assert.deepEqual(
    seen,
    [`127.0.0.1:${originPort}`],
    "the proxy must have been asked to make the connection",
  );
});

test("torFetch fails instead of connecting directly when the proxy is down", async (t) => {
  const origin = http.createServer((_req, res) => res.end("leaked"));
  t.after(() => new Promise((r) => origin.close(r)));
  const originPort = await listen(origin);

  // Port 1 is reserved and nothing listens there, so the SOCKS connect fails.
  const torFetch = createTorFetch();
  t.after(() => torFetch.close());

  await assert.rejects(() =>
    torFetch(`http://127.0.0.1:${originPort}/`, {
      proxy: "socks5://127.0.0.1:1",
    }),
  );
});

test("torFetch preserves manual redirects through the SOCKS proxy", async (t) => {
  const origin = http.createServer((_req, res) => {
    res.writeHead(302, { location: "http://127.0.0.1/private" });
    res.end();
  });
  t.after(() => new Promise((r) => origin.close(r)));
  const originPort = await listen(origin);

  const socks = startSocks5([]);
  t.after(() => new Promise((r) => socks.close(r)));
  const socksPort = await listen(socks);

  const torFetch = createTorFetch();
  t.after(() => torFetch.close());
  const response = await torFetch(`http://127.0.0.1:${originPort}/`, {
    proxy: `socks5://127.0.0.1:${socksPort}`,
    redirect: "manual",
  });

  assert.equal(response.status, 302, "browse must validate the redirect itself");
  assert.equal(response.headers.get("location"), "http://127.0.0.1/private");
});

test("torFetch connects SOCKS to the vetted address instead of the hostname", async (t) => {
  const origin = http.createServer((_req, res) => res.end("bound"));
  t.after(() => new Promise((r) => origin.close(r)));
  const originPort = await listen(origin);

  const seen: string[] = [];
  const socks = startSocks5(seen);
  t.after(() => new Promise((r) => socks.close(r)));
  const socksPort = await listen(socks);

  const torFetch = createTorFetch();
  t.after(() => torFetch.close());
  const response = await torFetch(`http://127.0.0.2:${originPort}/`, {
    proxy: `socks5://127.0.0.1:${socksPort}`,
    address: "127.0.0.1",
  });

  assert.equal(await response.text(), "bound");
  assert.deepEqual(seen, [`127.0.0.1:${originPort}`]);
});

test("torFetch bounds agents created for attacker-selected addresses", async (t) => {
  const origin = http.createServer((_req, res) => res.end("bounded"));
  t.after(() => new Promise((r) => origin.close(r)));
  const originPort = await listen(origin);

  const seen: string[] = [];
  const socks = startSocks5(seen);
  t.after(() => new Promise((r) => socks.close(r)));
  const socksPort = await listen(socks);

  const torFetch = createTorFetch();
  t.after(() => torFetch.close());
  const proxy = `socks5://127.0.0.1:${socksPort}`;
  const target = `http://cache.test:${originPort}/`;

  const addresses = Array.from({ length: 33 }, (_, i) =>
    [..."localhost"].map((letter, bit) => i & (1 << bit) ? letter.toUpperCase() : letter).join("")
  );
  for (const address of addresses) {
    const response = await torFetch(target, { proxy, address });
    assert.equal(await response.text(), "bounded");
  }
  const response = await torFetch(target, { proxy, address: addresses[0] });
  assert.equal(await response.text(), "bounded");

  assert.equal(seen.length, 34, "the oldest address-specific agent must be evicted");
});

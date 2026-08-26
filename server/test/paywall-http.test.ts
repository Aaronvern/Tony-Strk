import test from "node:test";
import assert from "node:assert/strict";
import http, { type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { createMerchantApp } from "../../merchant/src/app.ts";
import { resourceHash } from "../../merchant/src/catalog.ts";
import { PAYWALL_PAID, type ChainReceipt } from "../../merchant/src/receipt.ts";
import { createApp } from "../src/app.ts";

const ANONYMIZER = "0x767a1daf3503e51882e88f6d4f1ef510517895ed0c91f8847bbf85eb9d389d";
const ASSET = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";
const PAY_TO = "0x4d45524348414e54";
const PAYER = "0x077f1679";
const TX_HASH = "0xabc123";
const PRICE = 50_000_000_000_000_000n;
const NETWORK = "starknet:SN_SEPOLIA";
const PUBLIC_URL = "https://8.8.8.8/article/agent-privacy";

const close = (server: Server) =>
  new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

function fetchLocalMerchant(
  target: string,
  merchantPort: number,
  options: { headers?: Record<string, string> },
): Promise<Response> {
  const publicTarget = new URL(target);
  const headers = Object.fromEntries(new Headers(options.headers));
  headers.host = publicTarget.host;
  headers["x-forwarded-proto"] = publicTarget.protocol.slice(0, -1);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: merchantPort,
        path: `${publicTarget.pathname}${publicTarget.search}`,
        headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const responseHeaders = new Headers();
          for (const [name, value] of Object.entries(response.headers)) {
            if (typeof value === "string") responseHeaders.set(name, value);
            else if (Array.isArray(value)) responseHeaders.set(name, value.join(", "));
          }
          resolve(new Response(Buffer.concat(chunks), {
            status: response.statusCode,
            headers: responseHeaders,
          }));
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

test("a real MCP client pays an HTTP x402 merchant and receives protected content", async (t) => {
  const receipt: ChainReceipt = {
    transaction_hash: TX_HASH,
    execution_status: "SUCCEEDED",
    finality_status: "ACCEPTED_ON_L2",
    events: [
      {
        from_address: ANONYMIZER,
        keys: [PAYWALL_PAID, PAY_TO, resourceHash("agent-privacy")],
        data: [ASSET, `0x${PRICE.toString(16)}`],
      },
    ],
  };

  const merchant = createMerchantApp({
    payTo: PAY_TO,
    anonymizer: ANONYMIZER,
    asset: ASSET,
    network: NETWORK,
    explorerBase: "https://sepolia.voyager.online",
    fetchReceipt: async () => receipt,
    trustProxy: 1,
  }).listen(0);
  const merchantPort = (merchant.address() as AddressInfo).port;

  const submitted: unknown[][] = [];
  const wallet = {
    strk20InvokeTransaction: async (actions: unknown[]) => {
      submitted.push(actions);
      return { transaction_hash: TX_HASH };
    },
  };

  const mcp = createApp({
    torProxy: "socks5://127.0.0.1:9050",
    fetchImpl: async (target, options) => {
      const publicTarget = new URL(target);
      assert.equal(publicTarget.toString(), PUBLIC_URL);
      return fetchLocalMerchant(target, merchantPort, options);
    },
    settle: {
      getWallet: async () => wallet,
      getPayerAddress: async () => PAYER,
      trustedAnonymizers: [ANONYMIZER],
      maxPrice: PRICE,
      asset: ASSET,
      explorerBase: "https://sepolia.starkscan.co",
    },
  }).listen(0);
  const mcpPort = (mcp.address() as AddressInfo).port;

  const client = new Client({ name: "paywall-http-test", version: "0.0.0" });
  t.after(async () => {
    await client.close();
    await close(mcp);
    await close(merchant);
  });

  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${mcpPort}/mcp`)),
  );

  const result = await client.callTool({
    name: "pay_paywall",
    arguments: { url: PUBLIC_URL },
  });

  assert.equal(result.structuredContent?.paid, true);
  assert.equal(submitted.length, 1);
  assert.deepEqual(
    (submitted[0] as Array<{ type: string }>).map((action) => action.type),
    ["withdraw", "invoke"],
  );
  assert.match(result.content?.[0]?.type === "text" ? result.content[0].text : "", /Why your agent leaks more than you do/);
});

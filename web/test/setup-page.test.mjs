import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/setup/page.js", import.meta.url);

test("setup page documents the complete Sepolia wallet and x402 path", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.equal((page.match(/<h1\b/g) || []).length, 1);
  assert.match(page, /<main\b/);
  assert.match(page, /<ol\b/);
  for (const text of [
    "Node 24",
    "Tor",
    "AVNU",
    "wallet_shield",
    "<code>pay</code>",
    "12 blocks",
    "PAYWALL_ANONYMIZER_ADDRESS",
    "Cloudflare Quick Tunnel",
    "cloudflared tunnel --url http://127.0.0.1:8788",
    "MERCHANT_TRUST_PROXY=1",
    "codex mcp add",
    "claude mcp add",
    "verify:x402",
    "--live",
    "Sepolia",
    "testnet only",
  ]) {
    assert.match(page, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.doesNotMatch(page, /['"]use client['"]/i);
  assert.doesNotMatch(page, /\bfetch\s*\(/i);
  assert.doesNotMatch(page, /0x[a-f\d]{16,}/i);
});

test("setup page uses scoped responsive styles and accessible code labels", async () => {
  const [page, css] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(new URL("../app/setup/setup.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /setup\.module\.css/);
  assert.match(page, /aria-label=/i);
  assert.match(page, /<pre\b[\s\S]*<code\b/i);
  assert.match(page, /<details\b[\s\S]*<summary\b/i);
  assert.match(css, /@media/);
  assert.match(css, /:focus-visible/);
});

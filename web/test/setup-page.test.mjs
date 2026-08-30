import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("../app/setup/page.js", import.meta.url);

test("setup page documents both the sponsored and mainnet public-relay x402 paths", async () => {
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
    "Mainnet",
    "NETWORK=mainnet",
    "PUBLIC_PRIVACY_RELAY=true",
    "PUBLIC_PRIVACY_RELAY_MAX_FEE",
    "PUBLIC_PRIVACY_RELAY_REFILL",
    "public on-chain",
    "127.0.0.1:8787/mcp",
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

test("setup page points verification at a paid article resource", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /https:\/\/<your-tunnel-host>\/article\/agent-privacy/);
  assert.doesNotMatch(page, /PUBLIC_HTTPS_MERCHANT_URL/);
  assert.match(page, /paid resource|paid article|article\/agent-privacy/i);
});

test("setup page makes the helper environment usable for both services", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /gitignored[^.]*\.env|\.env[^\n]*gitignored/i);
  assert.match(page, /export|place .*\.env/i);
  assert.match(page, /same[\s\S]*PAYWALL_ANONYMIZER_ADDRESS/i);
  assert.match(page, /server and merchant/i);
});

test("setup page fences off the legacy payer's raw-key requirements", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /legacy\/manual maintenance|manual.*legacy|legacy.*manual/i);
  for (const name of [
    "ACCOUNT_ADDRESS",
    "ACCOUNT_PRIVATE_KEY",
    "AVNU_API_KEY",
    "HELPER_ADDRESS",
    "POOL_ADDRESS",
  ]) {
    assert.match(page, new RegExp(name));
  }
  assert.match(page, /Keychain[^.\n]*(?:does not|not).*provide|not[^.\n]*Keychain[^.\n]*provide/i);
  assert.match(page, /recommended[^.\n]*MCP verifier|MCP verifier[^.\n]*recommended/i);
});

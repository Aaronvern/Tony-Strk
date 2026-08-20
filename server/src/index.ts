import { createApp } from "./app.ts";

/**
 * Node's global fetch has no SOCKS support, and it ignores options it doesn't
 * recognise. Handing it `{ proxy }` would therefore make an ordinary direct
 * request while the caller believed it was on a Tor circuit, which is the one
 * failure this whole tool exists to prevent. Until a real SOCKS dispatcher is
 * wired up, refuse loudly instead.
 */
function torFetch(_target: string, { proxy }: { proxy: string }): never {
  throw new Error(
    `Tor egress is not wired up yet (configured proxy: ${proxy}). ` +
      "Refusing rather than falling back to a direct request.",
  );
}

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";

// Binding beyond localhost turns off the SDK's automatic DNS rebinding
// protection, so the deployment has to say which hostnames it answers to.
const allowedHosts = process.env.MCP_ALLOWED_HOSTS?.split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const app = createApp(
  {
    torProxy: process.env.TOR_SOCKS_PROXY ?? "",
    fetchImpl: torFetch,
  },
  { host, allowedHosts },
);

app.listen(port, host, () => {
  console.log(`Tony Strk MCP server on http://${host}:${port}/mcp`);
  console.log(
    process.env.TOR_SOCKS_PROXY
      ? `Tor proxy configured: ${process.env.TOR_SOCKS_PROXY}`
      : "No Tor proxy configured - browse will refuse, by design.",
  );
});

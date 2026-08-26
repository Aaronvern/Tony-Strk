const steps = [
  ["01", "Route input", "The browser validates a public HTTP(S) destination locally."],
  ["02", "MCP browse through Tor", "The local MCP server fetches the public destination through the configured Tor SOCKS proxy."],
  ["03", "x402 paywall (when configured)", "The MCP can inspect canonical payment terms and pass them to the configured payer."],
  ["04", "STRK20 settlement", "The wallet withdraws to the trusted anonymizer, invokes it, and retries with the receipt."],
];

export function buildRoute(value) {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Use an HTTP or HTTPS URL.');
  }

  return {
    target: url.hostname,
    steps: steps.map(([number, label, detail]) => ({ number, label, detail })),
    payment: 'STRK20 x402 settlement is available through the local MCP.',
  };
}

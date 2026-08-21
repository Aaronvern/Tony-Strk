const steps = [
  ["01", "Route input", "The browser validates a public HTTP(S) destination locally."],
  ["02", "MCP browse (separate)", "The local MCP tool is separately runnable; the landing page does not invoke it."],
  ["03", "Isolated worker (when run)", "With Obscura and Tor configured, the MCP tool creates one short-lived browser context."],
  ["04", "Optional OHTTP", "Configured OHTTP uses relay and gateway services with no direct-worker fallback."],
];

export function buildRoute(value) {
  const url = new URL(value);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Use an HTTP or HTTPS URL.');
  }

  return {
    target: url.hostname,
    steps: steps.map(([number, label, detail]) => ({ number, label, detail })),
    payment: 'Not enabled in this demo',
  };
}

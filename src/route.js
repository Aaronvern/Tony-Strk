const steps = [
  ["01", "MCP request", "The client asks Tony Strk to fetch a public URL."],
  ["02", "Ephemeral worker", "A disposable session receives the request."],
  ["03", "Tor egress", "The destination sees an exit relay, not the client IP."],
  ["04", "Public web", "The response returns through the same isolated route."],
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

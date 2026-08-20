const steps = [
  ["01", "Route input", "The browser validates a public HTTP(S) destination locally."],
  ["02", "MCP server (planned)", "The finished product will accept a structured agent action through MCP."],
  ["03", "Isolated worker (planned)", "A future worker will execute the approved action in a short-lived session."],
  ["04", "No execution today", "This Web2 prototype maps the route only and does not contact the destination."],
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

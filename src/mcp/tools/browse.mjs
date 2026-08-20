/**
 * Fetch a URL on the agent's behalf through an anonymising proxy.
 *
 * The guard below is the whole point of the tool. Without a proxy this must
 * refuse: a direct request would show the destination the caller's real IP,
 * which is exactly what the caller used this tool to avoid.
 */
export async function browse(input, deps) {
  const { torProxy } = deps;

  const url = new URL(input.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Use an HTTP or HTTPS URL.");
  }

  if (!torProxy) {
    throw new Error(
      "Refusing to browse: no Tor proxy configured. Set TOR_SOCKS_PROXY. " +
        "Fetching directly would expose your IP to the destination.",
    );
  }

  const response = await deps.fetchImpl(url.toString(), { proxy: torProxy });
  const text = await response.text();

  return {
    url: url.toString(),
    status: response.status,
    paymentRequired: response.status === 402,
    text,
  };
}

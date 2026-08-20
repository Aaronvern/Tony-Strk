import { extractText } from "./extract.ts";

export interface BrowseInput {
  url: string;
  /** Return the response body untouched instead of readable text. */
  raw?: boolean;
}

export interface BrowseDeps {
  /** SOCKS address of the Tor circuit, e.g. socks5://127.0.0.1:9050. */
  torProxy: string;
  /** Injected so tests can drive the tool without a live circuit. */
  fetchImpl: (
    target: string,
    options: { proxy: string },
  ) => Response | Promise<Response>;
}

export interface BrowseResult {
  url: string;
  status: number;
  paymentRequired: boolean;
  title: string;
  text: string;
}

/**
 * Fetch a URL on the agent's behalf through an anonymising proxy.
 *
 * The guard below is the whole point of the tool. Without a proxy this must
 * refuse: a direct request would show the destination the caller's real IP,
 * which is exactly what the caller used this tool to avoid.
 */
export async function browse(
  input: BrowseInput,
  deps: BrowseDeps,
): Promise<BrowseResult> {
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
  const body = await response.text();

  // Only HTML gets reduced. Running the extractor over JSON or plain text
  // would mangle a response the caller can already read.
  const isHtml = (response.headers?.get("content-type") ?? "").includes("html");
  const extracted = !input.raw && isHtml ? extractText(body) : null;

  return {
    url: url.toString(),
    status: response.status,
    paymentRequired: response.status === 402,
    title: extracted?.title ?? "",
    text: extracted?.text ?? body,
  };
}

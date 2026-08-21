import { extractText } from "./extract.ts";
import { assertPublicHttpUrl } from "./url-policy.ts";

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 5;

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
    options: { proxy: string; redirect: "manual"; signal: AbortSignal },
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

  if (!torProxy) {
    throw new Error(
      "Refusing to browse: no Tor proxy configured. Set TOR_SOCKS_PROXY. " +
        "Fetching directly would expose your IP to the destination.",
    );
  }

  let url = await assertPublicHttpUrl(input.url);
  let response: Response;
  for (let redirects = 0; ; redirects++) {
    response = await deps.fetchImpl(url.toString(), {
      proxy: torProxy,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) break;
    if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects.");
    url = await assertPublicHttpUrl(new URL(location, url).toString());
  }
  const body = await readBody(response!);

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

async function readBody(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (contentLength > MAX_BODY_BYTES) throw new Error("Response body exceeds 1 MiB.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("Response body exceeds 1 MiB.");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

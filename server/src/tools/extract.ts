const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decode(value: string): string {
  return value
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

/**
 * Reduce an HTML page to what a reader would see.
 *
 * Deliberately simple: no DOM, no dependency. It drops script, style and
 * comment bodies, turns block boundaries into newlines, strips the remaining
 * tags and tidies whitespace. That is enough to save an agent from paying for
 * tens of kilobytes of markup, and it is honest about being approximate - it
 * does not run scripts, so a page that renders entirely client-side yields
 * little.
 */
export function extractText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1]).trim() : "";

  const text = decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
        " ",
      )
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}

import puppeteer from 'puppeteer-core';
import { validatePublicUrl } from '../mcp/url-policy.js';

const DEFAULT_CDP_URL = 'ws://127.0.0.1:9222';
const DEFAULT_TIMEOUT_MS = 15_000;

function workerError(code, message) {
  return Object.assign(new Error(message), { code });
}

export async function browseWithObscura({
  url,
  cdpUrl = DEFAULT_CDP_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  connect = puppeteer.connect,
  lookup,
}) {
  const target = await validatePublicUrl(url, lookup);
  let browser;
  let context;

  try {
    try {
      browser = await connect({ browserWSEndpoint: cdpUrl });
    } catch {
      throw workerError('WORKER_UNAVAILABLE', 'The isolated browser worker is unavailable.');
    }

    context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);
    try {
      await page.goto(target.href, { waitUntil: 'domcontentloaded' });
    } catch {
      throw workerError('NAVIGATION_FAILED', 'The destination could not be loaded by the isolated worker.');
    }

    const finalUrl = await validatePublicUrl(page.url(), lookup);
    return { url: finalUrl.href, text: await page.locator('body').innerText() };
  } finally {
    await context?.close();
    await browser?.disconnect();
  }
}

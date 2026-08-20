import assert from 'node:assert/strict';
import test from 'node:test';
import { browseWithObscura } from '../src/worker/obscura.js';

test('uses a fresh browser context and destroys it after a bounded browse', async () => {
  const calls = [];
  const page = {
    setDefaultNavigationTimeout(value) { calls.push(['timeout', value]); },
    async goto(url, options) { calls.push(['goto', url, options.waitUntil]); },
    url() { return 'https://example.com/final'; },
    locator() { return { async innerText() { return 'public response'; } }; },
  };
  const context = {
    async newPage() { calls.push(['newPage']); return page; },
    async close() { calls.push(['close']); },
  };
  const browser = {
    async createBrowserContext() { calls.push(['newContext']); return context; },
    async disconnect() { calls.push(['disconnect']); },
  };

  const result = await browseWithObscura({
    url: 'https://example.com',
    cdpUrl: 'ws://127.0.0.1:9222',
    connect: async () => browser,
    lookup: async () => ['93.184.216.34'],
  });

  assert.deepEqual(result, { url: 'https://example.com/final', text: 'public response' });
  assert.deepEqual(calls, [
    ['newContext'], ['newPage'], ['timeout', 15_000], ['goto', 'https://example.com/', 'domcontentloaded'], ['close'], ['disconnect'],
  ]);
});

test('maps an unavailable local browser endpoint to a safe error', async () => {
  await assert.rejects(
    browseWithObscura({
      url: 'https://example.com',
      connect: async () => { throw new Error('connection refused'); },
      lookup: async () => ['93.184.216.34'],
    }),
    { code: 'WORKER_UNAVAILABLE' },
  );
});

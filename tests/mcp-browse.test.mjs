import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowseHandler } from '../src/mcp/browse.js';

const localEnv = {
  OBSCURA_CDP_URL: 'ws://127.0.0.1:9222',
  TOR_SOCKS_PROXY: 'socks5://127.0.0.1:9050',
  BROWSER_EPHEMERAL: 'true',
};

test('routes local MCP browsing only through the isolated worker', async () => {
  const calls = [];
  const browse = createBrowseHandler({
    env: localEnv,
    browseWithWorker: async (options) => { calls.push(options); return { url: options.url, text: 'worker result' }; },
  });

  assert.deepEqual(await browse({ url: 'https://example.com' }), { url: 'https://example.com', text: 'worker result' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cdpUrl, 'ws://127.0.0.1:9222');
});

test('uses configured OHTTP without falling back to direct worker browsing', async () => {
  const calls = [];
  const browse = createBrowseHandler({
    env: { ...localEnv, OHTTP_RELAY_URL: 'https://relay.test', OHTTP_GATEWAY_URL: 'https://gateway.test', OHTTP_GATEWAY_KEY_CONFIG: 'AQ==' },
    browseWithWorker: async () => { throw new Error('must not run'); },
    browseWithOhttp: async (options) => { calls.push(options); return { url: options.url, text: 'ohttp result' }; },
  });

  assert.deepEqual(await browse({ url: 'https://example.com' }), { url: 'https://example.com', text: 'ohttp result' });
  assert.equal(calls[0].relayUrl, 'https://relay.test');
});

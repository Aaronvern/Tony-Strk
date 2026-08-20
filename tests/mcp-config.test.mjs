import assert from 'node:assert/strict';
import test from 'node:test';

import { loadBrowseConfig } from '../src/mcp/config.js';

const base = {
  OBSCURA_CDP_URL: 'ws://127.0.0.1:9222',
  TOR_SOCKS_PROXY: 'socks5://127.0.0.1:9050',
  BROWSER_EPHEMERAL: 'true',
};

test('selects local mode when every OHTTP value is absent', () => {
  assert.equal(loadBrowseConfig(base).mode, 'local');
});

test('rejects a partial OHTTP configuration', () => {
  assert.throws(
    () => loadBrowseConfig({ ...base, OHTTP_RELAY_URL: 'https://relay.example/ohttp' }),
    { code: 'OHTTP_CONFIGURATION_INVALID' },
  );
});

test('selects OHTTP mode only when relay, gateway, and key config exist', () => {
  const config = loadBrowseConfig({
    ...base,
    OHTTP_RELAY_URL: 'https://relay.example/ohttp',
    OHTTP_GATEWAY_URL: 'https://gateway.example/ohttp',
    OHTTP_GATEWAY_KEY_CONFIG: 'AA==',
  });

  assert.equal(config.mode, 'ohttp');
});

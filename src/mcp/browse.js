import { createOhttpClient } from '../ohttp/client.js';
import { browseWithObscura } from '../worker/obscura.js';
import { loadBrowseConfig } from './config.js';

function decodeKeyConfig(value) {
  return Uint8Array.from(Buffer.from(value, 'base64'));
}

async function browseWithConfiguredOhttp({ url, relayUrl, gatewayKeyConfig }) {
  return createOhttpClient({ relayUrl, gatewayKeyConfig: decodeKeyConfig(gatewayKeyConfig) }).browse(url);
}

export function createBrowseHandler({
  env = process.env,
  browseWithWorker = browseWithObscura,
  browseWithOhttp = browseWithConfiguredOhttp,
} = {}) {
  const config = loadBrowseConfig(env);

  return async ({ url }) => {
    if (config.mode === 'ohttp') {
      return browseWithOhttp({ url, ...config.ohttp });
    }
    return browseWithWorker({ url, cdpUrl: config.obscuraCdpUrl, timeoutMs: config.browserTimeoutMs });
  };
}

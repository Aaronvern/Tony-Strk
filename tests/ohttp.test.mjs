import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AEAD_AES_128_GCM,
  CipherSuite,
  KDF_HKDF_SHA256,
  KEM_DHKEM_X25519_HKDF_SHA256,
} from 'hpke';
import { AeadId, KdfId, KeyConfig } from 'ohttp-ts';
import { createOhttpClient } from '../src/ohttp/client.js';
import { createOhttpGateway } from '../src/ohttp/gateway.js';

test('keeps browse payloads encapsulated between the client and local test gateway', async () => {
  const suite = new CipherSuite(KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_128_GCM);
  const keyConfig = await KeyConfig.generate(suite, 1, [{ kdfId: KdfId.HKDF_SHA256, aeadId: AeadId.AES_128_GCM }]);
  const gateway = createOhttpGateway({
    keyConfig,
    browse: async ({ url }) => ({ url, text: 'isolated response' }),
    validate: async (url) => new URL(url),
  });
  const client = createOhttpClient({ suite, gatewayKeyConfig: KeyConfig.serialize(keyConfig), relayUrl: 'https://relay.test' });
  let relaySaw;

  const result = await client.browse('https://example.com', async (_url, init) => {
    relaySaw = new TextDecoder().decode(await new Response(init.body).arrayBuffer());
    return gateway.handle(new Request('https://gateway.test', init));
  });

  assert.equal(relaySaw.includes('example.com'), false);
  assert.deepEqual(result, { url: 'https://example.com/', text: 'isolated response' });
});

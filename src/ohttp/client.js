import {
  AEAD_AES_128_GCM,
  CipherSuite,
  KDF_HKDF_SHA256,
  KEM_DHKEM_X25519_HKDF_SHA256,
} from 'hpke';
import { KeyConfig, OHTTPClient } from 'ohttp-ts';

function ohttpError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createOhttpClient({
  relayUrl,
  gatewayKeyConfig,
  suite = new CipherSuite(KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_128_GCM),
}) {
  const client = new OHTTPClient(suite, KeyConfig.parse(gatewayKeyConfig));

  return {
    async browse(url, send = fetch) {
      const { init, context } = await client.encapsulateRequest(new Request(url, { method: 'POST' }));
      let relayResponse;
      try {
        relayResponse = await send(relayUrl, init);
      } catch {
        throw ohttpError('OHTTP_UNAVAILABLE', 'The OHTTP relay is unavailable.');
      }

      const response = await context.decapsulateResponse(relayResponse);
      if (!response.ok) throw ohttpError('OHTTP_FAILED', 'The OHTTP gateway rejected the browse request.');
      return response.json();
    },
  };
}

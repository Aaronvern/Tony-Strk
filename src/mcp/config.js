const OHTTP_KEYS = ['OHTTP_RELAY_URL', 'OHTTP_GATEWAY_URL', 'OHTTP_GATEWAY_KEY_CONFIG'];

export function configError(message) {
  return Object.assign(new Error(message), { code: 'OHTTP_CONFIGURATION_INVALID' });
}

export function loadBrowseConfig(env) {
  const configured = OHTTP_KEYS.filter((key) => Boolean(env[key]));

  if (configured.length > 0 && configured.length !== OHTTP_KEYS.length) {
    throw configError('Configure OHTTP relay, gateway, and gateway key together.');
  }

  return {
    mode: configured.length === OHTTP_KEYS.length ? 'ohttp' : 'local',
    obscuraCdpUrl: env.OBSCURA_CDP_URL || 'ws://127.0.0.1:9222',
    browserTimeoutMs: 15_000,
    maxTextChars: 20_000,
    ohttp: configured.length === OHTTP_KEYS.length
      ? {
          relayUrl: env.OHTTP_RELAY_URL,
          gatewayUrl: env.OHTTP_GATEWAY_URL,
          gatewayKeyConfig: env.OHTTP_GATEWAY_KEY_CONFIG,
        }
      : null,
  };
}

import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export function urlError(message) {
  return Object.assign(new Error(message), { code: 'URL_NOT_ALLOWED' });
}

export function assertPublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw urlError('Use a valid public HTTP(S) URL.');
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw urlError('Only HTTP(S) destinations are allowed.');
  }
  if (url.username || url.password) {
    throw urlError('Destination credentials are not allowed.');
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || isBlockedAddress(hostname)) {
    throw urlError('Local, private, and metadata destinations are not allowed.');
  }
  return url;
}

export async function validatePublicUrl(value, lookup = defaultLookup) {
  const url = assertPublicUrl(value);
  let addresses;
  try {
    addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ''));
  } catch {
    throw urlError('The destination could not be resolved.');
  }
  if (!addresses?.length || addresses.some(isBlockedAddress)) {
    throw urlError('Local, private, and metadata destinations are not allowed.');
  }
  return url;
}

async function defaultLookup(hostname) {
  if (isIP(hostname)) return [hostname];
  const records = await dnsLookup(hostname, { all: true });
  return records.map(({ address }) => address);
}

function isBlockedAddress(value) {
  const address = value.toLowerCase().replace(/^::ffff:/, '');
  if (address === '::1' || /^(fc|fd|fe[89ab])/.test(address)) return true;
  if (isIP(address) !== 4) return false;

  const [a, b] = address.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0);
}

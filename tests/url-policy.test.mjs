import assert from 'node:assert/strict';
import test from 'node:test';
import { assertPublicUrl, validatePublicUrl } from '../src/mcp/url-policy.js';

test('accepts public HTTPS destinations', async () => {
  const url = await validatePublicUrl('https://example.com/path', async () => ['93.184.216.34']);
  assert.equal(url.href, 'https://example.com/path');
});

test('rejects non-web schemes, credentials, and local destinations', () => {
  for (const value of [
    'file:///etc/passwd',
    'https://user:pass@example.com',
    'http://localhost:3000',
    'http://127.0.0.1',
    'http://[::1]',
  ]) {
    assert.throws(() => assertPublicUrl(value), { code: 'URL_NOT_ALLOWED' });
  }
});

test('rejects destinations resolving to private or metadata addresses', async () => {
  for (const address of ['10.0.0.1', '169.254.169.254', '100.64.0.1', 'fe80::1']) {
    await assert.rejects(
      validatePublicUrl('https://example.com', async () => [address]),
      { code: 'URL_NOT_ALLOWED' },
    );
  }
});

test('rejects malformed URLs as a policy error', () => {
  assert.throws(() => assertPublicUrl('not a URL'), { code: 'URL_NOT_ALLOWED' });
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the README describes only the local MCP and Web2 scope', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /No wallets, STRK20 transactions, x402 payments, or remote deployment are included/i);
  assert.match(readme, /OHTTP only provides a privacy boundary with independently operated relay and gateway services/i);
});

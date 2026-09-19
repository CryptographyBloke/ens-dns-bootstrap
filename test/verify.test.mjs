import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEnsTxt } from '../src/verify.mjs';

test('verifies matching ENS TXT', async () => {
  const address = '0x101f99125E4Aa1402f0eaEF896cC175Ba1280f0A';
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      AD: true,
      Answer: [{ type: 16, data: `"a=${address}"` }],
    }),
  });
  const result = await verifyEnsTxt('hnudao.online', address, { fetchImpl });
  assert.equal(result.ok, true);
});

test('does not mark unsigned TXT as ready', async () => {
  const address = '0x101f99125E4Aa1402f0eaEF896cC175Ba1280f0A';
  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({
      AD: false,
      Answer: [{ type: 16, data: `"a=${address}"` }],
    }),
  });
  const result = await verifyEnsTxt('hnudao.online', address, { fetchImpl });
  assert.equal(result.authenticated, false);
  assert.equal(result.ok, false);
});

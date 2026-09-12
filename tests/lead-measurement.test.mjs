import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/assets/lead-measurement.js', import.meta.url), 'utf8');
function run(result) {
  const calls = [];
  const window = { location: { pathname: '/contactus/' }, gtag: (...args) => calls.push(JSON.parse(JSON.stringify(args))) };
  vm.runInNewContext(source, { window });
  window.ifeelSendVerifiedLeadConversion(result);
  return calls;
}
test('no conversion or customer data for rejected/missing proof', () => {
  for (const result of [null, {}, { eligible: false }, { eligible: 'true' }]) assert.deepEqual(run(result), []);
});
test('consented hash accompanies Ads conversion and is cleared before Analytics', () => {
  const hash = 'a'.repeat(64);
  const calls = run({ eligible: true, user_data: { sha256_email_address: hash, email: 'never-send@example.com' } });
  assert.deepEqual(calls, [
    ['set', 'user_data', { sha256_email_address: hash }],
    ['event', 'conversion', { send_to: 'AW-18038181913/az2mCJjbtcYcEJmgo5lD' }],
    ['set', 'user_data', null],
    ['event', 'generate_lead', { page_path: '/contactus/' }],
  ]);
});
test('ordinary conversions still work without consent, email or valid hash', () => {
  for (const data of [undefined, {}, { sha256_email_address: 'raw@example.com' }, { sha256_email_address: ['a'.repeat(64)] }]) {
    const calls = run({ eligible: true, user_data: data });
    assert.deepEqual(calls[0], ['set', 'user_data', null]);
    assert.equal(calls.filter(c => c[1] === 'conversion').length, 1);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../public/assets/lead-measurement.js', import.meta.url), 'utf8');
const eventId = 'ifeel_' + 'b'.repeat(32);
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
  const calls = run({ eligible: true, event_id: eventId, user_data: { sha256_email_address: hash, email: 'never-send@example.com' } });
  assert.deepEqual(calls, [
    ['set', 'user_data', { sha256_email_address: hash }],
    ['event', 'conversion', { send_to: 'AW-18038181913/az2mCJjbtcYcEJmgo5lD', transaction_id: eventId }],
    ['set', 'user_data', null],
    ['event', 'generate_lead', { page_path: '/contactus/', event_id: eventId }],
  ]);
});
test('ordinary conversions still work without consent, email or valid hash', () => {
  for (const data of [undefined, {}, { sha256_email_address: 'raw@example.com' }, { sha256_email_address: ['a'.repeat(64)] }]) {
    const calls = run({ eligible: true, event_id: eventId, user_data: data });
    assert.deepEqual(calls[0], ['set', 'user_data', null]);
    assert.equal(calls.filter(c => c[1] === 'conversion').length, 1);
  }
});

test('missing, malformed and raw event identifiers cannot emit a conversion', () => {
  for (const id of [undefined, '', 'monday-1234', 'customer@example.invalid', ['a'], eventId + 'x']) {
    assert.deepEqual(run({ eligible: true, event_id: id }), []);
  }
});
test('repeated callbacks emit only one Ads and one GA4 event', () => {
  const calls = [];
  const window = { location: { pathname: '/' }, gtag: (...args) => calls.push(args) };
  vm.runInNewContext(source, { window });
  window.ifeelSendVerifiedLeadConversion({ eligible: true, event_id: eventId });
  window.ifeelSendVerifiedLeadConversion({ eligible: true, event_id: eventId });
  assert.equal(calls.filter(c => c[1] === 'conversion').length, 1);
  assert.equal(calls.filter(c => c[1] === 'generate_lead').length, 1);
});
test('enqueue failure clears consented user data and never retries an ambiguous event', () => {
  const calls = [];
  const window = { location: { pathname: '/' }, gtag: (...args) => {
    calls.push(JSON.parse(JSON.stringify(args)));
    if (args[1] === 'conversion') throw new Error('synthetic queue failure');
  } };
  vm.runInNewContext(source, { window });
  const result = { eligible: true, event_id: eventId, user_data: { sha256_email_address: 'a'.repeat(64) } };
  assert.throws(() => window.ifeelSendVerifiedLeadConversion(result), /synthetic/);
  assert.deepEqual(calls.at(-1), ['set', 'user_data', null]);
  window.ifeelSendVerifiedLeadConversion(result);
  assert.equal(calls.filter(c => c[1] === 'conversion').length, 1);
  assert.equal(calls.some(c => c[1] === 'generate_lead'), false);
});

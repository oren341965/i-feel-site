import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MODEL, ENDPOINT, criteria, fixtures, makeRequest, parseResult, smoke, safeError } from '../.claude/skills/ifeel-service-dispatch/scripts/jev-readonly.mjs';
const secret = 'test-only-secret-not-a-real-key';
function valid() {
  return { model: MODEL, answers: Object.fromEntries(fixtures.map(([choice], i) => [`case${i}`, {
    type: 'choice', choice, confidence: 1,
    probabilities: Object.fromEntries(Object.keys(criteria).map(k => [k, k === choice ? 1 : 0]))
  }])) };
}
test('one bounded request, fixed destination, no redirects, no credential in payload/output', async () => {
  let calls = 0;
  const result = await smoke(secret, async (url, options) => {
    calls++; assert.equal(url, ENDPOINT); assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.ok(options.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(options.body), makeRequest());
    assert.ok(!options.body.includes(secret));
    return new Response(JSON.stringify(valid()));
  });
  assert.equal(calls, 1); assert.equal(result.status, 'SYNTHETIC_SMOKE_PASS');
  assert.equal(result.actionAuthorized, false); assert.equal(result.businessActions, 0);
  assert.ok(!JSON.stringify(result).includes(secret));
});
test('wrong label remains advisory and reports mismatch', () => {
  const body = valid(); body.answers.case0 = structuredClone(body.answers.case1);
  const result = parseResult(body); assert.equal(result.status, 'SYNTHETIC_SMOKE_MISMATCH');
  assert.equal(result.actionAuthorized, false);
});
test('invalid schema, probabilities and injected fields never escape validation', () => {
  for (const mutate of [
    b => { b.model = secret; }, b => { delete b.answers.case0; },
    b => { b.answers.extra = {}; }, b => { b.answers.case0.choice = secret; },
    b => { b.answers.case0.confidence = NaN; },
    b => { b.answers.case0.probabilities.SERVICE = -1; },
    b => { b.answers.case0.probabilities.INSTALLATION = 0.1; },
    b => { b.answers.case0.probabilities.extra = 0; },
    b => { b.answers.case0.choice = 'OTHER'; }
  ]) { const body = valid(); mutate(body); assert.throws(() => parseResult(body), /INVALID_RESPONSE/); }
});
test('key absent prevents network access', async () => {
  for (const key of ['', null, 'bad\r\nkey']) await assert.rejects(smoke(key, () => assert.fail('network')), /TYPESAFE_API_KEY_REQUIRED/);
  for (const key of ['מפתח-דמה', 'key with spaces', 'key\u0000']) await assert.rejects(smoke(key, () => assert.fail('network')), /TYPESAFE_API_KEY_INVALID_FORMAT/);
});
test('network errors, HTTP errors and oversized responses are bounded and sanitized', async () => {
  for (const fetcher of [
    async () => { throw Error(secret); },
    async () => new Response(secret, { status: 401 }),
    async () => new Response(secret, { status: 429 }),
    async () => new Response('x'.repeat(65537)),
    async () => new Response(secret)
  ]) {
    let calls = 0;
    try { await smoke(secret, (...args) => { calls++; return fetcher(...args); }); assert.fail('must fail'); }
    catch (error) { assert.ok(!JSON.stringify(safeError(error)).includes(secret)); }
    assert.equal(calls, 1);
  }
  assert.equal(safeError(Error(secret)).status, 'JEV_LOCAL_ERROR');
});
test('CLI rejects arbitrary commands and extra arguments without leaking environment', () => {
  const script = fileURLToPath(new URL('../.claude/skills/ifeel-service-dispatch/scripts/jev-readonly.mjs', import.meta.url));
  for (const args of [['activate'], ['smoke', 'customer-data']]) {
    const run = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, TYPESAFE_API_KEY: secret } });
    assert.equal(run.status, 2); assert.ok(run.stderr.includes('INVALID_COMMAND'));
    assert.ok(!(run.stdout + run.stderr).includes(secret));
  }
});

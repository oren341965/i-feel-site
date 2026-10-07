import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

test('verified developer access transfers to Even Shaprut without another OTP and remains scoped', async t => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const child = spawn(process.env.PHP_BINARY || 'php', ['-S', '127.0.0.1:18792', '-t', 'public', 'tests/fixtures/developer-access-router.php'], { cwd, stdio: 'ignore' });
  let failure;
  child.on('error', e => { failure = e; });
  t.after(() => child.kill());
  const base = 'http://127.0.0.1:18792';
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (failure) throw failure;
    try { await fetch(base); ready = true; break; } catch { await delay(50); }
  }
  assert.ok(ready, 'PHP test server started');
  async function bridge(scenario) {
    const login = await fetch(base + '/test-access?scenario=' + scenario);
    const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
    const result = await fetch(base + '/developer-projects/even-shaprut/', { redirect: 'manual', headers: { Cookie: cookie } });
    return { result, cookie };
  }
  const { result, cookie } = await bridge('resident');
  assert.equal(result.status, 302);
  assert.equal(result.headers.get('location'), '/even-shaprut/');
  const access = result.headers.getSetCookie().find(c => c.startsWith('ifeel_esp_verified='));
  assert.ok(access);
  assert.match(access, /path=\/even-shaprut\//i);
  assert.match(access, /httponly/i);
  assert.match(access, /samesite=Strict/i);
  const projectCookie = access.split(';')[0];
  const page = await fetch(base + '/even-shaprut/', { headers: { Cookie: projectCookie } });
  const html = await page.text();
  assert.match(html, /id="pricelist"/);
  assert.doesNotMatch(html, /name="action" value="request_code"/);
  const csrf = html.match(/name="csrf" value="([^"]+)"/)[1];
  const loggedOut = await fetch(base + '/even-shaprut/', {
    method: 'POST', redirect: 'manual', headers: { Cookie: [projectCookie, ...page.headers.getSetCookie().map(c => c.split(';')[0])].join('; ') },
    body: new URLSearchParams({ action: 'logout', csrf }),
  });
  assert.equal(loggedOut.status, 303);
  const replay = await fetch(base + '/developer-projects/even-shaprut/', { redirect: 'manual', headers: { Cookie: cookie } });
  assert.equal(replay.headers.get('location'), '/developer-projects/');
  for (const scenario of ['other', 'expired', 'inactive', 'forged']) {
    const { result: denied } = await bridge(scenario);
    assert.equal(denied.headers.get('location'), '/developer-projects/', scenario);
    assert.ok(!denied.headers.getSetCookie().some(c => c.startsWith('ifeel_esp_verified=')), scenario);
  }
  const guest = await fetch(base + '/developer-projects/even-shaprut/', { redirect: 'manual' });
  assert.equal(guest.headers.get('location'), '/developer-projects/');
});

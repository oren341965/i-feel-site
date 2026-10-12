import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('homepage direct enquiry uses the existing reliable lead endpoint with required fields', async () => {
  const source = await read('src/page-html/index.html');
  assert.match(source, /id="homepage-quick-consultation"/);
  assert.match(source, /form action="\/api\/lead\.php" method="post"/);
  for (const field of ['name', 'phone', 'lead_type', 'city', 'heard_from']) {
    assert.match(source, new RegExp('name="' + field + '"[^>]*\\brequired\\b'));
  }
  assert.match(source, /name="source_page" value="\/"/);
  assert.match(source, /name="redirect_to" value="\/"/);
  assert.match(source, /name="website"/); // honeypot remains active
  assert.match(source, /homepage_quick_lead_submit_click/);
});

test('homepage and start page show truthful success and error feedback', async () => {
  for (const [page, prefix] of [
    ['src/page-html/index.html', 'homepage'],
    ['src/page-html/start.html', 'start']
  ]) {
    const source = await read(page);
    assert.match(source, new RegExp('id="' + prefix + '-lead-sent"'));
    assert.match(source, new RegExp('id="' + prefix + '-lead-error"'));
    assert.match(source, /status === 'sent'/);
    assert.match(source, /status === 'sent-mail'/);
    assert.match(source, /status === 'missing'/);
    assert.match(source, /status === 'error'/);
  }
});

test('homepage CTA has a direct verified sales phone and email fallback', async () => {
  const source = await read('src/page-html/index.html');
  assert.match(source, /href="tel:\+972-3-508-9553"/);
  assert.match(source, /mailto:sales@i-feel\.co\.il/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

test('KNX IAQ consultation lands on the existing commercial form, not private-home choices', async () => {
  const [article, contact] = await Promise.all([
    read('src/pages/articles/knx-indoor-air-quality-co2-bms.astro'),
    read('src/page-html/page-07.html'),
  ]);
  const cta = article.match(/<a\b[^>]*\bdata-ga-params='[^']*"cta_id":"knx_iaq_consultation"[^']*'[^>]*>/)?.[0];
  assert.ok(cta, 'the existing measurable consultation CTA must remain');
  assert.match(cta, /data-ga-event="cta_click"/);
  assert.match(cta, /"topic":"knx_iaq"/);
  assert.match(cta, /href="\/contactus\/#contact-form-wrapper"/);
  assert.match(contact, /<section\b[^>]*id="contact-form-wrapper"/);
  assert.match(contact, /<form\b[^>]*action="\/api\/lead\.php"[^>]*method="post"/);
  assert.match(contact, /name="lead_type"/);
  assert.match(contact, /BMS \/ בקרת מבנה/);
});

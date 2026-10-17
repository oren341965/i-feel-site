import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../' + path, import.meta.url), 'utf8');

for (const [path, ctaId, topic] of [
  ['knx-indoor-air-quality-co2-bms', 'knx_iaq_consultation', 'knx_iaq'],
  ['knx-bacnet-gateway-server-client-bms', 'knx_bacnet_gateway_consultation', 'knx_bms_gateway'],
]) test(`${ctaId} lands on the existing commercial form, not private-home choices`, async () => {
  const [article, contact] = await Promise.all([
    read(`src/pages/articles/${path}.astro`),
    read('src/page-html/page-07.html'),
  ]);
  const cta = [...article.matchAll(/<a\b[^>]*\bdata-ga-params='([^']*)'[^>]*>/g)]
    .find(match => JSON.parse(match[1]).cta_id === ctaId)?.[0];
  assert.ok(cta, 'the existing measurable consultation CTA must remain');
  assert.match(cta, /data-ga-event="cta_click"/);
  assert.ok(cta.includes(`"topic":"${topic}"`));
  assert.match(cta, /href="\/contactus\/#contact-form-wrapper"/);
  assert.match(contact, /<section\b[^>]*id="contact-form-wrapper"/);
  assert.match(contact, /<form\b[^>]*action="\/api\/lead\.php"[^>]*method="post"/);
  assert.match(contact, /name="lead_type"/);
  assert.match(contact, /BMS \/ בקרת מבנה/);
});

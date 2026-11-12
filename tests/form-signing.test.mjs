import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getSigningUrl } from '../src/utils/form-signing.mjs';
const verified = { templateId: 'known-template', completionDeliveryVerified: true, powerFormUrl: 'https://na4.docusign.net/Member/PowerFormSigning.aspx?PowerFormId=example' };
test('signing remains unavailable until a template and completion delivery are verified', () => {
 for (const override of [{completionDeliveryVerified:false},{templateId:''},{powerFormUrl:''}]) assert.equal(getSigningUrl({...verified,...override}), '');
 assert.equal(getSigningUrl(undefined), '');
});
test('only HTTPS Docusign PowerForm links are accepted', () => {
 assert.equal(getSigningUrl(verified), verified.powerFormUrl);
 for (const powerFormUrl of ['http://na4.docusign.net/Member/PowerFormSigning.aspx','https://docusign.net.evil.example/PowerForm','https://user:password@na4.docusign.net/PowerForm','https://na4.docusign.net/send/home','javascript:alert(1)']) assert.equal(getSigningUrl({...verified,powerFormUrl}), '');
});
test('company copy destinations and activation match the verified forms', async () => {
 const config=JSON.parse(await readFile(new URL('../src/data/form-signing.json',import.meta.url),'utf8'));
 for(const [id,entry] of Object.entries(config)) {
  assert.equal(entry.copyEmail, id.startsWith('service') ? 'support@i-feel.co.il' : 'admin@i-feel.co.il');
  const enabled = ['knx', 'zwave', 'low-voltage'].includes(id);
  assert.equal(Boolean(getSigningUrl(entry)), enabled);
  assert.equal(entry.completionDeliveryVerified, enabled);
 }
});

test('embedded signing panels navigate the full page to Docusign', async () => {
 const component = await readFile(new URL('../src/components/FormSigning.astro', import.meta.url), 'utf8');
 assert.match(component, /<a\b[^>]*class="signing-button"[^>]*target="_top"/);
});

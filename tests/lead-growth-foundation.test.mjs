import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ATTRIBUTION_FIELDS,
  DAILY_BRIEF_SECTIONS,
  orchestrateSalesSystem,
} from '../.claude/skills/ai-sales-manager/scripts/orchestrate-sales-system.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AI answer-engine referrals are classified before generic search domains', async () => {
  const endpoint = await read('public/api/lead.php');
  const googleIndex = endpoint.indexOf("strpos($host, 'google.')");
  const geminiIndex = endpoint.indexOf("$host === 'gemini.google.com'");

  assert.ok(geminiIndex > -1);
  assert.ok(googleIndex > -1);
  assert.ok(geminiIndex < googleIndex, 'Gemini must not be swallowed by Google organic');

  for (const expected of [
    'AI referral: ChatGPT',
    'AI referral: Gemini',
    'AI referral: Claude',
    'AI referral: Perplexity',
    'AI referral: Microsoft Copilot',
  ]) assert.match(endpoint, new RegExp(expected));
});

test('lead forms collect first/last-touch AI evidence and offer explicit AI source choices', async () => {
  const capture = await read('src/components/LeadAttributionCapture.astro');

  for (const field of ['first_referrer', 'entry_page', 'last_referrer', 'last_page']) {
    assert.match(capture, new RegExp(`['"]${field}['"]`));
  }
  for (const source of ['ChatGPT', 'Gemini', 'Claude', 'כלי AI אחר']) {
    assert.match(capture, new RegExp(source));
  }
  assert.match(capture, /form\[action="\/api\/newsletter\.php"\]/);
});

test('newsletter endpoint requires exact explicit consent and fails closed without server config', async () => {
  const endpoint = await read('public/api/newsletter.php');

  assert.match(endpoint, /IFEEL_NEWSLETTER_CONSENT_VERSION\s*=\s*'ifeel-insights-v1'/);
  assert.match(endpoint, /newsletter_field\('marketing_consent',[^)]*\)\s*===\s*'1'/);
  assert.match(endpoint, /SMOOVE_API_KEY/);
  assert.match(endpoint, /SMOOVE_NEWSLETTER_LIST_ID/);
  assert.match(endpoint, /newsletter_redirect\('unavailable'\)/);
  assert.match(endpoint, /restoreIfDeleted=false&restoreIfUnsubscribed=false/);
  assert.match(endpoint, /'canReceiveEmails'\s*=>\s*true/);
  for (const evidence of ['utm_source', 'utm_medium', 'utm_campaign', 'first_referrer', 'last_referrer']) {
    assert.match(endpoint, new RegExp(`newsletter_field\\('${evidence}'`));
  }
  assert.doesNotMatch(endpoint, /error_log\([^\n]*(?:\$email|\$firstName|\$role)/);
});

test('newsletter page has an unchecked required consent and is discoverable internally', async () => {
  const [page, sitemap, llms, footer, articles, answers] = await Promise.all([
    read('src/page-html/newsletter.html'),
    read('public/sitemap.xml'),
    read('public/llms.txt'),
    read('src/components/Footer.astro'),
    read('src/pages/articles/index.astro'),
    read('src/pages/answers/index.astro'),
  ]);

  assert.match(page, /action="\/api\/newsletter\.php"/);
  assert.match(page, /required type="checkbox" name="marketing_consent" value="1"/);
  assert.doesNotMatch(page, /name="marketing_consent"[^>]*checked/);
  for (const source of [sitemap, llms, footer, articles, answers]) {
    assert.match(source, /\/newsletter\//);
  }
});

test('sales manager reports AI discovery and newsletter growth but cannot send or publish', () => {
  const result = orchestrateSalesSystem();

  assert.ok(ATTRIBUTION_FIELDS.includes('ai_referral_source'));
  assert.ok(ATTRIBUTION_FIELDS.includes('ai_referral_page'));
  assert.ok(DAILY_BRIEF_SECTIONS.includes('ai_discovery'));
  assert.ok(DAILY_BRIEF_SECTIONS.includes('newsletter_growth'));
  assert.equal(result.aiDiscovery.automaticPublishAllowed, false);
  assert.equal(result.aiDiscovery.automaticOutreachAllowed, false);
  assert.equal(result.newsletterGrowth.provider, 'Smoove');
  assert.equal(result.newsletterGrowth.exactConsentVersion, 'ifeel-insights-v1');
  assert.equal(result.newsletterGrowth.restoreUnsubscribedContactsAllowed, false);
  assert.equal(result.newsletterGrowth.sendAllowed, false);
  assert.equal(result.newsletterGrowth.automaticCampaignAllowed, false);
});

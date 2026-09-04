import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  fingerprintE164,
  verifyBusinessIdentity,
} from '../.claude/skills/maya-whatsapp/scripts/verify-business-identity.mjs';

const allowlistUrl = new URL(
  '../.claude/skills/maya-whatsapp/runtime/business-identity-allowlist.json',
  import.meta.url,
);

test('canonical Maya WhatsApp allowlist stores a fingerprint and no raw phone number', async () => {
  const text = await readFile(allowlistUrl, 'utf8');
  const allowlist = JSON.parse(text);
  assert.equal(allowlist.phoneFingerprint.algorithm, 'sha256-e164-v1');
  assert.match(allowlist.phoneFingerprint.value, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(text, /\+972|05\d[\s-]?\d/);
});

test('commissioning fails closed when the canonical identity gate files are absent', async () => {
  const installer = await readFile(
    new URL('../scripts/workstations/maya-commissioning-install.ps1', import.meta.url),
    'utf8',
  );
  assert.match(installer, /business-identity-allowlist\.json/);
  assert.match(installer, /verify-business-identity\.mjs/);
});

test('identity gate passes only when every canonical field matches', async () => {
  const allowlist = JSON.parse(await readFile(allowlistUrl, 'utf8'));
  const observed = {
    businessName: allowlist.businessName,
    email: allowlist.email,
    website: `https://${allowlist.websiteHost}`,
    phoneFingerprint: allowlist.phoneFingerprint.value,
  };
  const passed = verifyBusinessIdentity({
    allowlist,
    observed,
    computer: 'DESKTOP-3LU7BMR',
    host: 'maya-front-office',
  });
  assert.equal(passed.status, 'PASSED_VERIFIED_MAYA');
  assert.equal(passed.sensitiveValuesEmitted, false);

  const blocked = verifyBusinessIdentity({
    allowlist,
    observed: { ...observed, phoneFingerprint: fingerprintE164('+972501234567') },
    computer: 'DESKTOP-3LU7BMR',
    host: 'maya-front-office',
  });
  assert.equal(blocked.status, 'BLOCKED_WHATSAPP_ALLOWLIST_MISMATCH');
  assert.equal(blocked.checks.phoneFingerprint, false);
});

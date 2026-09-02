import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildWebsiteEnvelope } from '../.claude/skills/verify-live/scripts/report-website-audit.mjs';

function fixture() {
  return {
    sourceMode: 'live_read_only', analysisComplete: true, checkMode: 'quick', infrastructureChecked: 5,
    infrastructureOk: 5, keyPagesChecked: 5, keyPagesOk: 5, pagesChecked: 11, pagesOk: 11,
    sitemapCount: 141, sitemapSampleChecked: 6, sitemapSampleOk: 6, sitemapMatchesOrigin: false,
    productionMatchesOriginMain: false, originMainSha: '7f1cb25a304a25a3c5257b75f9c8410a63ab550f',
    productionSha: '94af0cceb0eac151cbebcf0866b27db45c08ebc2',
    homepage: { phone: true, ga4: true, ads: true, jsonLd: true }, gscVerificationOk: true, staffPortalOk: true,
    forbiddenContentFindings: 0, deployPerformed: false, repositoryWrites: 0, serverWrites: 0,
    externalSends: 0, deploymentsTriggered: 0, sourceUpdatedAt: '2026-09-02T01:08:30.000Z',
    capturedAt: '2026-09-02T01:09:00.000Z',
  };
}

test('website reporter preserves only reconciled aggregate evidence', () => {
  const envelope = buildWebsiteEnvelope(fixture(), 'website-audit-20260902-001', 'verify-live-20260902-001');
  assert.equal(envelope.pagesChecked, 11);
  assert.equal(envelope.productionMatchesOriginMain, false);
  assert.equal(envelope.deploymentsTriggered, 0);
  assert.equal(JSON.stringify(envelope).includes('pageUrls'), false);
});

test('website reporter fails closed on mutations, unknown fields and revision contradictions', () => {
  const mutation = fixture();
  mutation.deploymentsTriggered = 1;
  assert.throws(() => buildWebsiteEnvelope(mutation, 'website-audit-20260902-002', 'verify-live-20260902-002'), /protected action/);

  const raw = fixture();
  raw.pageUrls = ['https://i-feel.co.il/'];
  assert.throws(() => buildWebsiteEnvelope(raw, 'website-audit-20260902-003', 'verify-live-20260902-003'), /unsupported or missing fields/);

  const revision = fixture();
  revision.productionMatchesOriginMain = true;
  assert.throws(() => buildWebsiteEnvelope(revision, 'website-audit-20260902-004', 'verify-live-20260902-004'), /does not reconcile/);
});

test('PowerShell verifier contains read-only primitives and no deployment or repository mutation command', async () => {
  const script = await readFile(new URL('../.claude/skills/verify-live/scripts/verify-live-readonly.ps1', import.meta.url), 'utf8');
  assert.match(script, /git ls-remote/);
  assert.match(script, /gh run list/);
  assert.match(script, /curl\.exe/);
  for (const forbidden of [/git\s+push/i, /git\s+fetch/i, /gh\s+(?:workflow\s+run|run\s+rerun)/i, /Set-Content/i,
    /Add-Content/i, /Out-File/i, /Remove-Item/i, /Copy-Item/i, /Move-Item/i]) {
    assert.doesNotMatch(script, forbidden);
  }
});

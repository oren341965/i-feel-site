import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, SCOPE } from '../.claude/skills/google-ads-manager/scripts/google-ads-villa-image-links.mjs';

function mock({ existing = [], disabled = false, failWrite = false, drift = false } = {}) {
  const links = existing.map(id => ({ resourceName: `link/${id}`, asset: `customers/${SCOPE.customer}/assets/${id}`, fieldType: 'AD_IMAGE', status: 'ENABLED' }));
  const writes = [];
  let mutated = false;
  return { writes, request: async (endpoint, body) => {
    if (endpoint === 'adGroupAssets:mutate') {
      assert.equal(body.partialFailure, false);
      for (const op of body.operations) {
        assert.deepEqual(Object.keys(op), ['create']);
        assert.equal(op.create.adGroup, `customers/${SCOPE.customer}/adGroups/${SCOPE.group}`);
        assert.equal(op.create.fieldType, 'AD_IMAGE');
        assert.ok(SCOPE.assets.some(id => op.create.asset.endsWith(`/assets/${id}`)));
      }
      if (body.validateOnly) return {};
      writes.push(body);
      if (failWrite) throw new Error('ambiguous network failure');
      mutated = true;
      const results = body.operations.map(op => {
        const resourceName = `link/${op.create.asset}`;
        links.push({ resourceName, asset: op.create.asset, fieldType: 'AD_IMAGE', status: 'ENABLED' });
        return { resourceName };
      });
      return { results };
    }
    const q = body.query;
    let rows;
    if (q.includes('FROM ad_group_ad')) rows = [{ campaign: { id: SCOPE.campaign }, adGroup: { id: SCOPE.group }, adGroupAd: { ad: { id: SCOPE.ad }, status: disabled ? 'PAUSED' : 'ENABLED' } }];
    else if (q.includes('FROM asset')) rows = SCOPE.assets.map(id => ({ asset: { id, type: 'IMAGE' } }));
    else if (q.includes('FROM ad_group_asset')) rows = links.map(adGroupAsset => ({ adGroupAsset }));
    else if (q.includes('FROM campaign_budget')) rows = [{ campaignBudget: { resourceName: 'budget/1', amountMicros: drift && mutated ? '200' : '100' } }];
    else throw new Error('Unexpected query');
    return [{ results: structuredClone(rows) }];
  } };
}
test('preview validates without writing', async () => {
  const m = mock(); const result = await reconcile(m);
  assert.equal(result.status, 'PREVIEW'); assert.equal(m.writes.length, 0);
});
test('creates only missing link and is idempotent on repeat', async () => {
  const m = mock({ existing: [SCOPE.assets[0]] });
  const result = await reconcile({ ...m, apply: true });
  assert.equal(result.created, 1); assert.equal(result.verifiedLinks.length, 2);
  const repeat = await reconcile({ ...m, apply: true });
  assert.equal(repeat.created, 0); assert.equal(m.writes.length, 1);
});
test('disabled ad prevents writes', async () => {
  const m = mock({ disabled: true });
  await assert.rejects(reconcile({ ...m, apply: true }), /precondition/);
  assert.equal(m.writes.length, 0);
});
test('ambiguous mutation is not retried', async () => {
  const m = mock({ failWrite: true });
  await assert.rejects(reconcile({ ...m, apply: true }), /ambiguous/);
  assert.equal(m.writes.length, 1);
});
test('read-back detects budget drift', async () => {
  await assert.rejects(reconcile({ ...mock({ drift: true }), apply: true }), /outside approved scope/);
});

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServiceAccountAssertion, loadGoogleAdsRuntimeConfig } from './google-ads-readonly.mjs';

// Owner-approved one-off scope. Never accept arbitrary targets or operations.
export const SCOPE = Object.freeze({ customer: '2514971872', campaign: '23740241199',
  group: '203781204188', ad: '828129697614', assets: Object.freeze(['425519707721', '425705006472']) });
const root = `customers/${SCOPE.customer}`;
const group = `${root}/adGroups/${SCOPE.group}`;
const expectedAssets = SCOPE.assets.map(id => `${root}/assets/${id}`);
const queries = {
  ad: `SELECT campaign.id, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status FROM ad_group_ad WHERE ad_group.id = ${SCOPE.group} AND ad_group_ad.ad.id = ${SCOPE.ad}`,
  assets: `SELECT asset.id, asset.name, asset.type, asset.image_asset.full_size.width_pixels, asset.image_asset.full_size.height_pixels FROM asset WHERE asset.id IN (${SCOPE.assets.join(',')})`,
  links: `SELECT ad_group.id, ad_group_asset.resource_name, ad_group_asset.asset, ad_group_asset.field_type, ad_group_asset.status FROM ad_group_asset WHERE ad_group.id = ${SCOPE.group} AND ad_group_asset.status != 'REMOVED'`,
  budgets: 'SELECT campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.total_amount_micros FROM campaign_budget',
};
const canonical = values => JSON.stringify(values.map(v => JSON.stringify(v)).sort());

export async function reconcile({ request, apply = false }) {
  const search = async query => {
    const batches = await request('googleAds:searchStream', { query });
    if (!Array.isArray(batches)) throw new Error('Invalid SearchStream response');
    return batches.flatMap(b => b.results ?? []);
  };
  async function snapshot() {
    const ad = await search(queries.ad);
    if (ad.length !== 1 || ad[0].campaign?.id !== SCOPE.campaign || ad[0].adGroup?.id !== SCOPE.group
      || ad[0].adGroupAd?.ad?.id !== SCOPE.ad || ad[0].adGroupAd?.status !== 'ENABLED') {
      throw new Error('Approved campaign/group/enabled ad precondition failed');
    }
    const assets = (await search(queries.assets)).map(v => v.asset);
    if (assets.length !== 2 || SCOPE.assets.some(id => !assets.some(a => a.id === id && a.type === 'IMAGE'))) {
      throw new Error('Approved image assets not found');
    }
    const links = (await search(queries.links)).map(v => v.adGroupAsset);
    const budgets = (await search(queries.budgets)).map(v => v.campaignBudget);
    if (!budgets.length) throw new Error('Budget evidence missing');
    return { ad, assets, links, budgets };
  }
  function operationsFor(state) {
    return expectedAssets.flatMap(asset => {
      const links = state.links.filter(l => l.asset === asset && l.fieldType === 'AD_IMAGE');
      if (links.length > 1 || links.some(l => l.status !== 'ENABLED')) {
        throw new Error('Existing approved link is duplicated or not enabled; manual review required');
      }
      return links.length ? [] : [{ create: { adGroup: group, asset, fieldType: 'AD_IMAGE', status: 'ENABLED' } }];
    });
  }
  const before = await snapshot();
  const operations = operationsFor(before);
  const report = { time: new Date().toISOString(), scope: SCOPE, apply, assets: before.assets,
    existingLinks: before.links, plannedOperations: operations, created: 0 };
  if (operations.length) {
    const payload = { operations, partialFailure: false, validateOnly: true };
    await request('adGroupAssets:mutate', payload);
    report.validation = 'PASSED';
    if (!apply) return { ...report, status: 'PREVIEW' };
    const immediate = await snapshot();
    if (canonical([before]) !== canonical([immediate])) throw new Error('Live preconditions changed after validation');
    // One transactional write, no automatic retry on ambiguous failure.
    const result = await request('adGroupAssets:mutate', { ...payload, validateOnly: false });
    if (result.partialFailureError || result.results?.length !== operations.length) {
      throw new Error('Mutation outcome requires read-only reconciliation; do not retry automatically');
    }
    report.created = result.results.length;
    report.mutationResults = result.results;
  }
  const after = await snapshot();
  if (operationsFor(after).length) throw new Error('Read-back missing approved links; do not retry automatically');
  const otherLinks = s => s.links.filter(l => !(expectedAssets.includes(l.asset) && l.fieldType === 'AD_IMAGE'));
  if (canonical(before.budgets) !== canonical(after.budgets)
    || canonical(before.ad) !== canonical(after.ad)
    || canonical(otherLinks(before)) !== canonical(otherLinks(after))) {
    throw new Error('Read-back detected a change outside approved scope; manual review required');
  }
  return { ...report, status: 'VERIFIED', verifiedLinks: after.links.filter(l => expectedAssets.includes(l.asset) && l.fieldType === 'AD_IMAGE'),
    budgetsUnchanged: true, adUnchanged: true, otherGroupLinksUnchanged: true };
}

async function main() {
  const args = process.argv.slice(2);
  let configPath, output, apply = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === '--config') configPath = args.shift();
    else if (flag === '--output') output = args.shift();
    else if (flag === '--apply-approved-villa-images') apply = true;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  if (!configPath) throw new Error('--config required');
  // Preserve the independent connector's explicit readOnly=true configuration.
  const runtime = await loadGoogleAdsRuntimeConfig(configPath);
  const serviceAccount = JSON.parse(await readFile(runtime.serviceAccountCredentialFile, 'utf8'));
  const developerToken = (await readFile(runtime.developerCredentialFile, 'utf8')).trim();
  const auth = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    signal: AbortSignal.timeout(30000), body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: createServiceAccountAssertion(serviceAccount) }) });
  if (!auth.ok) throw new Error(`OAuth HTTP ${auth.status}`);
  const token = (await auth.json()).access_token;
  if (!token) throw new Error('OAuth token missing');
  const request = async (endpoint, body) => {
    if (!['googleAds:searchStream', 'adGroupAssets:mutate'].includes(endpoint)) throw new Error('Endpoint forbidden');
    const response = await fetch(`https://googleads.googleapis.com/${runtime.apiVersion}/${root}/${endpoint}`, {
      method: 'POST', signal: AbortSignal.timeout(30000), headers: {
        authorization: `Bearer ${token}`, 'developer-token': developerToken, 'content-type': 'application/json',
        ...(runtime.loginCustomerId ? { 'login-customer-id': runtime.loginCustomerId } : {}) }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) {
      const errors = (Array.isArray(payload) ? payload : [payload]).flatMap(p => p.error?.details ?? [])
        .flatMap(d => (d.errors ?? []).map(e => ({ code: e.errorCode, message: e.message })));
      throw new Error(`Google Ads ${endpoint} HTTP ${response.status}: ${JSON.stringify(errors)}`);
    }
    return payload;
  };
  const report = await reconcile({ request, apply });
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

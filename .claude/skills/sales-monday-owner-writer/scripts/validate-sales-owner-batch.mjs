import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOARD_ID = '2732725332';
const COLUMN_ID = 'multiple_person_mm3skptj';
const MAX_ITEMS = 20;
const MAX_AGE_MS = 60 * 60 * 1000;
const REPO = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const PRIVATE_ROOT = resolve(REPO, '.ai-manager-data/sales/tmp');

function fail(message) { throw new Error(message); }

function privatePath(value, label) {
  if (!value) fail(`${label} path is required`);
  const absolute = resolve(REPO, value);
  const rel = relative(PRIVATE_ROOT, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) fail(`${label} must be inside .ai-manager-data/sales/tmp`);
  return absolute;
}
function parseTime(value, label, now) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(`${label} must be a valid timestamp`);
  if (time > now + 60_000) fail(`${label} is in the future`);
  if (now - time > MAX_AGE_MS) fail(`${label} is outside the freshness window`);
  return time;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function people(value, label) {
  const entries = value?.personsAndTeams;
  if (!Array.isArray(entries)) fail(`${label} must contain personsAndTeams`);
  const normalized = entries.map((entry) => {
    const id = String(entry?.id ?? '');
    const kind = entry?.kind;
    if (!/^\d+$/.test(id) || !['person', 'team'].includes(kind)) fail(`${label} contains an invalid identity`);
    return { id, kind };
  });
  const keys = normalized.map((entry) => `${entry.kind}:${entry.id}`);
  if (new Set(keys).size !== keys.length) fail(`${label} contains duplicate identities`);
  return normalized;
}

function same(left, right) { return canonical(left) === canonical(right); }

export function validateSalesOwnerBatch({ preview, approval, readback, now = new Date().toISOString() }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) fail('now must be a valid timestamp');
  if (preview?.schemaVersion !== 1 || preview?.mode !== 'review-only') fail('preview contract is invalid');
  if (String(preview?.boardId) !== BOARD_ID) fail('preview board is not allowed');
  if (preview?.authorization?.mondayWriteAuthorized !== false) fail('preview authorization boundary is invalid');
  parseTime(preview.generatedAt, 'preview.generatedAt', nowMs);

  if (approval?.schemaVersion !== 1 || approval?.approved !== true) fail('explicit structured approval is required');
  if (!String(approval.approvedBy ?? '').trim()) fail('approvedBy is required');
  const approvalTime = parseTime(approval.approvedAt, 'approval.approvedAt', nowMs);
  if (approvalTime < Date.parse(preview.generatedAt)) fail('approval predates the preview');
  const scope = approval.scope ?? {};
  if (String(scope.boardId) !== BOARD_ID || scope.columnId !== COLUMN_ID) fail('approval scope is not allowed');
  if (scope.maxItems !== MAX_ITEMS || scope.assignOnlyWhenEmpty !== true) fail('approval safety flags are invalid');
  const addPersonId = String(scope.addPersonId ?? '');
  if (!/^\d+$/.test(addPersonId)) fail('approval destination person is invalid');

  if (readback?.schemaVersion !== 1 || String(readback?.boardId) !== BOARD_ID) fail('readback contract is invalid');
  parseTime(readback.capturedAt, 'readback.capturedAt', nowMs);

  const proposals = preview.proposals;
  if (!Array.isArray(proposals) || proposals.length < 1 || proposals.length > MAX_ITEMS) fail('preview batch size is invalid');
  if (preview.blocked?.length) fail('preview contains blocked rows');
  const proposalIds = proposals.map((proposal) => String(proposal.itemId));
  if (proposalIds.some((id) => !/^\d+$/.test(id)) || new Set(proposalIds).size !== proposalIds.length) fail('preview item IDs are invalid');
  const approvedIds = Array.isArray(scope.itemIds) ? scope.itemIds.map(String) : [];
  if (new Set(approvedIds).size !== approvedIds.length || !same([...approvedIds].sort(), [...proposalIds].sort())) fail('approval item set does not exactly match preview');

  const readbackItems = Array.isArray(readback.items) ? readback.items : [];
  const readbackMap = new Map(readbackItems.map((item) => [String(item.itemId), item.currentValue]));
  if (readbackMap.size !== readbackItems.length || !same([...readbackMap.keys()].sort(), [...proposalIds].sort())) fail('readback item set does not exactly match preview');

  const updates = [];
  const rollbacks = [];
  for (const proposal of proposals) {
    const itemId = String(proposal.itemId);
    if (proposal.sourceKind !== 'main' || proposal.columnId !== COLUMN_ID) fail(`proposal ${itemId} scope is invalid`);
    if (!same(readbackMap.get(itemId), proposal.currentValue)) fail(`proposal ${itemId} no longer matches live readback`);
    const current = people(proposal.currentValue, `proposal ${itemId} currentValue`);
    const proposed = people(proposal.proposedValue, `proposal ${itemId} proposedValue`);
    if (current.length !== 0) fail(`proposal ${itemId} is not currently unowned`);
    if (proposed.length !== 1 || proposed[0].kind !== 'person' || proposed[0].id !== addPersonId) fail(`proposal ${itemId} adds an unauthorized identity`);
    if (!same(proposal.rollback?.value, proposal.currentValue) || proposal.rollback?.columnId !== COLUMN_ID) fail(`proposal ${itemId} rollback is invalid`);
    updates.push({ boardId: Number(BOARD_ID), itemId: Number(itemId), columnValues: JSON.stringify({ [COLUMN_ID]: proposal.proposedValue }), createLabelsIfMissing: false });
    rollbacks.push({ boardId: Number(BOARD_ID), itemId: Number(itemId), columnValues: JSON.stringify({ [COLUMN_ID]: proposal.currentValue }), createLabelsIfMissing: false });
  }

  const batchFingerprint = createHash('sha256').update(canonical({ boardId: BOARD_ID, columnId: COLUMN_ID, itemIds: proposalIds, addPersonId, updates })).digest('hex').toUpperCase();
  return {
    schemaVersion: 1,
    readyForConnectorWrite: true,
    boardId: BOARD_ID,
    columnId: COLUMN_ID,
    selected: proposals.length,
    destinationPersonId: addPersonId,
    batchFingerprint,
    updates,
    rollbacks,
    safeguards: { singleBatchCall: true, assignOnlyWhenEmpty: true, postWriteReadbackRequired: true, retryBusinessWrite: false, customerDataIncluded: false },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const previewPath = privatePath(get('--preview'), 'preview');
  const approvalPath = privatePath(get('--approval'), 'approval');
  const readbackPath = privatePath(get('--readback'), 'readback');
  const outputPath = privatePath(get('--output'), 'output');
  try {
    await access(outputPath, constants.F_OK);
    fail('output already exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const [preview, approval, readback] = await Promise.all([previewPath, approvalPath, readbackPath].map(async (path) => JSON.parse(await readFile(path, 'utf8'))));
  const plan = validateSalesOwnerBatch({ preview, approval, readback, now: get('--now') ?? new Date().toISOString() });
  await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ readyForConnectorWrite: true, selected: plan.selected, batchFingerprint: plan.batchFingerprint })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}


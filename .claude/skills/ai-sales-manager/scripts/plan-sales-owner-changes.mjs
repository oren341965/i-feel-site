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

function people(value, label) {
  const entries = value?.personsAndTeams;
  if (!Array.isArray(entries)) fail(`${label} must contain personsAndTeams`);
  return entries.map((entry) => {
    const id = String(entry?.id ?? '');
    if (!/^\d+$/.test(id) || !['person', 'team'].includes(entry?.kind)) fail(`${label} contains an invalid identity`);
    return { id, kind: entry.kind };
  });
}

export function planSalesOwnerChanges({ readback, addPersonId, now = new Date().toISOString(), maxItems = MAX_ITEMS }) {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) fail('now must be a valid timestamp');
  const capturedAt = Date.parse(readback?.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt > nowMs + 60_000 || nowMs - capturedAt > MAX_AGE_MS) fail('readback is outside the freshness window');
  if (readback?.schemaVersion !== 1 || String(readback?.boardId) !== BOARD_ID || readback?.sourceMode !== 'live_read_only') fail('readback contract is invalid');
  const personId = String(addPersonId ?? '');
  if (!/^\d+$/.test(personId)) fail('destination person is invalid');
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > MAX_ITEMS) fail('maxItems is invalid');
  const items = readback.items;
  if (!Array.isArray(items) || items.length < 1) fail('readback items are missing');
  const ids = items.map((item) => String(item?.itemId ?? ''));
  if (ids.some((id) => !/^\d+$/.test(id)) || new Set(ids).size !== ids.length) fail('readback item IDs are invalid');

  const blocked = [];
  const proposals = [];
  for (const item of items) {
    const itemId = String(item.itemId);
    if (item.sourceKind !== 'main' || item.eligibleForOwnership !== true) {
      blocked.push({ itemId, code: 'NOT_ELIGIBLE_UNOWNED_MAIN_ITEM' });
      continue;
    }
    const current = people(item.currentValue, `item ${itemId} currentValue`);
    if (current.length !== 0) {
      blocked.push({ itemId, code: 'OWNER_ALREADY_PRESENT' });
      continue;
    }
    if (proposals.length >= maxItems) {
      blocked.push({ itemId, code: 'BATCH_LIMIT' });
      continue;
    }
    const currentValue = { personsAndTeams: current };
    const proposedValue = { personsAndTeams: [{ id: personId, kind: 'person' }] };
    proposals.push({
      sequence: proposals.length + 1,
      itemId,
      sourceKind: 'main',
      columnId: COLUMN_ID,
      currentValue,
      proposedValue,
      rollback: { columnId: COLUMN_ID, value: currentValue },
    });
  }
  const generatedAt = new Date(nowMs).toISOString();
  const previewFingerprint = createHash('sha256').update(JSON.stringify({ boardId: BOARD_ID, columnId: COLUMN_ID, generatedAt, proposals })).digest('hex').toUpperCase();
  return {
    schemaVersion: 1,
    mode: 'review-only',
    boardId: BOARD_ID,
    generatedAt,
    sourceCapturedAt: new Date(capturedAt).toISOString(),
    authorization: { mondayWriteAuthorized: false },
    limits: { maximum: MAX_ITEMS, selected: proposals.length },
    previewFingerprint,
    proposals,
    blocked,
    safety: { mondayWrites: 0, externalSends: 0, customerDataIncluded: false },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const inputPath = privatePath(get('--readback'), 'readback');
  const outputPath = privatePath(get('--output'), 'output');
  try {
    await access(outputPath, constants.F_OK);
    fail('output already exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const readback = JSON.parse(await readFile(inputPath, 'utf8'));
  const preview = planSalesOwnerChanges({
    readback,
    addPersonId: get('--person-id'),
    now: get('--now') ?? new Date().toISOString(),
    maxItems: Number(get('--max-items') ?? MAX_ITEMS),
  });
  await writeFile(outputPath, `${JSON.stringify(preview, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ mode: preview.mode, selected: preview.proposals.length, blocked: preview.blocked.length, previewFingerprint: preview.previewFingerprint })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}


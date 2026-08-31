import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

import { analyzeProjects } from '../.claude/skills/ai-project-manager/scripts/analyze-projects.mjs';

const execFileAsync = promisify(execFile);
const BOARD_SOURCES = [
  ['3249720207', 2], ['4010423265', 1], ['18399467324', 1],
].map(([boardId, count]) => ({ boardId, expectedItemCount: count, fetchedItemCount: count, pageCount: 1, updatedAt: '2026-08-31T10:00:00Z', officialDoneMetadataConfigured: false }));

function input(items) { return { source: { mode: 'live', boards: BOARD_SOURCES }, items }; }

test('project analyzer reconciles three boards and overlapping exceptions without writes', () => {
  const result = analyzeProjects(input([
    { id: '1', boardId: '3249720207', status: 'בביצוע', owners: [], timelineEnd: '2026-08-01', lastUpdated: '2026-07-01', preFormStatus: 'טרם התקבל', stuck: true },
    { id: '2', boardId: '3249720207', status: 'התקנה הסתיימה', owners: ['owner'], timelineEnd: '2026-08-01', lastUpdated: '2026-08-20' },
    { id: '3', boardId: '4010423265', status: 'בביצוע', owners: ['owner'], timelineEnd: '2026-09-20', lastUpdated: '2026-08-30' },
    { id: '4', boardId: '18399467324', status: 'בביצוע', owners: ['owner'], lastUpdated: '2026-08-30' },
  ]), { now: '2026-08-31T12:00:00Z' });
  assert.equal(result.uniqueItemCount, 4);
  assert.equal(result.activeCount, 3);
  assert.equal(result.terminalClassifiedCount, 1);
  assert.equal(result.overdueCount, 1);
  assert.equal(result.inactiveCount, 1);
  assert.equal(result.stuckCount, 1);
  assert.equal(result.missingOwnerCount, 1);
  assert.equal(result.missingTimelineCount, 1);
  assert.deepEqual(result.safety, { readOnly: true, aggregateOnlyOutput: true, mondayWrites: 0, structuralChanges: 0 });
});

test('project analyzer rejects incomplete boards, duplicate IDs and operational payload fields', () => {
  const rows = [
    { id: '1', boardId: '3249720207' }, { id: '2', boardId: '3249720207' },
    { id: '3', boardId: '4010423265' }, { id: '4', boardId: '18399467324' },
  ];
  assert.throws(() => analyzeProjects({ source: { mode: 'live', boards: BOARD_SOURCES.slice(0, 2) }, items: rows }), /All project boards/);
  assert.throws(() => analyzeProjects(input([{ ...rows[0], customerName: 'forbidden' }, ...rows.slice(1)])), /unsupported fields/);
  assert.throws(() => analyzeProjects(input([rows[0], { ...rows[1], id: '1' }, ...rows.slice(2)])), /globally unique/);
});

test('project reporter emits aggregate-only dry-run envelope', async (t) => {
  const folder = await mkdtemp(join(tmpdir(), 'ifeel-project-reporter-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const analysis = analyzeProjects(input([
    { id: '1', boardId: '3249720207' }, { id: '2', boardId: '3249720207', groupTitle: 'הסתיימו' },
    { id: '3', boardId: '4010423265' }, { id: '4', boardId: '18399467324' },
  ]), { now: '2026-08-31T12:00:00Z' });
  const path = join(folder, 'analysis.json');
  await writeFile(path, JSON.stringify(analysis));
  const script = resolve('.claude/skills/ai-project-manager/scripts/report-project-audit.mjs');
  const { stdout } = await execFileAsync(process.execPath, [script, '--analysis', path, '--audit-key', 'project-audit:test-1', '--run-key', 'project-run:test-1', '--dry-run']);
  const result = JSON.parse(stdout);
  assert.equal(result.envelope.fetchedItemCount, 4);
  assert.equal(result.envelope.boards.length, 3);
  assert.equal(JSON.stringify(result).includes('customerName'), false);
  assert.equal('items' in result.envelope, false);
});


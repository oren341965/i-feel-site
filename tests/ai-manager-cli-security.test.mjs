import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const REPO = resolve(import.meta.dirname, '..');
const SALES_SCRIPT = resolve(REPO, '.claude/skills/ai-sales-manager/scripts/analyze-sales.mjs');
const SERVICE_SCRIPT = resolve(REPO, '.claude/skills/ai-service-manager/scripts/analyze-service.mjs');
const NOW = '2026-08-20T09:00:00.000Z';

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    windowsHide: true,
  });
}

test('AI manager CLIs keep operational details out of stdout by default', async (t) => {
  const relativeDir = `.ai-manager-data/cli-test-${process.pid}-${Date.now()}`;
  const absoluteDir = resolve(REPO, relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  t.after(async () => {
    if (!absoluteDir.startsWith(resolve(REPO, '.ai-manager-data'))) throw new Error('unsafe test cleanup path');
    await rm(absoluteDir, { recursive: true, force: true });
  });
  const salesInput = `${relativeDir}/sales-input.json`;
  await writeFile(resolve(REPO, salesInput), JSON.stringify({
    generatedAt: NOW,
    items: [{
      id: '1', name: 'Synthetic Customer', status: 'פעיל', owners: [], nextAction: null,
      lastUpdated: NOW, createdAt: NOW,
    }],
  }), 'utf8');

  const result = run(SALES_SCRIPT, ['--input', salesInput]);
  assert.equal(result.status, 0, result.stderr);
  const stdout = JSON.parse(result.stdout);
  assert.equal(stdout.counts.total, 1);
  assert.equal('priorities' in stdout, false);
  assert.equal(result.stdout.includes('Synthetic Customer'), false);
});

test('AI manager CLIs require an explicit flag for operational output and refuse overwrite', async (t) => {
  const relativeDir = `.ai-manager-data/cli-test-${process.pid}-${Date.now()}-output`;
  const absoluteDir = resolve(REPO, relativeDir);
  await mkdir(absoluteDir, { recursive: true });
  t.after(async () => {
    if (!absoluteDir.startsWith(resolve(REPO, '.ai-manager-data'))) throw new Error('unsafe test cleanup path');
    await rm(absoluteDir, { recursive: true, force: true });
  });
  const input = `${relativeDir}/service-input.json`;
  const output = `${relativeDir}/service-output.json`;
  await writeFile(resolve(REPO, input), JSON.stringify({
    generatedAt: NOW,
    items: [{
      id: '1', name: 'Synthetic Case', status: '4. בטיפול', owners: [], category: 'אחר',
      createdAt: NOW, lastUpdated: NOW,
    }],
  }), 'utf8');

  const first = run(SERVICE_SCRIPT, [
    '--input', input, '--output', output, '--include-operational-details',
  ]);
  assert.equal(first.status, 0, first.stderr);
  const written = JSON.parse(await readFile(resolve(REPO, output), 'utf8'));
  assert.equal(written.priorities[0].name, 'Synthetic Case');

  const second = run(SERVICE_SCRIPT, [
    '--input', input, '--output', output, '--include-operational-details',
  ]);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /exist/i);
});

test('AI manager CLIs reject paths outside private data root and unknown flags', () => {
  const outside = run(SALES_SCRIPT, ['--input', 'package.json']);
  assert.notEqual(outside.status, 0);
  assert.match(outside.stderr, /inside \.ai-manager-data/);

  const unknown = run(SERVICE_SCRIPT, ['--input', '.ai-manager-data/none.json', '--mutate']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /Unknown argument/);
});

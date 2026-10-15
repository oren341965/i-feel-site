import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('Windows launcher resolves its default config and records native stderr failures',
  { skip: process.platform !== 'win32' }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'ifeel-launcher-test-'));
    const quote = value => `'${value.replaceAll("'", "''")}'`;
    try {
      const jobs = join(root, 'jobs');
      const config = join(root, 'config');
      const profile = join(root, 'profile');
      const local = join(root, 'local');
      const manager = join(profile, '.codex/skills/ai-sales-manager/scripts');
      const telemetry = join(local, 'I Feel/Management System');
      for (const directory of [jobs, config, manager, telemetry]) await mkdir(directory, { recursive: true });
      await writeFile(join(manager, 'run-morning-managed.mjs'), '');
      await writeFile(join(telemetry, 'invoke-telemetry.ps1'), '');
      await writeFile(join(config, 'config.json'), JSON.stringify({ runtimeRoot: root }));
      const source = await readFile(resolve('.claude/skills/ai-sales-manager/runtime/run-morning-dry-run.ps1'), 'utf8');
      // Only host-directory discovery is replaced; the invocation/error path is real PowerShell 5.1.
      const isolated = source
        .replace("[Environment]::GetFolderPath('UserProfile')", quote(profile))
        .replace("[Environment]::GetFolderPath('LocalApplicationData')", quote(local));
      const launcher = join(jobs, 'run-morning-dry-run.ps1');
      await writeFile(launcher, isolated);
      const harness = join(root, 'test.ps1');
      await writeFile(harness, `function global:node {\n & $env:COMSPEC /d /c 'echo Invalid paid-media budget policy 1>&2 & exit /b 1'\n $global:LASTEXITCODE = $LASTEXITCODE\n}\n & ${quote(launcher)}\n`);
      const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harness],
        { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      assert.notEqual(result.status, 0);
      const day = new Date().toISOString().slice(0, 10);
      const failure = JSON.parse(await readFile(join(root, 'logs', `morning-run-failure-${day}.json`), 'utf8'));
      assert.equal(failure.failureCode, 'PAID_MEDIA_BUDGET_POLICY_INVALID');
      assert.equal(failure.exitCode, 1);
      assert.equal(failure.mondayWrites, 0);
      assert.equal(failure.sends, 0);
      assert.equal(failure.externalActionsPerformed, false);
      assert.equal(JSON.stringify(failure).includes('Invalid paid-media'), false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

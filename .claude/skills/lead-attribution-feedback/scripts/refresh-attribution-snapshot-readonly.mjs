#!/usr/bin/env node

import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { collectMondayAttributionCoverageReadOnly } from './monday-attribution-coverage-readonly.mjs';
import { validateAttributionSnapshot } from './attribution-readonly.mjs';

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!['--config', '--output'].includes(name) || !value) fail(`Unknown or incomplete argument: ${name}`, 2);
    args[name.slice(2)] = resolve(value);
    index += 1;
  }
  if (!args.config) fail('--config is required', 2);
  return args;
}

function isInside(parent, child) {
  const relation = relative(parent, child);
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

export async function refreshAttributionSnapshotReadOnly({ configPath, outputPath, now = new Date(), fetchImpl = globalThis.fetch } = {}) {
  const resolvedConfig = resolve(configPath);
  const config = JSON.parse(await readFile(resolvedConfig, 'utf8'));
  const dataRoot = resolve(config.runtimeRoot, 'data');
  const configuredOutput = resolve(config.connections?.attribution?.sourceFile ?? '');
  const destination = outputPath ? resolve(outputPath) : configuredOutput;
  if (!isInside(dataRoot, destination) || !destination.toLowerCase().endsWith('.json')) {
    throw new Error('Attribution output must be a JSON file inside the runtime data directory');
  }

  const coverage = await collectMondayAttributionCoverageReadOnly({
    configPath: resolvedConfig,
    now,
    fetchImpl,
    includeApprovedSnapshot: true,
  });
  const snapshot = coverage.approvedSnapshot;
  const validated = validateAttributionSnapshot(snapshot, {
    now: new Date(snapshot.generated_at),
    maxAgeHours: config.connections?.attribution?.maxAgeHours ?? 168,
  });
  if (validated.records.length !== coverage.expectedItemCount) {
    throw new Error('Attribution export record reconciliation failed');
  }

  await mkdir(dirname(destination), { recursive: true });
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  const temporaryPath = `${destination}.pending`;
  const backupPath = `${destination}.backup-${new Date(now).toISOString().replace(/[:.]/g, '-')}`;
  let backupCreated = false;
  try {
    const current = await stat(destination);
    if (current.isFile()) {
      await copyFile(destination, backupPath);
      backupCreated = true;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await writeFile(temporaryPath, serialized, { encoding: 'utf8', flag: 'w' });
  await rename(temporaryPath, destination);

  return {
    schemaVersion: 1,
    mode: 'LIVE_READ_ONLY_LOCAL_EXPORT',
    boardId: coverage.boardId,
    generatedAt: snapshot.generated_at,
    records: snapshot.rows.length,
    sourceKnown: coverage.windows.all.sourceKnown,
    outputFile: basename(destination),
    backupFile: backupCreated ? basename(backupPath) : null,
    sha256: createHash('sha256').update(serialized).digest('hex'),
    safety: {
      mondayWrites: 0,
      externalSends: 0,
      rawPiiOutput: false,
      localFilesWritten: backupCreated ? 2 : 1,
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await refreshAttributionSnapshotReadOnly({ configPath: args.config, outputPath: args.output });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
  }
}

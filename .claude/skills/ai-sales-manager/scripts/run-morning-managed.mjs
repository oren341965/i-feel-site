#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMorningDryRun } from './morning-run.mjs';

const CAPABILITY_SLUG = 'ai-sales-manager';
const DEFAULT_CONFIG = fileURLToPath(new URL('../runtime/config.example.json', import.meta.url));
const DEFAULT_TIMEZONE = 'Asia/Jerusalem';
const DEFAULT_TELEMETRY_TIMEOUT_MS = 75_000;

function parseArgs(argv) {
  let configPath = DEFAULT_CONFIG;
  let telemetryCommandPath;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Unknown or incomplete argument: ${argument}`);
    if (argument === '--config') configPath = resolve(value);
    else if (argument === '--telemetry-command') telemetryCommandPath = resolve(value);
    else throw new Error(`Unknown argument: ${argument}`);
    index += 1;
  }
  return { configPath, telemetryCommandPath };
}

export function localDateKey(now = new Date(), timezone = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${value.year}${value.month}${value.day}`;
}

export function defaultTelemetryCommandPath(environment = process.env) {
  const localAppData = environment.LOCALAPPDATA;
  if (!localAppData) throw new Error('LOCALAPPDATA is unavailable; management telemetry cannot be located.');
  return resolve(localAppData, 'I Feel', 'Management System', 'invoke-telemetry.ps1');
}

export function runPowerShell(commandPath, argumentsList, {
  spawnImpl = spawn,
  timeoutMs = DEFAULT_TELEMETRY_TIMEOUT_MS,
} = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', commandPath,
      ...argumentsList,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let settled = false;
    const settle = (callback) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      callback();
      return true;
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      rejectPromise(new Error(`Management telemetry timed out after ${timeoutMs} ms.`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.resume();
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.once('error', (error) => settle(() => rejectPromise(error)));
    child.once('close', (code) => {
      if (code !== 0) {
        settle(() => rejectPromise(new Error(`Management telemetry command failed with exit code ${code}.`)));
        return;
      }
      try {
        const output = JSON.parse(stdout.trim());
        settle(() => resolvePromise(output));
      } catch {
        settle(() => rejectPromise(new Error('Management telemetry returned an invalid response.')));
      }
    });
  });
}

export async function reportManagedRun(envelope, { telemetryCommandPath } = {}) {
  const commandPath = telemetryCommandPath ?? defaultTelemetryCommandPath();
  await access(commandPath);
  const argumentsList = [
    '--capability', CAPABILITY_SLUG,
    '--run-key', envelope.runKey,
    '--mode', 'live_read_only',
    '--status', envelope.status,
    '--started-at', envelope.startedAt,
    '--reads', String(envelope.reads ?? 0),
    '--writes', '0',
    '--sends', '0',
    '--retries', '0',
    '--errors', String(envelope.errors ?? 0),
    '--evidence-ref', envelope.evidenceRef,
  ];
  if (envelope.finishedAt) argumentsList.push('--finished-at', envelope.finishedAt);
  return runPowerShell(commandPath, argumentsList);
}

export async function runManagedMorning({
  configPath = DEFAULT_CONFIG,
  telemetryCommandPath,
  now = new Date(),
  manager = runMorningDryRun,
  reporter = reportManagedRun,
} = {}) {
  const startedAt = new Date(now).toISOString();
  const dateKey = localDateKey(new Date(now));
  const runKey = `morning-sales-${dateKey}`;
  const evidenceRef = `sales-manager:morning:${dateKey}`;
  const reporterOptions = { telemetryCommandPath };

  await reporter({ runKey, status: 'running', startedAt, reads: 0, errors: 0, evidenceRef }, reporterOptions);

  let result;
  try {
    result = await manager({ configPath, now: new Date(now) });
  } catch (error) {
    const finishedAt = new Date().toISOString();
    try {
      await reporter({
        runKey,
        status: 'failed',
        startedAt,
        finishedAt,
        reads: 0,
        errors: 1,
        evidenceRef: `sales-manager:morning-failed:${dateKey}`,
      }, reporterOptions);
    } catch (telemetryError) {
      throw new AggregateError([error, telemetryError], 'AI Sales Manager and terminal telemetry both failed.');
    }
    throw error;
  }

  const finishedAt = new Date().toISOString();
  await reporter({
    runKey,
    status: 'succeeded',
    startedAt,
    finishedAt,
    reads: 1,
    errors: 0,
    evidenceRef,
  }, reporterOptions);

  return {
    managementTelemetry: {
      capability: CAPABILITY_SLUG,
      runKey,
      status: 'succeeded',
      hostBoundByDpapi: true,
      externalWrites: 0,
      externalSends: 0,
    },
    result,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = await runManagedMorning(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

import { access, constants, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { findForbiddenDataKeys, validateBusMessage } from './orchestrate-sales-system.mjs';

export const VAULT_RELATIVE_FOLDERS = Object.freeze([
  'AI-Sales',
  'AI-Sales/Maya',
  'AI-Sales/Maya/Inbox',
  'AI-Sales/Maya/Tasks',
  'AI-Sales/Maya/Waiting',
  'AI-Sales/Maya/Completed',
  'AI-Sales/Maya/Escalations',
  'AI-Sales/_bus',
  'AI-Sales/_bus/maya-to-manager',
  'AI-Sales/_bus/manager-to-maya',
  'AI-Sales/_bus/to-claude',
  'AI-Sales/_bus/to-codex',
  'AI-Sales/_bus/approvals',
  'AI-Sales/_bus/processed',
  'AI-Sales/_state',
  'AI-Sales/_logs',
  'AI-Sales/_backups',
]);

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function prepareVault(config = {}, options = {}) {
  const configuredRoot = config.VAULT_ROOT;
  if (typeof configuredRoot !== 'string' || configuredRoot.trim() === '') {
    return {
      status: 'MISSING',
      root: null,
      obsidianDetected: false,
      busReady: false,
      writable: false,
      foldersChecked: [],
      foldersCreated: [],
      reason: 'VAULT_ROOT_NOT_CONFIGURED',
    };
  }
  if (!isAbsolute(configuredRoot)) {
    return {
      status: 'INVALID',
      root: configuredRoot,
      obsidianDetected: false,
      busReady: false,
      writable: false,
      foldersChecked: [],
      foldersCreated: [],
      reason: 'VAULT_ROOT_MUST_BE_ABSOLUTE',
    };
  }

  const root = resolve(configuredRoot);
  if (!await isDirectory(root)) {
    return {
      status: 'MISSING',
      root,
      obsidianDetected: false,
      busReady: false,
      writable: false,
      foldersChecked: [],
      foldersCreated: [],
      reason: 'VAULT_ROOT_NOT_FOUND',
    };
  }

  const obsidianDetected = await isDirectory(join(root, '.obsidian'));
  const foldersChecked = VAULT_RELATIVE_FOLDERS.map((relative) => join(root, ...relative.split('/')));
  if (!obsidianDetected) {
    return {
      status: 'INVALID',
      root,
      obsidianDetected: false,
      busReady: false,
      writable: false,
      foldersChecked,
      foldersCreated: [],
      reason: 'OBSIDIAN_MARKER_NOT_FOUND',
    };
  }

  const foldersCreated = [];
  try {
    if (options.createMissing !== false) {
      for (const folder of foldersChecked) {
        if (!await isDirectory(folder)) {
          await mkdir(folder, { recursive: true });
          foldersCreated.push(folder);
        }
      }
    }
    await access(join(root, 'AI-Sales'), constants.R_OK | constants.W_OK);
  } catch (error) {
    return {
      status: 'INVALID',
      root,
      obsidianDetected: true,
      busReady: false,
      writable: false,
      foldersChecked,
      foldersCreated,
      reason: `VAULT_PREPARE_FAILED:${error.code ?? 'UNKNOWN'}`,
    };
  }

  const busFolders = foldersChecked.filter((folder) => folder.includes(`${join('AI-Sales', '_bus')}`));
  const busReady = (await Promise.all(busFolders.map(isDirectory))).every(Boolean);
  return {
    status: busReady ? 'READY' : 'INVALID',
    root,
    obsidianDetected: true,
    busReady,
    writable: true,
    foldersChecked,
    foldersCreated,
    reason: busReady ? null : 'BUS_FOLDERS_MISSING',
  };
}

function dateInTimezone(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildMorningJudgmentRequest(result, options = {}) {
  const generatedAt = new Date(options.now ?? Date.now());
  if (Number.isNaN(generatedAt.getTime())) throw new Error('Invalid morning-run timestamp');
  const date = dateInTimezone(generatedAt, options.timezone ?? 'Asia/Jerusalem');
  const requestId = `morning-sales-judgment-${date}`;
  const mondaySnapshot = result.mondaySnapshotReadOnly;
  const message = {
    schema_version: 1,
    request_id: requestId,
    generated_at: generatedAt.toISOString(),
    max_age_hours: 24,
    source: 'codex',
    type: 'MORNING_SALES_JUDGMENT_REQUEST',
    dry_run: true,
    approval_required: false,
    payload: {
      current_target_status: mondaySnapshot?.connection?.status ?? 'NO_LIVE_TARGET_DATA',
      monday_snapshot_generated_at: mondaySnapshot?.connection?.snapshotGeneratedAt ?? null,
      monday_counts: mondaySnapshot ? {
        open: mondaySnapshot.counts.open,
        exception_leads: mondaySnapshot.counts.exceptionLeads,
        overdue: mondaySnapshot.counts.overdue,
        no_next_action: mondaySnapshot.counts.noNextAction,
        no_owner: mondaySnapshot.counts.noOwner,
      } : null,
      monday_health_score: mondaySnapshot?.healthScore ?? null,
      monday_data_quality_score: mondaySnapshot?.dataQualityScore ?? null,
      google_status: result.connections.googleAds.status,
      meta_status: result.connections.metaAds.status,
      capacity_status: result.capacity.status,
      website_improvement_status: 'NO_CHANGE',
      judgment_items: [],
    },
  };
  const validation = validateBusMessage(message, { now: generatedAt.toISOString() });
  if (!validation.accepted) throw new Error(`Generated bus message failed validation: ${validation.status}`);
  return message;
}

async function writeBusMessageOnce(path, message, now) {
  try {
    await writeFile(path, `${JSON.stringify(message, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    return { created: true, idempotentReuse: false };
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(path, 'utf8'));
    if (existing.request_id !== message.request_id) throw new Error('Existing bus message request_id mismatch');
    const validation = validateBusMessage(existing, { now, maxAgeMinutes: message.max_age_hours * 60 });
    if (!validation.accepted) throw new Error(`Existing bus message failed validation: ${validation.status}`);
    return { created: false, idempotentReuse: true };
  }
}

function assertNoForbiddenData(value, label) {
  const findings = findForbiddenDataKeys(value);
  if (findings.length > 0) throw new Error(`${label} contains forbidden data: ${findings.join(', ')}`);
}

export function buildDailyOrenBrief(result, options = {}) {
  const generatedAt = new Date(options.now ?? Date.now());
  if (Number.isNaN(generatedAt.getTime())) throw new Error('Invalid daily brief timestamp');
  const date = dateInTimezone(generatedAt, options.timezone ?? 'Asia/Jerusalem');
  const ready = result.components.filter(({ status }) => status === 'READY').map(({ name }) => name);
  const readyRemote = result.components.filter(({ status }) => status === 'READY_REMOTE').map(({ name }) => name);
  const missing = result.components.filter(({ status }) => status === 'MISSING_LOCAL').map(({ name }) => name);
  const capacityReasons = result.capacity.reasons.length > 0
    ? result.capacity.reasons.join(', ')
    : 'none';
  const mondaySnapshot = result.mondaySnapshotReadOnly;
  const mondayLine = mondaySnapshot
    ? `Monday snapshot: LOCAL_SNAPSHOT_READ_ONLY מ-${mondaySnapshot.connection.snapshotGeneratedAt}; פתוחים ${mondaySnapshot.counts.open}; חריגים ${mondaySnapshot.counts.exceptionLeads}; באיחור ${mondaySnapshot.counts.overdue}; ללא אחראי ${mondaySnapshot.counts.noOwner}; health ${mondaySnapshot.healthScore}/100; data quality ${mondaySnapshot.dataQualityScore}/100; אינו חיבור live.`
    : 'Monday snapshot: CONNECTION_MISSING; אין baseline מצרפי מאומת בריצת הבוקר.';
  const lines = [
    `# בריף אורן — ${date}`,
    '',
    `מצב: DRY_RUN / maturity ${result.maturity}; לא בוצעה פעולה חיצונית.`,
    `Baseline: 90 יום מ-${result.baseline.startedOn ?? date}; scaling אוטומטי חסום.`,
    `מאיה: ${result.maya.status}; Vault bus: ${result.maya.busReady ? 'READY' : 'NOT_READY'}; Maya stack קיים בלבד.`,
    mondayLine,
    `Google Ads: ${result.connections.googleAds.status}; Meta: ${result.connections.metaAds.status}; attribution: ${result.attribution.status}.`,
    `קיבולת: ${result.capacity.status}; budget growth: BLOCKED; סיבות: ${capacityReasons}.`,
    'פרסום: מותר להמליץ כבר עכשיו על waste ברור, תיקון tracking ו-negative keywords; אין שינוי קמפיין או תקציב.',
    `אתר/SEO: daily-seo-crawl מחובר למנוע; תוצאת היום: ${result.dailyWebsiteImprovement.resultContract === 'ONE_EVIDENCE_BACKED_IMPROVEMENT_OR_NO_CHANGE' ? 'NO_CHANGE עד ראיה חיה' : 'REVIEW'}.`,
    `סקילים מקומיים מחוברים (${ready.length}): ${ready.join(', ') || 'none'}.`,
    `סקילי מאיה מרוחקים (${readyRemote.length}): ${readyRemote.join(', ') || 'none'}.`,
    `חיבורים/סקילים משלימים חסרים: ${missing.join(', ') || 'none'}.`,
    '',
    '## סדר עדיפות להיום',
    '1. לאשר/להגדיר סף קיבולת X ונתוני backlog לפני כל המלצת צמיחה.',
    '2. להשלים credentials חסרים ולאמת Google/Meta בקריאה בלבד.',
    '3. לספק export attribution מאושר ללא PII, keyed by monday_item_id.',
    '4. לבדוק תשובת Claude ב-to-codex; התשובה נשארת review-only.',
    '',
    'Guardrails: אין כתיבת Monday, אין email/WhatsApp, אין שינוי Google/Meta, אין פרסום, אין push/PR/merge.',
  ];
  const brief = `${lines.join('\n')}\n`;
  assertNoForbiddenData({ brief }, 'daily brief');
  return brief;
}

export async function persistMorningArtifacts(config, result, vault, options = {}) {
  if (vault.status !== 'READY') throw new Error(`Vault is not ready: ${vault.status}`);
  const runtimeRoot = resolve(config.runtimeRoot);
  const stateDirectory = join(runtimeRoot, 'state');
  const logsDirectory = join(runtimeRoot, 'logs');
  await mkdir(stateDirectory, { recursive: true });
  await mkdir(logsDirectory, { recursive: true });

  const request = buildMorningJudgmentRequest(result, {
    now: options.now,
    timezone: config.timezone,
  });
  const requestPath = join(vault.root, 'AI-Sales', '_bus', 'to-claude', `${request.request_id}.json`);
  const busWrite = await writeBusMessageOnce(requestPath, request, request.generated_at);
  const date = request.request_id.slice(-10);

  const statePath = join(stateDirectory, 'system-state.json');
  const state = {
    schema_version: 1,
    last_morning_run: request.generated_at,
    maturity: result.maturity,
    vault_status: vault.status,
    monday_snapshot_status: result.mondaySnapshotReadOnly?.connection?.status ?? 'CONNECTION_MISSING',
    monday_snapshot_generated_at: result.mondaySnapshotReadOnly?.connection?.snapshotGeneratedAt ?? null,
    monday_open: result.mondaySnapshotReadOnly?.counts?.open ?? null,
    monday_exception_leads: result.mondaySnapshotReadOnly?.counts?.exceptionLeads ?? null,
    monday_no_owner: result.mondaySnapshotReadOnly?.counts?.noOwner ?? null,
    google_ads_status: result.connections.googleAds.status,
    meta_ads_status: result.connections.metaAds.status,
    attribution_status: result.attribution.status,
    capacity_status: result.capacity.status,
    maya_status: result.maya.status,
    baseline_started_on: result.baseline.startedOn ?? date,
    baseline_duration_days: result.baseline.durationDays,
    automatic_scaling_allowed: false,
    last_request_id: request.request_id,
  };
  assertNoForbiddenData(state, 'state');
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const logPath = join(logsDirectory, `morning-run-${date}.json`);
  const briefPath = join(logsDirectory, `daily-oren-brief-${date}.md`);
  const brief = buildDailyOrenBrief(result, {
    now: request.generated_at,
    timezone: config.timezone,
  });
  await writeFile(briefPath, brief, 'utf8');
  const log = {
    schema_version: 1,
    generated_at: request.generated_at,
    job: 'morning-run',
    mode: result.mode,
    maturity: result.maturity,
    summary: {
      vault_status: vault.status,
      monday_snapshot_status: result.mondaySnapshotReadOnly?.connection?.status ?? 'CONNECTION_MISSING',
      monday_snapshot_generated_at: result.mondaySnapshotReadOnly?.connection?.snapshotGeneratedAt ?? null,
      monday_open: result.mondaySnapshotReadOnly?.counts?.open ?? null,
      monday_exception_leads: result.mondaySnapshotReadOnly?.counts?.exceptionLeads ?? null,
      monday_no_owner: result.mondaySnapshotReadOnly?.counts?.noOwner ?? null,
      google_ads_status: result.connections.googleAds.status,
      meta_ads_status: result.connections.metaAds.status,
      attribution_status: result.attribution.status,
      capacity_status: result.capacity.status,
      maya_status: result.maya.status,
      website_improvement_status: 'NO_CHANGE',
    },
    artifacts: {
      state_file: statePath,
      log_file: logPath,
      daily_oren_brief_file: briefPath,
      to_claude_file: requestPath,
      request_id: request.request_id,
      bus_file_created: busWrite.created,
      idempotent_reuse: busWrite.idempotentReuse,
    },
    protected_actions: {
      monday_write: false,
      external_send: false,
      google_meta_write: false,
      budget_change: false,
      irreversible_action: false,
      automatic_scaling: false,
    },
  };
  assertNoForbiddenData(log, 'log');
  await writeFile(logPath, `${JSON.stringify(log, null, 2)}\n`, 'utf8');

  return {
    stateFile: statePath,
    logFile: logPath,
    dailyOrenBriefFile: briefPath,
    toClaudeFile: requestPath,
    requestId: request.request_id,
    busFileCreated: busWrite.created,
    idempotentReuse: busWrite.idempotentReuse,
  };
}

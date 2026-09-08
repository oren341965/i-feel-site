import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO = resolve(import.meta.dirname, '..');
const SMOKE = join(REPO, 'agent-config', 'maya-codex', 'test-management-smoke.ps1');
const PROVISION = join(REPO, 'agent-config', 'maya-codex', 'provision-management-telemetry.ps1');
const POWERSHELL = process.platform === 'win32' ? 'powershell.exe' : 'pwsh';
const POWERSHELL_AVAILABLE = spawnSync(
  POWERSHELL,
  ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'],
  { encoding: 'utf8' },
).status === 0;
const COMMIT = 'a'.repeat(40);
const OTHER_COMMIT = 'b'.repeat(40);
const FOUR_SKILLS = [
  'maya-email-maintenance',
  'maya-instagram-relations',
  'maya-whatsapp',
  'management-system-telemetry',
];
const CONTRACTS = ['bus-message.schema.json', 'maya-task-protocol.md'];

function extractGateHelpers(scriptPath) {
  const source = readFileSync(scriptPath, 'utf8');
  const startMarker = '# MAYA_MANAGEMENT_GATE_HELPERS_START';
  const endMarker = '# MAYA_MANAGEMENT_GATE_HELPERS_END';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  assert.notEqual(start, -1, scriptPath + ' is missing the gate start marker');
  assert.notEqual(end, -1, scriptPath + ' is missing the gate end marker');
  assert.ok(end > start, scriptPath + ' has invalid gate markers');
  return source.slice(start + startMarker.length, end);
}

function psLiteral(value) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function runGate(scriptPath, {
  requiredSkills = FOUR_SKILLS,
  reportedSkills = requiredSkills,
  manifestCommit = COMMIT,
  verificationCommit = COMMIT,
  manifestContracts = CONTRACTS,
  reportedContracts = manifestContracts,
  checkContracts = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ifeel-maya-management-gate-'));
  const vault = join(root, 'vault');
  const releaseName = COMMIT.slice(0, 12);
  const installerRoot = join(vault, 'AI-Sales', 'Installers', 'Maya');
  const releaseRoot = join(installerRoot, 'releases', releaseName);
  const verificationPath = join(root, 'verification.json');
  const harnessPath = join(root, 'gate-harness.ps1');
  mkdirSync(releaseRoot, { recursive: true });

  writeFileSync(join(installerRoot, 'current.json'), JSON.stringify({
    schemaVersion: 1,
    commit: COMMIT,
    relativeReleasePath: 'releases/' + releaseName,
  }));
  writeFileSync(join(releaseRoot, 'manifest.json'), JSON.stringify({
    schemaVersion: 1,
    commit: manifestCommit,
    requiredSkills,
    files: [
      { path: 'payload/runtime/maya-config.example.json' },
      ...manifestContracts.map((name) => ({ path: 'payload/runtime/' + name })),
    ],
  }));
  writeFileSync(verificationPath, JSON.stringify({
    status: 'INSTALLED_PAUSED',
    payload: {
      commit: verificationCommit,
      skills: reportedSkills.map((skill) => ({ skill, hashMatch: true })),
      taskContracts: reportedContracts.map((name) => ({ name, hashMatch: true })),
    },
  }));

  const contractCheck = checkContracts
    ? '$contractGate = Get-MayaCommissioningContractGate -Manifest $releaseGate.manifest -Verification $verification'
    : '$contractGate = [pscustomobject]@{ verifiedContracts = 0 }';
  const harness = [
    "$ErrorActionPreference = 'Stop'",
    extractGateHelpers(scriptPath),
    '$verification = Get-Content -LiteralPath ' + psLiteral(verificationPath) + ' -Raw -Encoding UTF8 | ConvertFrom-Json',
    'try {',
    '    $releaseGate = Get-MayaCommissioningReleaseGate -VaultRoot ' + psLiteral(vault) + ' -Verification $verification',
    '    ' + contractCheck,
    "    [ordered]@{ status = 'PASSED'; installedSkills = $releaseGate.installedSkills; verifiedContracts = $contractGate.verifiedContracts } | ConvertTo-Json -Compress",
    '    exit 0',
    '}',
    'catch {',
    "    [ordered]@{ status = 'BLOCKED'; message = $_.Exception.Message } | ConvertTo-Json -Compress",
    '    exit 23',
    '}',
  ].join('\n');
  writeFileSync(harnessPath, harness);
  const result = spawnSync(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', harnessPath], {
    encoding: 'utf8',
  });
  let output;
  try {
    output = JSON.parse(result.stdout.trim().replace(/^\uFEFF/, ''));
  } catch {
    output = { status: 'INVALID_OUTPUT', message: result.stdout.trim() };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  return { ...result, output };
}

function assertPassesBoth(options, expectedSkills) {
  for (const [scriptPath, checkContracts] of [[SMOKE, false], [PROVISION, true]]) {
    const result = runGate(scriptPath, { ...options, checkContracts });
    assert.equal(result.status, 0, scriptPath + '\n' + result.stderr + '\n' + result.stdout);
    assert.equal(result.output.status, 'PASSED');
    assert.equal(result.output.installedSkills, expectedSkills);
    assert.equal(result.output.verifiedContracts, checkContracts ? 2 : 0);
  }
}

function assertBlockedBoth(options, messagePattern) {
  for (const [scriptPath, checkContracts] of [[SMOKE, false], [PROVISION, true]]) {
    const result = runGate(scriptPath, { ...options, checkContracts });
    assert.equal(result.status, 23, scriptPath + '\n' + result.stderr + '\n' + result.stdout);
    assert.equal(result.output.status, 'BLOCKED');
    assert.match(result.output.message, messagePattern);
  }
}

test('Maya management gates accept the current four-skill release and report the real count', {
  skip: !POWERSHELL_AVAILABLE,
}, () => {
  assertPassesBoth({}, 4);
  const smokeSource = readFileSync(SMOKE, 'utf8');
  const provisionSource = readFileSync(PROVISION, 'utf8');
  assert.doesNotMatch(smokeSource, /verifiedSkills\s+-ne\s+[34]/);
  assert.doesNotMatch(provisionSource, /verifiedSkills\s+-ne\s+[34]/);
  assert.match(smokeSource, /--installed-skills', \(\[string\]\$releaseGate\.installedSkills\)/);
});

test('Maya management gates identify a missing Instagram relations skill', {
  skip: !POWERSHELL_AVAILABLE,
}, () => {
  assertBlockedBoth(
    { reportedSkills: FOUR_SKILLS.filter((skill) => skill !== 'maya-instagram-relations') },
    /Missing: maya-instagram-relations/,
  );
});

test('Maya management gates accept a future five-skill manifest without code changes', {
  skip: !POWERSHELL_AVAILABLE,
}, () => {
  const skills = [...FOUR_SKILLS, 'maya-future-worker'];
  assertPassesBoth({ requiredSkills: skills, reportedSkills: skills }, 5);
});

test('Maya management gates still accept a valid legacy three-skill manifest', {
  skip: !POWERSHELL_AVAILABLE,
}, () => {
  const skills = FOUR_SKILLS.filter((skill) => skill !== 'maya-instagram-relations');
  assertPassesBoth({ requiredSkills: skills, reportedSkills: skills }, 3);
});

test('Maya management gates reject the right count with the wrong skill names', {
  skip: !POWERSHELL_AVAILABLE,
}, () => {
  assertBlockedBoth(
    { reportedSkills: [...FOUR_SKILLS.slice(0, 3), 'maya-wrong-worker'] },
    /Missing: management-system-telemetry; Unexpected: maya-wrong-worker/,
  );
});

test('Maya management gates reject verification evidence from a different commit', {
  skip: !POWERSHELL_AVAILABLE,
}, () => {
  assertBlockedBoth({ verificationCommit: OTHER_COMMIT }, /commit mismatch/i);
  assertBlockedBoth({ manifestCommit: OTHER_COMMIT }, /commit mismatch/i);
});

test('Maya provisioning gate derives task contracts from the release manifest', {
  skip: !POWERSHELL_AVAILABLE,
}, () => {
  const result = runGate(PROVISION, {
    checkContracts: true,
    reportedContracts: ['bus-message.schema.json'],
  });
  assert.equal(result.status, 23, result.stderr + '\n' + result.stdout);
  assert.match(result.output.message, /Missing: maya-task-protocol\.md/);
});

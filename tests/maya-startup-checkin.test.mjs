import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { auditStartup, inspectGit, reportStartup, saveLocalReceipt } from '../.claude/skills/management-system-telemetry/scripts/maya-startup-checkin.mjs';

const HOST = 'maya-front-office';
const COMMIT = 'a'.repeat(40);
const NEXT_COMMIT = 'b'.repeat(40);
const SKILLS = ['maya-email-maintenance', 'maya-instagram-relations', 'maya-whatsapp', 'management-system-telemetry'];
const CHECKIN_KEY = 'maya-startup-11111111-2222-4333-8444-555555555555';
const OBSERVED_AT = '2026-09-28T08:09:10.000Z';
const REPORT_OPTIONS = { checkinKey: CHECKIN_KEY, observedAt: OBSERVED_AT, wrapper: 'synthetic-wrapper.ps1' };
const SHA256 = contents => crypto.createHash('sha256').update(contents).digest('hex');
const ZERO_WRITES = { businessWrites: 0, externalSends: 0, secretsChanged: 0, gitWrites: 0, vaultWrites: 0, schedulerChanges: 0, deletions: 0 };

// All files are synthetic. Git and wrapper execution are injected, so no test
// uses credentials, a real repository, network, or scheduled tasks.
function temporaryDirectory(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'maya-startup-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), parent);
    assert.ok(path.basename(root).startsWith('maya-startup-test-'));
    assert.equal(fs.lstatSync(root).isSymbolicLink(), false);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function fixture(t) {
  const root = temporaryDirectory(t);
  const vault = path.join(root, 'vault');
  const installer = path.join(vault, 'AI-Sales', 'Installers', 'Maya');
  const release = path.join(installer, 'releases', COMMIT.slice(0, 12));
  const installed = path.join(root, 'installed');
  const repository = path.join(root, 'canonical');
  const wrapper = path.join(root, 'local', 'invoke-host-checkin.ps1');
  const reporterRelative = 'management-system-telemetry/scripts/report-host-checkin.mjs';
  const manifest = { schemaVersion: 1, role: HOST, registeredHostSlug: HOST, commit: COMMIT, requiredSkills: [...SKILLS], files: [] };
  const addPayload = (relative, contents) => {
    write(path.join(release, relative), contents);
    const entry = { path: relative, bytes: Buffer.byteLength(contents), sha256: SHA256(contents) };
    manifest.files.push(entry);
    return entry;
  };
  for (const skill of SKILLS) {
    const contents = `# Synthetic ${skill}\n`;
    addPayload(`payload/skills/${skill}/SKILL.md`, contents);
    write(path.join(installed, skill, 'SKILL.md'), contents);
  }
  const reporter = '// Synthetic reporter; never executed.\n';
  addPayload(`payload/skills/${reporterRelative}`, reporter);
  // The canonical exporter also hashes its installer at the release root.
  addPayload('INSTALL.ps1', "# Synthetic installer; never executed.\nthrow 'INSTALLER_MUST_NEVER_RUN'\n");
  write(path.join(installed, reporterRelative), reporter);
  write(path.join(repository, '.claude/skills', reporterRelative), reporter);
  write(path.join(repository, 'agent-config/maya-codex/invoke-host-checkin.ps1'), '# Synthetic wrapper; never executed.\n');
  write(wrapper, '# Synthetic wrapper; never executed.\n');
  const saveManifest = () => write(path.join(release, 'manifest.json'), JSON.stringify(manifest));
  saveManifest();
  write(path.join(installer, 'current.json'), JSON.stringify({ schemaVersion: 1, commit: COMMIT, relativeReleasePath: `releases/${COMMIT.slice(0, 12)}` }));
  const runtimeConfigPath = path.join(root, 'config.json');
  write(runtimeConfigPath, JSON.stringify({ VAULT_ROOT: vault }));
  return { root, release, installed, repository, wrapper, manifest, addPayload, saveManifest,
    options: { computer: 'DESKTOP-3LU7BMR', runtimeConfigPath, installedSkillsRoot: installed, repositoryPath: repository, wrapperPath: wrapper } };
}

function audit(fx, git = {}) {
  return auditStartup(fx.options, { gitReader: repository => {
    assert.equal(repository, fx.repository);
    return { status: 'CURRENT', localSourceVerified: true, localCommit: COMMIT, remoteCommit: COMMIT, ...git };
  } });
}

function fileSnapshot(root) {
  const result = {};
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const location = path.join(root, item.name);
    if (item.isDirectory()) {
      for (const [relative, hash] of Object.entries(fileSnapshot(location))) result[`${item.name}/${relative}`] = hash;
    } else result[item.name] = SHA256(fs.readFileSync(location));
  }
  return result;
}

function reportAudit(overrides = {}) {
  return { blockers: [], transportVerified: true, health: 'degraded', installedSkillCount: 4,
    vaultStatus: 'local_release_verified', releaseCommit: COMMIT, githubStatus: 'CURRENT', ...overrides };
}

function dryReceipt(args, overrides = {}) {
  const value = flag => args[args.indexOf(flag) + 1];
  return { ok: true, dryRun: true, envelope: { hostSlug: HOST, checkinKey: value('--checkin-key'),
    healthStatus: value('--health'), sourceMode: value('--source-mode'),
    installedSkillCount: Number(value('--installed-skills')), vaultStatus: value('--vault-status'),
    observedAt: new Date(value('--observed-at')).toISOString(), ...overrides } };
}

function centralReceipt(overrides = {}) {
  return { ok: true, checkin: { hostSlug: HOST, checkinKey: CHECKIN_KEY, healthStatus: 'degraded', observedAt: OBSERVED_AT, ...overrides } };
}

test('wrong workstation stops before filesystem or Git access', () => {
  const result = auditStartup({ computer: 'DESKTOP-OFFICE', runtimeConfigPath: 'does-not-exist' }, {
    gitReader: () => assert.fail('wrong workstation must not inspect Git'),
  });
  assert.equal(result.health, 'blocked');
  assert.deepEqual(result.blockers, ['WRONG_WORKSTATION']);
  assert.equal(result.transportVerified, false);
  assert.deepEqual(result.safety, ZERO_WRITES);
});

test('four valid installed skills establish local verification without claiming all systems green', t => {
  const fx = fixture(t);
  const before = fileSnapshot(fx.root);
  const result = audit(fx);
  assert.equal(result.installedSkillCount, 4);
  assert.equal(result.vaultStatus, 'local_release_verified');
  assert.equal(result.releaseCommit, COMMIT);
  assert.equal(result.transportVerified, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.health, 'degraded');
  assert.equal(result.cloudSyncConfirmed, false);
  assert.equal(result.allWorkSynchronized, false);
  assert.equal(result.officeAcknowledged, false);
  assert.equal(result.channelReadiness, 'NOT_CHECKED');
  assert.deepEqual(result.safety, ZERO_WRITES);
  assert.deepEqual(fileSnapshot(fx.root), before);
});

test('an exporter-shaped release verifies its root INSTALL.ps1 without installing or executing it', t => {
  const fx = fixture(t);
  assert.ok(fx.manifest.files.some(entry => entry.path === 'INSTALL.ps1'));
  const before = fileSnapshot(fx.root);
  const result = audit(fx);
  assert.equal(result.vaultStatus, 'local_release_verified');
  assert.equal(result.installedSkillCount, 4);
  assert.equal(result.transportVerified, true);
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.safety, ZERO_WRITES);
  assert.equal(fs.existsSync(path.join(fx.installed, 'INSTALL.ps1')), false);
  assert.deepEqual(fileSnapshot(fx.root), before);
});

test('tampering with root INSTALL.ps1 fails release verification even when its byte count is unchanged', t => {
  const fx = fixture(t);
  const installer = path.join(fx.release, 'INSTALL.ps1');
  const original = fs.readFileSync(installer, 'utf8');
  const changed = original.replace('Synthetic', 'Tampered!');
  assert.notEqual(changed, original);
  assert.equal(Buffer.byteLength(changed), Buffer.byteLength(original));
  write(installer, changed);
  const result = audit(fx);
  assert.ok(result.blockers.includes('LOCAL_RELEASE_UNAVAILABLE_OR_INVALID'));
  assert.equal(result.vaultStatus, 'unavailable');
  assert.equal(result.installedSkillCount, 0);
  assert.deepEqual(result.safety, ZERO_WRITES);
  assert.equal(fs.readFileSync(installer, 'utf8'), changed);
});

for (const damage of ['missing payload', 'changed payload', 'path traversal', 'duplicate path', 'unexpected skill', 'incomplete required skills']) {
  test(`release rejects ${damage}`, t => {
    const fx = fixture(t);
    const entry = fx.manifest.files[0];
    if (damage === 'missing payload') fs.unlinkSync(path.join(fx.release, entry.path));
    if (damage === 'changed payload') write(path.join(fx.release, entry.path), 'tampered');
    if (damage === 'path traversal') {
      write(path.join(fx.release, '..', 'sentinel.txt'), 'must stay outside release');
      entry.path = 'payload/../../sentinel.txt';
      entry.bytes = Buffer.byteLength('must stay outside release');
      entry.sha256 = SHA256('must stay outside release');
    }
    if (damage === 'duplicate path') fx.manifest.files.push({ ...entry, path: entry.path.replace('SKILL.md', 'skill.md').replaceAll('/', '\\') });
    if (damage === 'unexpected skill') fx.addPayload('payload/skills/unapproved-skill/SKILL.md', '# Unexpected\n');
    if (damage === 'incomplete required skills') fx.manifest.requiredSkills.pop();
    fx.saveManifest();
    const result = audit(fx);
    assert.ok(result.blockers.includes('LOCAL_RELEASE_UNAVAILABLE_OR_INVALID'));
    assert.equal(result.vaultStatus, 'unavailable');
    assert.equal(result.installedSkillCount, 0);
    assert.equal(result.cloudSyncConfirmed, false);
    assert.deepEqual(result.safety, ZERO_WRITES);
  });
}

test('a manifest omitting one required skill cannot verify all four installed packages', t => {
  const fx = fixture(t);
  fx.manifest.files = fx.manifest.files.filter(entry => !entry.path.includes('/maya-whatsapp/'));
  fx.saveManifest();
  const result = audit(fx);
  assert.ok(result.blockers.includes('INSTALLED_PACKAGE_DIFFERS'));
  assert.equal(result.installedSkillCount, 3);
  assert.equal(result.allWorkSynchronized, false);
});

test('the release pointer must identify a directory matching its commit prefix', t => {
  const fx = fixture(t);
  const pointer = path.resolve(fx.release, '../../current.json');
  write(pointer, JSON.stringify({ schemaVersion: 1, commit: NEXT_COMMIT,
    relativeReleasePath: `releases/${COMMIT.slice(0, 12)}` }));
  fx.manifest.commit = NEXT_COMMIT;
  fx.saveManifest();
  const result = audit(fx);
  assert.ok(result.blockers.includes('LOCAL_RELEASE_UNAVAILABLE_OR_INVALID'));
  assert.equal(result.vaultStatus, 'unavailable');
});

test('root manifest paths other than INSTALL.ps1 remain forbidden even with a valid hash', t => {
  const fx = fixture(t);
  fx.addPayload('unapproved-root-file.txt', 'synthetic content');
  fx.saveManifest();
  const result = audit(fx);
  assert.ok(result.blockers.includes('LOCAL_RELEASE_UNAVAILABLE_OR_INVALID'));
  assert.equal(result.installedSkillCount, 0);
});

test('approved installed differences and supplements are preserved byte for byte', t => {
  const fx = fixture(t);
  write(path.join(fx.installed, 'maya-whatsapp/SKILL.md'), '# Approved local variant\n');
  write(path.join(fx.installed, 'maya-whatsapp/approved-supplement.md'), '# Approved extra instructions\n');
  const before = fileSnapshot(fx.installed);
  const result = audit(fx);
  assert.equal(result.installedSkillCount, 3);
  assert.ok(result.blockers.includes('INSTALLED_PACKAGE_DIFFERS'));
  assert.deepEqual(fileSnapshot(fx.installed), before);
  assert.deepEqual(result.safety, ZERO_WRITES);
});

for (const target of ['wrapper', 'reporter']) {
  test(`installed ${target} must match the clean canonical source hash`, t => {
    const fx = fixture(t);
    const file = target === 'wrapper' ? fx.wrapper : path.join(fx.installed, 'management-system-telemetry/scripts/report-host-checkin.mjs');
    write(file, 'changed local executable content');
    const result = audit(fx);
    assert.equal(result.transportVerified, false);
    assert.equal(result.health, 'blocked');
    assert.ok(result.blockers.includes('LOCAL_TRANSPORT_NOT_VERIFIED'));
    assert.equal(fs.readFileSync(file, 'utf8'), 'changed local executable content');
  });
}

test('matching transport hashes require a verified clean checkout at known origin/main', t => {
  const fx = fixture(t);
  for (const localSourceVerified of [false, undefined]) {
    const result = audit(fx, { localSourceVerified });
    assert.equal(result.transportVerified, false);
    assert.equal(result.health, 'blocked');
    assert.ok(result.blockers.includes('LOCAL_TRANSPORT_NOT_VERIFIED'));
  }
});

test('Git failures and local work remain explicit blockers without leaking raw errors', t => {
  const fx = fixture(t);
  const changed = audit(fx, { status: 'LOCAL_CHANGES', localSourceVerified: false });
  assert.ok(changed.blockers.includes('LOCAL_WORK_PRESERVED'));
  const behind = audit(fx, { status: 'UPDATE_AVAILABLE', remoteCommit: NEXT_COMMIT });
  assert.ok(behind.blockers.includes('CODE_UPDATE_AVAILABLE'));
  assert.ok(behind.blockers.includes('RELEASE_BEHIND_MAIN'));
  const failed = auditStartup(fx.options, { gitReader: () => { throw new Error('PRIVATE_TOKEN_AND_CUSTOMER_TEXT'); } });
  assert.ok(failed.blockers.includes('GITHUB_UNAVAILABLE'));
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE_TOKEN_AND_CUSTOMER_TEXT/);
});

function gitExecutor(overrides = {}) {
  const calls = [];
  const outputs = {
    'remote get-url origin': 'https://github.com/oren341965/i-feel-site.git\n',
    'rev-parse HEAD': `${COMMIT}\n`,
    'rev-parse refs/remotes/origin/main': `${COMMIT}\n`,
    'status --porcelain': '',
    'ls-remote --exit-code origin refs/heads/main': `${COMMIT}\trefs/heads/main\n`,
    ...overrides,
  };
  return { calls, execute(command, args, options) {
    assert.equal(command, 'git');
    assert.deepEqual(args.slice(0, 2), ['-C', 'synthetic-repository']);
    const commandArgs = args.slice(2).join(' ');
    assert.ok(Object.hasOwn(outputs, commandArgs), `unexpected Git command: ${commandArgs}`);
    assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(options.env.GCM_INTERACTIVE, 'Never');
    assert.equal(options.env.GIT_OPTIONAL_LOCKS, '0');
    assert.equal(options.windowsHide, true);
    assert.ok(options.timeout > 0 && options.timeout <= 20_000);
    calls.push(commandArgs);
    const output = outputs[commandArgs];
    return typeof output === 'string' ? { status: 0, stdout: output, stderr: '' } : output;
  } };
}

test('Git inspection uses only bounded read commands and never fetches or changes state', () => {
  const spy = gitExecutor();
  assert.deepEqual(inspectGit('synthetic-repository', spy.execute), {
    status: 'CURRENT', localSourceVerified: true, localCommit: COMMIT, remoteCommit: COMMIT,
  });
  assert.deepEqual(spy.calls, ['remote get-url origin', 'rev-parse HEAD', 'rev-parse refs/remotes/origin/main',
    'status --porcelain', 'ls-remote --exit-code origin refs/heads/main']);
});

test('an unverified Git origin stops before any network command', () => {
  for (const remote of ['https://github.com/other/i-feel-site.git', 'https://github.com/oren341965/i-feel-site.git/extra', 'ssh://git@github.com/oren341965/i-feel-site.git']) {
    const spy = gitExecutor({ 'remote get-url origin': remote });
    assert.deepEqual(inspectGit('synthetic-repository', spy.execute), { status: 'UNVERIFIED', code: 'GIT_ORIGIN_UNVERIFIED' });
    assert.deepEqual(spy.calls, ['remote get-url origin']);
  }
});

test('dirty and non-main checkouts cannot verify canonical local source', () => {
  const dirty = gitExecutor({ 'status --porcelain': ' M synthetic-file.md\n' });
  const dirtyResult = inspectGit('synthetic-repository', dirty.execute);
  assert.equal(dirtyResult.status, 'LOCAL_CHANGES');
  assert.equal(dirtyResult.localSourceVerified, false);
  const branch = gitExecutor({ 'rev-parse HEAD': `${NEXT_COMMIT}\n` });
  assert.equal(inspectGit('synthetic-repository', branch.execute).localSourceVerified, false);
});

test('GitHub unavailability retains only verified local source status and a safe code', () => {
  const spy = gitExecutor({ 'ls-remote --exit-code origin refs/heads/main': { status: 128, stdout: '', stderr: 'PRIVATE_AUTH_DETAIL' } });
  assert.deepEqual(inspectGit('synthetic-repository', spy.execute), {
    status: 'UNVERIFIED', code: 'GITHUB_UNAVAILABLE', localSourceVerified: true,
  });
});

test('unverified transport and wrong workstation prevent even a wrapper dry run', () => {
  for (const value of [reportAudit({ transportVerified: false }), reportAudit({ blockers: ['WRONG_WORKSTATION'] })]) {
    const result = reportStartup(value, REPORT_OPTIONS, () => assert.fail('wrapper must not execute'));
    assert.deepEqual(result, { status: 'BLOCKED', attempts: 0, code: 'LOCAL_TRANSPORT_NOT_VERIFIED' });
  }
});

test('a credential dry run must match every audited field before any POST attempt', () => {
  for (const changes of [{ hostSlug: 'office' }, { checkinKey: 'wrong-key' }, { healthStatus: 'healthy' },
    { sourceMode: 'interactive' }, { installedSkillCount: 3 }, { vaultStatus: 'synchronized' },
    { observedAt: '2026-09-28T08:09:11Z' }]) {
    let calls = 0;
    const result = reportStartup(reportAudit(), REPORT_OPTIONS, (wrapper, args) => {
      calls += 1;
      assert.equal(wrapper, REPORT_OPTIONS.wrapper);
      assert.equal(args.at(-1), '--dry-run');
      return dryReceipt(args, changes);
    });
    assert.equal(calls, 1);
    assert.deepEqual(result, { status: 'BLOCKED', attempts: 0, code: 'CREDENTIAL_WRAPPER_NOT_VERIFIED' });
  }
});

test('transient reporting failure retries once with the identical key, timestamp and arguments', () => {
  const calls = [];
  const result = reportStartup(reportAudit(), REPORT_OPTIONS, (wrapper, args) => {
    calls.push([...args]);
    if (calls.length === 1) return dryReceipt(args);
    if (calls.length === 2) return { ok: false, code: 'REPORT_UNAVAILABLE' };
    return centralReceipt();
  });
  assert.deepEqual(result, { status: 'ACCEPTED', attempts: 2 });
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].slice(0, -1), calls[1]);
  assert.equal(calls[0].at(-1), '--dry-run');
  assert.deepEqual(calls[1], calls[2]);
  const value = flag => calls[1][calls[1].indexOf(flag) + 1];
  assert.equal(value('--checkin-key'), CHECKIN_KEY);
  assert.equal(value('--observed-at'), OBSERVED_AT);
  assert.equal(value('--evidence-ref'), `maya_startup:${CHECKIN_KEY}:git_CURRENT:`);
  assert.equal(value('--app-version'), COMMIT.slice(0, 12));
});

test('repeated failure is bounded to two POST attempts and never exposes raw transport errors', () => {
  let calls = 0;
  const result = reportStartup(reportAudit(), REPORT_OPTIONS, (wrapper, args) => ++calls === 1 ? dryReceipt(args) : {
    ok: false, code: 'REPORT_UNAVAILABLE', stderr: 'PRIVATE_TOKEN_VALUE', error: 'PRIVATE_CUSTOMER_MESSAGE',
  });
  assert.equal(calls, 3);
  assert.deepEqual(result, { status: 'PENDING', attempts: 2, code: 'CENTRAL_RECEIPT_NOT_VERIFIED' });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
});

for (const rejectedAttempt of [1, 2]) {
  test(`identity rejection stops at actual POST attempt ${rejectedAttempt}`, () => {
    let calls = 0;
    const result = reportStartup(reportAudit(), REPORT_OPTIONS, (wrapper, args) => {
      calls += 1;
      if (calls === 1) return dryReceipt(args);
      return { ok: false, code: calls - 1 === rejectedAttempt ? 'IDENTITY_REJECTED' : 'REPORT_UNAVAILABLE' };
    });
    assert.equal(calls, rejectedAttempt + 1);
    assert.deepEqual(result, { status: 'PENDING', attempts: rejectedAttempt, code: 'CENTRAL_RECEIPT_NOT_VERIFIED' });
  });
}

test('equivalent canonical timestamp representations verify the central acknowledgement', () => {
  for (const observedAt of ['2026-09-28T08:09:10Z', '2026-09-28T08:09:10.000Z', '2026-09-28T11:09:10+03:00']) {
    let calls = 0;
    const result = reportStartup(reportAudit(), REPORT_OPTIONS, (wrapper, args) => ++calls === 1 ? dryReceipt(args, { observedAt }) : centralReceipt({ observedAt }));
    assert.deepEqual(result, { status: 'ACCEPTED', attempts: 1 });
  }
});

test('a successful response with an unverified receipt is never accepted or retried', () => {
  for (const mismatch of [{ hostSlug: 'office' }, { checkinKey: 'different-key' }, { healthStatus: 'healthy' },
    { observedAt: '2026-09-28T08:09:11Z' }, { observedAt: 'invalid' }]) {
    let calls = 0;
    const result = reportStartup(reportAudit(), REPORT_OPTIONS, (wrapper, args) => ++calls === 1 ? dryReceipt(args) : centralReceipt(mismatch));
    assert.equal(calls, 2);
    assert.deepEqual(result, { status: 'PENDING', attempts: 1, code: 'CENTRAL_RECEIPT_NOT_VERIFIED' });
  }
});

test('local receipts use create-new semantics and refuse to overwrite a duplicate key', t => {
  const root = temporaryDirectory(t);
  const record = { checkinKey: CHECKIN_KEY, observedAt: OBSERVED_AT, report: { status: 'PENDING' } };
  saveLocalReceipt(root, record);
  const file = path.join(root, 'state/startup-checkins', `${CHECKIN_KEY}.json`);
  const original = fs.readFileSync(file, 'utf8');
  assert.deepEqual(JSON.parse(original), record);
  assert.throws(() => saveLocalReceipt(root, { ...record, report: { status: 'ACCEPTED' } }), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [`${CHECKIN_KEY}.json`]);
});

test('an invalid receipt key cannot create state directories or escape the destination', t => {
  const root = temporaryDirectory(t);
  for (const checkinKey of ['../../escaped', `${CHECKIN_KEY}/extra`, '', 'maya-startup-invalid']) {
    assert.throws(() => saveLocalReceipt(root, { checkinKey }), /INVALID_KEY/);
  }
  assert.deepEqual(fs.readdirSync(root), []);
});

for (const boundary of ['root', 'state', 'startup-checkins']) {
  test(`a junction at the ${boundary} boundary cannot redirect receipt writes`, t => {
    const base = temporaryDirectory(t);
    const outside = path.join(base, 'outside');
    const root = path.join(base, 'runtime');
    fs.mkdirSync(outside);
    write(path.join(outside, 'sentinel.txt'), 'untouched');
    let link;
    if (boundary === 'root') link = root;
    else {
      fs.mkdirSync(root);
      link = path.join(root, 'state');
      if (boundary === 'startup-checkins') {
        fs.mkdirSync(link);
        link = path.join(link, 'startup-checkins');
      }
    }
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => saveLocalReceipt(root, { checkinKey: CHECKIN_KEY }), /REPARSE_DESTINATION/);
    assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'untouched');
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup({ shareFails = false, sendFails = false, sheetFails = false } = {}) {
  const stored = new Map();
  const sent = [];
  const tracked = [];
  let translations = 0;
  const iterator = (items) => ({ hasNext: () => items.length > 0, next: () => items.shift() });
  const folder = {
    getFilesByName: name => iterator(stored.has(name) ? [stored.get(name)] : []),
    createFile: (blob, content) => {
      const name = typeof blob === 'string' ? blob : blob.name;
      let data = content;
      const file = {
        getSize: () => blob.bytes?.length || 0,
        addViewers: viewers => { if (shareFails) throw new Error('sharing denied'); file.viewers = viewers; },
        getId: () => 'drive-file-' + name,
        getUrl: () => 'https://drive.google.com/file/d/drive-file-' + name + '/view',
        getBlob: () => ({ getDataAsString: () => data }),
        setContent: value => { data = value; }
      };
      stored.set(name, file); return file;
    }
  };
  let eventFolder = false;
  const context = vm.createContext({
    DriveApp: { getFolderById: id => {
      assert.equal(id, '1xEElpkLxeCgXrYBJ-920IAPuqiN-tWxw');
      return { getFoldersByName: () => iterator(eventFolder ? [folder] : []), createFolder: () => { eventFolder = true; return folder; } };
    } },
    Utilities: { base64Decode: value => [...Buffer.from(value, 'base64')], newBlob: (bytes, mime, name) => ({ bytes, mime, name }) },
    LanguageApp: { translate: (text, from, language) => { translations++; return language + ': translated fault'; } },
    MailApp: { sendEmail: message => { if (sendFails) throw new Error('mail outcome uncertain'); sent.push([message.to, message.subject, message.body, message]); } },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'oren@i-feel.co.il' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    saveFault_: payload => { if (sheetFails) throw new Error('sheet unavailable'); tracked.push(payload); }
  });
  vm.runInContext(fs.readFileSync('tools/google-apps-script/mcohome-faults/Delivery.gs', 'utf8'), context);
  const payload = { eventId: 'MCO-20261014-100005-F3EFC4', employeeEmail: 'refael@i-feel.co.il', description: 'תקלה חוזרת', model: 'MH-C621', repeatCount: 3, vendorEvidenceLinks: ['https://i-feel.co.il/staff-expenses/mcohome-evidence.php?id=MCO-20261014-100005-F3EFC4&f=0&token=' + 'b'.repeat(64)], evidenceFiles: [{ key: 'a'.repeat(32) + '.mp4', name: 'fault.mp4', mime: 'video/mp4', size: 3, base64: 'YWJj' }] };
  return { run: (p = payload) => context.deliverFault_(p), payload, sent, stored, tracked, translated: () => translations };
}

test('video stored, recipients granted access, full description translated, same message copied and tracked', () => {
  const s = setup(); const r = s.run();
  assert.equal(r.status, 'submitted');
  assert.deepEqual([...r.to], ['kristin@mcohome.com', 'dzsh@mcohome.com']);
  assert.deepEqual([...r.cc], ['oren@i-feel.co.il', 'arik@i-feel.co.il', 'refael@i-feel.co.il']);
  assert.equal(s.translated(), 2);
  assert.match(s.sent[0][2], /en: translated fault/);
  assert.match(s.sent[0][2], /zh-CN: translated fault/);
  assert.match(s.sent[0][2], /drive.google.com/);
  assert.equal(s.sent[0][3].cc, r.cc.join(','));
  assert.equal(s.sent[0][3].attachments.length, 1);
  assert.equal(s.sent[0][3].attachments[0].mime, 'video/mp4');
  assert.match(s.sent[0][2], /no employee login/);
  assert.doesNotMatch(s.sent[0][2], /mcohome-media\.php/);
  assert.equal(s.stored.get('a'.repeat(32) + '.mp4').viewers.length, 5);
  assert.equal(s.tracked.at(-1).sentToMcohome, true);
  assert.ok(s.tracked.at(-1).followUpDue);
  s.run(); assert.equal(s.sent.length, 1); assert.equal(s.stored.size, 2);
});
test('sharing failure blocks mail', () => { const s = setup({ shareFails: true }); assert.throws(() => s.run(), /sharing denied/); assert.equal(s.sent.length, 0); });
test('tracking failure blocks mail', () => { const s = setup({ sheetFails: true }); assert.throws(() => s.run(), /sheet unavailable/); assert.equal(s.sent.length, 0); });
test('uncertain submission never automatically resends', () => { const s = setup({ sendFails: true }); assert.throws(() => s.run(), /uncertain/); assert.throws(() => s.run(), /outcome unknown/); });
test('reject non-company technician and malformed media before external work', () => { const s = setup(); assert.throws(() => s.run({ ...s.payload, employeeEmail: 'other@example.com' }), /technician/); assert.throws(() => s.run({ ...s.payload, evidenceFiles: [{ ...s.payload.evidenceFiles[0], size: 50 }] }), /size/); assert.equal(s.stored.size, 0); });
test('reject employee-only or third-party links before sending', () => {
  const s = setup();
  assert.throws(() => s.run({ ...s.payload, vendorEvidenceLinks: ['https://i-feel.co.il/staff-expenses/mcohome-media.php?id=' + s.payload.eventId] }), /Invalid manufacturer/);
  assert.equal(s.sent.length, 0);
});

for (const missing of ['evidence', 'description']) {
  test('incomplete ' + missing + ' blocks all external work', () => {
    const s = setup();
    const payload = { ...s.payload, ...(missing === 'evidence' ? { evidenceFiles: [] } : { description: '  ' }) };
    assert.throws(() => s.run(payload), /evidence|description/);
    assert.equal(s.sent.length, 0);
    assert.equal(s.stored.size, 0);
  });
}

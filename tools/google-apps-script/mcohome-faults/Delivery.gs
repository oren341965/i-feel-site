// Portal-only delivery. The root folder remains private; share individual evidence files.
const MCOHOME_DRIVE_ROOT_ID = '1xEElpkLxeCgXrYBJ-920IAPuqiN-tWxw';
const MCOHOME_DRIVE_TRANSFER_LIMIT = 30 * 1024 * 1024;

function deliverFault_(payload) {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== 'oren@i-feel.co.il') {
    throw new Error('Deploy as the verified Oren account');
  }
  const id = String(payload.eventId || '');
  if (!/^MCO-\d{8}-\d{6}-[A-F0-9]{6}$/.test(id)) throw new Error('Invalid Event ID');
  const technician = String(payload.employeeEmail || '').toLowerCase();
  if (!/^[a-z0-9._+-]+@i-feel\.co\.il$/.test(technician)) throw new Error('Invalid technician');
  const to = ['kristin@mcohome.com', 'dzsh@mcohome.com'];
  const cc = Array.from(new Set(['oren@i-feel.co.il', 'arik@i-feel.co.il', technician]));
  const viewers = Array.from(new Set(to.concat(cc)));
  const files = payload.evidenceFiles || [];
  if (!Array.isArray(files) || files.length > 6) throw new Error('Invalid evidence');
  const decoded = files.map(function (file, index) {
    if (!/^[a-f0-9]{32}\.(jpg|png|webp|heic|heif|avif|mp4|mov|webm)$/.test(file.key || '')) {
      throw new Error('Invalid evidence key');
    }
    if (!/^(image|video)\//.test(file.mime || '')) throw new Error('Invalid evidence MIME');
    const bytes = Utilities.base64Decode(file.base64 || '');
    if (!bytes.length || bytes.length !== Number(file.size)) throw new Error('Invalid evidence size');
    return { key: file.key, name: String(file.name || 'evidence-' + index), mime: file.mime, bytes: bytes };
  });
  if (decoded.reduce(function (sum, file) { return sum + file.bytes.length; }, 0) > MCOHOME_DRIVE_TRANSFER_LIMIT) {
    throw new Error('Evidence exceeds 30 MiB; originals retained on I Feel server');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const root = DriveApp.getFolderById(MCOHOME_DRIVE_ROOT_ID);
    const folders = root.getFoldersByName(id);
    const folder = folders.hasNext() ? folders.next() : root.createFolder(id);
    const manifests = folder.getFilesByName('delivery.json');
    let manifestFile = manifests.hasNext() ? manifests.next() : null;
    let receipt = manifestFile ? JSON.parse(manifestFile.getBlob().getDataAsString()) : null;
    if (receipt && receipt.status === 'submitted') return receipt;
    // A timeout around Gmail submission is ambiguous. Never automatically send twice.
    if (receipt && receipt.status === 'submitting') throw new Error('Delivery outcome unknown; inspect Gmail Sent before retry');
    function persist(value) {
      const json = JSON.stringify(value);
      if (manifestFile) manifestFile.setContent(json);
      else manifestFile = folder.createFile('delivery.json', json, 'application/json');
    }
    const evidence = decoded.map(function (file) {
      const existing = folder.getFilesByName(file.key);
      const uploaded = existing.hasNext() ? existing.next() : folder.createFile(Utilities.newBlob(file.bytes, file.mime, file.key));
      if (uploaded.getSize() !== file.bytes.length) throw new Error('Drive size verification failed');
      uploaded.addViewers(viewers);
      // addViewers throws if access cannot be granted; do not send inaccessible evidence.
      return { id: uploaded.getId(), url: uploaded.getUrl(), name: file.name, size: file.bytes.length };
    });
    const description = String(payload.description || '').trim();
    if (!description) throw new Error('Fault description required');
    const text = [description, 'סוג יחידה: ' + String(payload.deviceType || ''),
      'סוג תקלה: ' + String(payload.faultType || ''), 'עומס: ' + String(payload.loadContext || ''),
      'פעולה שבוצעה: ' + String(payload.actionTaken || ''), 'הערות: ' + String(payload.notes || '')].join('\n');
    const en = LanguageApp.translate(text, '', 'en');
    const cn = LanguageApp.translate(text, '', 'zh-CN');
    if (!en.trim() || !cn.trim()) throw new Error('Translation failed');
    const vendorLinks = payload.vendorEvidenceLinks || [];
    if (!Array.isArray(vendorLinks) || vendorLinks.length !== evidence.length) throw new Error('Missing manufacturer-accessible evidence links');
    vendorLinks.forEach(function (url, index) {
      const expected = 'https://i-feel.co.il/staff-expenses/mcohome-evidence.php?id=' + id + '&f=' + index + '&token=';
      if (typeof url !== 'string' || !url.startsWith(expected) || !/^[a-f0-9]{64}$/.test(url.slice(expected.length))) {
        throw new Error('Invalid manufacturer evidence link');
      }
    });
    const links = evidence.map(function (file, index) {
      return file.name + '\nWatch / download (no employee login): ' + vendorLinks[index] + '\nGoogle Drive archive: ' + file.url;
    }).join('\n\n') || 'No media submitted / 未提交媒体';
    let attachmentBytes = 0;
    const attachments = [];
    const attachmentNames = [];
    decoded.slice().sort(function (a, b) { return Number(b.mime.startsWith('video/')) - Number(a.mime.startsWith('video/')); }).forEach(function (file) {
      if (attachmentBytes + file.bytes.length <= 12 * 1024 * 1024) {
        attachments.push(Utilities.newBlob(file.bytes, file.mime, file.name));
        attachmentNames.push(file.name);
        attachmentBytes += file.bytes.length;
      }
    });
    const subject = '[I Feel][' + String(payload.severity || 'NORMAL') + '] MCOHome fault ' + id + ' - ' + String(payload.model || '');
    const due = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const body = [
      'Dear Kristin and MCOHome Technical Team,', '', 'ENGLISH',
      'Event ID: ' + id, 'Model / SKU: ' + String(payload.model || 'Not provided'),
      'Serial number: ' + String(payload.serialNumber || 'Not provided'),
      'Controller: ' + String(payload.controller || 'Not provided'), 'Node ID: ' + String(payload.nodeId || 'Not provided'),
      'Reported by: ' + technician, 'Occurrences recorded: ' + Number(payload.repeatCount || 1),
      'Fault description (automatic translation): ' + en,
      'Please acknowledge receipt and video access. Provide your diagnosis, Root Cause and permanent corrective action.',
      'Please reply to all and retain the Event ID. I Feel follow-up due: ' + due,
      'Short videos are attached where the email size limit permits. The I Feel watch/download link needs no employee account and expires in 30 days.',
      'Evidence:\n' + links, '', '中文',
      '事件编号: ' + id, '型号: ' + String(payload.model || '未提供'),
      '序列号: ' + String(payload.serialNumber || '未提供'),
      '报告人: ' + technician, '已记录次数: ' + Number(payload.repeatCount || 1),
      '故障描述（自动翻译）: ' + cn,
      '请确认收到邮件并能够访问视频。请提供诊断、根本原因分析和永久纠正措施。',
      '请回复所有收件人并保留事件编号。I Feel 跟进日期: ' + due,
      '邮件大小允许时，短视频将直接作为附件发送。I Feel 视频链接无需员工账号，30天后过期。',
      '证据:\n' + links, '', 'Original technician description / 原始说明:', text
    ].join('\n');
    const tracked = Object.assign({}, payload, { mediaLinks: evidence.map(function (f) { return f.url; }), sentToMcohome: false, owner: 'arik@i-feel.co.il', unitStatus: 'ממתין לשליחה ליצרן', driveStatus: 'completed', deliveryStatus: 'submitting', followUpDue: due });
    saveFault_(tracked, true, true);
    receipt = { eventId: id, status: 'submitting', driveStatus: 'completed', evidence: evidence, vendorEvidenceLinks: vendorLinks, attachmentNames: attachmentNames, to: to, cc: cc, subject: subject, body: body, owner: 'arik@i-feel.co.il', followUpDue: due };
    persist(receipt);
    GmailApp.sendEmail(to.join(','), subject, body, { cc: cc.join(','), replyTo: 'oren@i-feel.co.il', name: 'I Feel Technical Team', attachments: attachments });
    receipt.status = 'submitted';
    receipt.submittedAt = new Date().toISOString();
    persist(receipt);
    try {
      saveFault_(Object.assign({}, tracked, { sentToMcohome: true, unitStatus: 'ממתין לתשובת יצרן', deliveryStatus: 'submitted' }), true, true);
      receipt.trackingStatus = 'completed';
    } catch (error) {
      receipt.trackingStatus = 'failed';
    }
    return receipt;
  } finally {
    lock.releaseLock();
  }
}

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const bootstrapPath = path.resolve(process.argv[2] ?? "public/mt-law/_bootstrap.php");
const portalDirectory = path.dirname(bootstrapPath);
const gateViewPath = path.join(portalDirectory, "_gate_view.php");
const legacyPagePath = path.join(portalDirectory, "index.php");

async function writeWhenChanged(filePath, before, after, label) {
  if (before === after) {
    console.log(`${label} already has the required production-safe content: ${filePath}.`);
    return;
  }
  await writeFile(filePath, after, "utf8");
  console.log(`${label} patched: ${filePath}.`);
}

let bootstrap = await readFile(bootstrapPath, "utf8");
const bootstrapBefore = bootstrap;
const php8Signature = "function mtlaw_h(mixed $value): string";
const php74Signature = "function mtlaw_h($value): string";

if (bootstrap.includes(php8Signature)) {
  bootstrap = bootstrap.replace(php8Signature, php74Signature);
} else if (!bootstrap.includes(php74Signature)) {
  throw new Error(`Expected MT-Law helper signature was not found in ${bootstrapPath}.`);
}

const directoryRedirect = "return '/mt-law/';";
const directGateRedirect = "return '/mt-law/gate.php';";
if (bootstrap.includes(directoryRedirect)) {
  bootstrap = bootstrap.replace(directoryRedirect, directGateRedirect);
} else if (!bootstrap.includes(directGateRedirect)) {
  throw new Error(`Expected MT-Law redirect base was not found in ${bootstrapPath}.`);
}

if (/\bmixed\s+\$/.test(bootstrap)) {
  throw new Error(`PHP 8 mixed parameter type still exists in ${bootstrapPath}.`);
}
if (!bootstrap.includes(directGateRedirect)) {
  throw new Error(`MT-Law redirects are not pointing directly to gate.php in ${bootstrapPath}.`);
}
await writeWhenChanged(bootstrapPath, bootstrapBefore, bootstrap, "MT-Law bootstrap");

let gateView = await readFile(gateViewPath, "utf8");
const gateViewBefore = gateView;
gateView = gateView.replaceAll('action="/mt-law/"', 'action="/mt-law/gate.php"');

gateView = gateView.replace(
  '<input type="checkbox" name="marketing_opt_in" value="yes">',
  '<input type="checkbox" name="marketing_opt_in" value="yes" required aria-required="true">',
);
gateView = gateView.replace(
  '<strong>כן, אשמח לקבל פעם בחודש רעיונות והטבות</strong>',
  '<strong>אני מאשר או מאשרת לקבל מ-I Feel עדכונים והטבות בדואר האלקטרוני</strong>',
);
gateView = gateView.replace(
  '<small>הבחירה אינה תנאי לכניסה. ניתן להסיר את עצמכם בכל עת.</small>',
  '<small>האישור נדרש לקבלת קוד הכניסה. ניתן לבטל את ההרשמה בכל עת באמצעות קישור ההסרה בכל הודעה.</small>',
);

if (gateView.includes('action="/mt-law/"')) {
  throw new Error(`A directory POST target still exists in ${gateViewPath}.`);
}
if (!gateView.includes('action="/mt-law/gate.php"')) {
  throw new Error(`Direct gate.php form targets are missing from ${gateViewPath}.`);
}
if (!gateView.includes('name="marketing_opt_in" value="yes" required aria-required="true"')) {
  throw new Error(`Required mailing consent is missing from ${gateViewPath}.`);
}
await writeWhenChanged(gateViewPath, gateViewBefore, gateView, "MT-Law entry forms");

let legacyPage = await readFile(legacyPagePath, "utf8");
const legacyPageBefore = legacyPage;
legacyPage = legacyPage.replaceAll('action="/mt-law/"', 'action="/mt-law/gate.php"');
if (legacyPage.includes('action="/mt-law/"')) {
  throw new Error(`A directory POST target still exists in ${legacyPagePath}.`);
}
await writeWhenChanged(legacyPagePath, legacyPageBefore, legacyPage, "MT-Law verified forms");

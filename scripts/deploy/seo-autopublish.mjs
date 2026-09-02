#!/usr/bin/env node
/**
 * seo-autopublish.mjs — legacy-compatible safe publisher for an SEO work branch.
 *
 * The old script created a PR with a manually loaded token and enabled auto-merge.
 * That crossed the repository's explicit merge-approval boundary. The compatibility
 * entry point now delegates to the canonical workstation publisher, uses the existing
 * Git/GitHub authentication, opens a Draft PR, and never merges or deploys.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEO_BRANCH_RE = /^work\/seo-/;

function git(args) {
  return execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8" }).trim();
}

function main() {
  const titleIdx = process.argv.indexOf("--title");
  const title = titleIdx > -1 ? process.argv[titleIdx + 1] : null;
  if (!title) throw new Error('חסר --title "..."');

  const commitIdx = process.argv.indexOf("--commit-message");
  const commitMessage = commitIdx > -1 ? process.argv[commitIdx + 1] : title;
  if (!commitMessage) throw new Error('חסר --commit-message "..."');

  const branch = git(["branch", "--show-current"]);
  if (!branch) throw new Error("HEAD מנותק — אין ענף לפרסם.");
  if (!SEO_BRANCH_RE.test(branch)) throw new Error(`הענף '${branch}' אינו ענף SEO ייחודי מסוג work/seo-*.`);

  const publishScript = resolve(REPO_ROOT, "scripts", "workstations", "publish-work.ps1");
  const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
  execFileSync(powershell, [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", publishScript,
    "-CommitMessage", commitMessage,
    "-PrTitle", title,
  ], { cwd: REPO_ROOT, stdio: "inherit" });

  console.log("Draft PR הוכן. לא בוצעו merge, פריסה או טיפול ב-Token ידני.");
}

try {
  main();
} catch (e) {
  console.error(`שגיאה: ${e.message}`);
  process.exit(1);
}


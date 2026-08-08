
#!/usr/bin/env node
/**
 * seo-autopublish.mjs — פרסום אוטומטי של מהלך SEO יומי מהריצה בענן.
 *
 * מה הוא עושה:
 *   1. קורא GitHub token מ-env (IFEEL_GH_TOKEN) או מ-.env.local בשורש הריפו.
 *   2. דוחף את ענף העבודה הנוכחי (חייב להתחיל ב-"work/") ל-origin עם הטוקן.
 *   3. פותח Pull Request מול main דרך GitHub REST API.
 *   4. מפעיל auto-merge (squash), שממתין ל-required checks של main.
 *
 * ה-merge ל-main מפעיל את deploy.yml → runner ifeel-deploy → FTPS → verify-live.
 *
 * שימוש:
 *   node scripts/deploy/seo-autopublish.mjs --title "כותרת ה-PR"
 *
 * גבולות בטיחות (קשיחים):
 *   - רץ אך ורק על ענף שמתחיל ב-"work/". לעולם לא דוחף ישירות ל-main.
 *   - ממזג רק ענפים בתבנית work/seo-* (מהלך SEO מתוחם). כל שם אחר → נעצר, מדווח, לא ממזג.
 *   - אם auto-merge אינו זמין, משאיר את ה-PR פתוח ולעולם לא עוקף את ההגנות במיזוג ישיר.
 *   - לא מוחק דבר. לא נוגע ב-secrets.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "oren341965/i-feel-site";
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SEO_BRANCH_RE = /^work\/seo-/;

function git(args) {
  return execFileSync("git", ["-C", REPO_ROOT, ...args], { encoding: "utf8" }).trim();
}

function loadToken() {
  if (process.env.IFEEL_GH_TOKEN) return process.env.IFEEL_GH_TOKEN.trim();
  const envFile = resolve(REPO_ROOT, ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*IFEEL_GH_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  throw new Error("לא נמצא IFEEL_GH_TOKEN (env או .env.local). ראה .env.example.");
}

async function gh(token, method, path, body) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ifeel-seo-autopublish",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`GitHub ${method} ${path} → ${res.status}: ${data.message || text}`);
  return data;
}

async function main() {
  const titleIdx = process.argv.indexOf("--title");
  const title = titleIdx > -1 ? process.argv[titleIdx + 1] : null;
  if (!title) throw new Error('חסר --title "..."');

  const branch = git(["branch", "--show-current"]);
  if (!branch) throw new Error("HEAD מנותק — אין ענף לפרסם.");
  if (branch === "main" || branch === "master") throw new Error(`דחיפה ישירה מ-${branch} חסומה.`);
  if (!branch.startsWith("work/")) throw new Error(`הענף '${branch}' אינו ענף עבודה (חייב להתחיל ב-work/).`);

  const token = loadToken();
  const authUrl = `https://x-access-token:${token}@github.com/${REPO}.git`;

  // 1. push
  git(["push", "--set-upstream", authUrl, `${branch}:${branch}`]);
  console.log(`נדחף: ${branch}`);

  // 2. PR
  const pr = await gh(token, "POST", `/repos/${REPO}/pulls`, {
    title,
    head: branch,
    base: "main",
    body: "פורסם אוטומטית ע\"י הריצה היומית של daily-seo-crawl.\n\n- נבנה ואומת ב-CI (deploy.yml validate)\n- ללא דחיפה ישירה ל-main\n- דיפלוי לשרת רק אחרי merge",
  });
  console.log(`PR #${pr.number}: ${pr.html_url}`);

  // 3. merge — רק לענפי SEO מתוחמים
  if (!SEO_BRANCH_RE.test(branch)) {
    console.log(`הענף אינו work/seo-* → נעצר לפני merge. מזג ידנית: ${pr.html_url}`);
    return;
  }
  try {
    // ניסיון auto-merge (יחכה ל-required checks אם מוגדרים)
    const q = `mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}`;
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "User-Agent": "ifeel-seo-autopublish" },
      body: JSON.stringify({ query: q, variables: { id: pr.node_id } }),
    });
    const j = await r.json();
    if (j.errors) throw new Error(j.errors.map((e) => e.message).join("; "));
    console.log("auto-merge הופעל — ימוזג אוטומטית כשה-checks ירוקים.");
  } catch (e) {
    throw new Error(`auto-merge לא הופעל (${e.message}). ה-PR נשאר פתוח ולא בוצע merge ישיר: ${pr.html_url}`);
  }
}

main().catch((e) => {
  console.error(`שגיאה: ${e.message}`);
  process.exit(1);
});


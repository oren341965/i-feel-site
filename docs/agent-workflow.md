# סביבת עבודה משותפת — Claude, Codex ושני מחשבים

## מטרה

GitHub הוא מקור האמת היחיד. מחשב הבית ומחשב המשרד רשאים להכין ולהעלות ענפי עבודה,
אך אינם מעלים ישירות ל-JetServer. לאחר merge ל-`main`, GitHub Actions מעביר artifact
מאומת ל-runner של מחשב המשרד, והוא מעלה אותו ב-FTPS מתוך ישראל.

## הקמה חד-פעמית בכל מחשב

### 1. התקנת כלים

נדרשים:

- Git for Windows
- GitHub CLI (`gh`)
- Node.js 20 ומעלה
- Git LFS
- Claude Code ו/או Codex

### 2. התחברות נפרדת ל-GitHub

בכל מחשב מריצים:

```powershell
gh auth login
gh auth status
git lfs install
```

יש להתחבר לחשבון שמורשה לכתוב ל-`oren341965/i-feel-site`. אין להעתיק PAT, סיסמה
או קובץ credentials ממחשב אחד לאחר; כל מחשב מקבל התחברות משלו.

### 3. clone קנוני

```powershell
git clone https://github.com/oren341965/i-feel-site.git C:\Users\<USER>\i-feel-site
Set-Location C:\Users\<USER>\i-feel-site
```

אין להשתמש ב-clones ישנים. בכל מחשב נשמר clone פעיל אחד בלבד.

### 4. התקנת ההוראות והסקילים

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\workstations\install-agent-config.ps1
```

הסקריפט:

- מגבה הגדרות קיימות אל `%USERPROFILE%\.ifeel-agent-backups`;
- מתקין את `CLAUDE.md` ברמת המשתמש;
- מתקין את `AGENTS.md` ברמת Codex;
- ממזג כללי הרשאה בטוחים ל-Claude;
- מתקין את כל `.claude/skills` גם ל-Claude וגם ל-Codex;
- אינו מוחק סקילים אחרים שאינם מנוהלים על-ידי הריפו.

לאחר ההתקנה מפעילים מחדש את Claude ואת Codex.

## עבודה יומית

### התחלת משימה

מתוך clone נקי:

```powershell
.\scripts\workstations\new-work.ps1 -Slug update-example
```

נוצר ענף ייחודי למחשב, לדוגמה:

```text
work/office-pc/20260723-update-example
work/home-pc/20260723-update-example
```

### פרסום העבודה

```powershell
.\scripts\workstations\publish-work.ps1 `
  -CommitMessage "content: update example page" `
  -PrTitle "Update example page"
```

הסקריפט:

1. מוודא שלא עובדים על `main`;
2. חוסם מחיקות וקבצים גדולים שאינם ב-LFS;
3. מריץ build ובדיקות;
4. מבצע commit;
5. מבצע `fetch` ו-`rebase` על `origin/main`;
6. דוחף את ענף העבודה;
7. פותח Draft Pull Request.

מחיקה דורשת אישור מפורש והפרמטר `-AllowDeletion`.

### סנכרון הגדרות וסקילים

כאשר אין עבודה פתוחה ונמצאים על `main`:

```powershell
.\scripts\workstations\sync-workstation.ps1
```

הסקריפט מבצע `pull --ff-only` ומתקין מחדש את ההוראות והסקילים מה-commit שנמשך.

## הגנות GitHub נדרשות

ב-Repository Settings מגדירים Ruleset ל-`main`:

- Require a pull request before merging
- Require status check: `Validate site`
- Block force pushes
- Block branch deletion
- Require branch to be up to date before merging

ה-merge המאושר ל-`main` הוא שער האישור לפריסה. סביבת `production` מחזיקה את ה-secrets,
אך אין להגדיר בה Required reviewer אם רוצים שהפריסה תמשיך אוטומטית מיד לאחר ה-merge.

## מחשב המשרד כ-runner של הפריסה

ב-GitHub:

1. `Settings → Actions → Runners → New self-hosted runner`
2. לבחור Windows x64.
3. להריץ במחשב המשרד את הפקודות ש-GitHub מציג.
4. להוסיף label: `ifeel-deploy`.
5. להתקין את ה-runner כ-Windows service.

Token הרישום הוא חד-פעמי וסודי. אין להעתיק אותו לצ'אט או לריפו.

## Secrets לסביבת production

ב-`Settings → Environments → production` מוסיפים:

| Secret | ערך |
|---|---|
| `IFEEL_FTP_SERVER` | שרת JetServer ללא סיסמה |
| `IFEEL_FTP_USERNAME` | משתמש FTP |
| `IFEEL_FTP_PASSWORD` | סיסמת FTP |
| `IFEEL_FTP_SERVER_DIR` | בדרך כלל `public_html` |

## התנהגות הפריסה

- ה-build מתבצע על runner של GitHub ב-Linux.
- `dist` נשמר כ-artifact מזוהה לפי commit SHA.
- מחשב המשרד מוריד בדיוק את ה-artifact שנבדק.
- נכסים עולים לפני HTML ו-`.htaccess`.
- אין פקודת delete, mirror או ניקוי מרחוק.
- לאחר ההעלאה נבדקים דף הבית, sitemap, robots ו-llms.

אם runner המשרד אינו מחובר, ה-deploy נשאר בתור ואינו עוקף את GitHub.

## AI Sales בשני מחשבים

מחשב אורן מריץ את Codex, Claude, `ai-sales-manager` ואת ה־runtime המקומי. ה־SQLite הפעיל נשאר מקומי תחת `C:\ifeel-sales` ואינו מסונכרן דרך Dropbox. מחשב Maya מריץ Claude, את הסקילים הקנוניים `maya-email-maintenance` ו־`maya-whatsapp`, ואת Obsidian; `maya-agent` הוא מזהה Bus ישן בלבד ואינו סקיל עצמאי. התקנת runtime או Task Scheduler היא שלב נפרד ואינה חלק מעדכון הסקילים.

שני המחשבים רשאים להשתמש ב־Dropbox Obsidian Vault משותף. כל מחשב מגדיר `VAULT_ROOT` לנתיב המקומי שלו; אין להכניס נתיב משתמש קשיח לריפו. המבנה המוצע וה־file-bridge מתועדים תחת `ai-sales-manager/references/vault-layout.md`.

ה־Vault משמש להודעות ול־snapshots מצטברים בלבד. אין לשמור בו DB חי, secrets, פרטי קשר של לקוחות או תוכן גולמי של מיילים/WhatsApp. הודעות מזוהות באמצעות ID בלתי משתנה, נדחות אם הן stale או כפולות, ואינן מועברות ל־`processed` ב־maturity 0.

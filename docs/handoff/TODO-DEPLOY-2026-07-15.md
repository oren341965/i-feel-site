# משימה פתוחה: העלאת llms.txt החדש (2026-07-15)

## מה קרה

- `public/llms.txt` הוחלף בגרסה חדשה שאורן אישר (קומיט `344822a`). הקישורים נוקו מעטיפות Gmail.
- build ירוק (111 דפים), `dist\llms.txt` עבר את כל בדיקות הקדם-העלאה.
- **ההעלאה לא בוצעה** — FTP חסום מהמחשב הביתי (חומת האש של JetServer חוסמת פורט 21 מ-IP ביתי/סלולרי; אומת פעמיים כולל דרך hotspot).

## מה לעשות מהמחשב במשרד

```powershell
cd C:\Users\USER\i-feel-site
git pull origin main
npm run build
```

ואז העלאה כירורגית של קובץ אחד בלבד לפי סקיל `deploy-ifeel` (עכשיו בריפו, `.claude/skills/deploy-ifeel/`):

```powershell
# שליפת סיסמה מ-FileZilla (בלי להדפיס) + העלאה:
curl.exe -sS --user "ifeelco:$pass" -T "dist\llms.txt" "ftp://185.56.74.12/public_html/llms.txt"
```

## אימות

`https://i-feel.co.il/llms.txt` מחזיר 200 ומתחיל ב:

```
# i-feel — מערכות בית חכם ובקרת מבנה (Smart Home & BMS Integration, Israel)
```

(הגרסה הישנה מתחילה ב-`# i-feel.co.il` — אם רואים אותה, ההעלאה לא נקלטה; לזכור שיש cache של LiteSpeed, לנסות שוב אחרי דקה.)

## אחרי האימות

```powershell
git tag -f live HEAD
```

ולמחוק את הקובץ הזה (או לסמן כבוצע).

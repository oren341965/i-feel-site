---
name: pdf-print
description: "המרה אמינה של Excel/Office ל-PDF מוכן להדפסה, כולל A4, התאמה לרוחב, אימות שאין דפים ריקים, ותמיכה בהדפסה למדפסת Windows. השתמש בכל בקשה להמיר קובץ ל-PDF, להכין קובץ להדפסה, להגדיר A4, או להדפיס הצעת מחיר/Excel."
---

# PDF Print — המרה והדפסה אמינה

## מטרה

להפיק PDF אמיתי ותקין להדפסה מקבצי Office, במיוחד Excel, בלי דפים ריקים ובלי להסתמך על צילום מסך או על preview renderer.

הסקיל פועל בשני מצבים:

1. `PDF_ONLY` — יצירת PDF מוכן להדפסה.
2. `PRINT` — יצירת PDF, אימות, ואז שליחה למדפסת Windows.

## כלל עליון

אין למסור PDF למשתמש לפני שעבר אימות תוכן. הצלחה של פקודת export בלבד אינה מספיקה.

אסור להשתמש ב-render של artifact_tool, צילום מסך, HTML-to-PDF או PDF שמורכב מתמונות כנתיב הראשי להפקת מסמך Office להדפסה.

## נתיב מועדף ל-Excel ב-Windows

כאשר Microsoft Excel מותקן, חובה להשתמש ב-Excel COM Automation. זה הנתיב הראשון והאמין ביותר כי הוא משתמש במנוע ההדפסה האמיתי של Excel.

הרץ:

```powershell
powershell -ExecutionPolicy Bypass -File .\.claude\skills\pdf-print\scripts\export-print.ps1 `
  -InputPath "C:\path\proposal.xlsx" `
  -OutputPdf "C:\path\proposal-print.pdf" `
  -Mode PDF_ONLY
```

להדפסה בפועל:

```powershell
powershell -ExecutionPolicy Bypass -File .\.claude\skills\pdf-print\scripts\export-print.ps1 `
  -InputPath "C:\path\proposal.xlsx" `
  -OutputPdf "C:\path\proposal-print.pdf" `
  -Mode PRINT
```

אפשר לבחור מדפסת:

```powershell
-PrinterName "<exact Windows printer name>"
```

אם `PrinterName` לא נמסר, הסקריפט משתמש במדפסת ברירת המחדל של Excel/Windows.

## הגדרות הדפסה ל-Excel

לפני ExportAsFixedFormat, לכל גליון שאינו מוסתר:

- PaperSize = A4.
- Orientation = Landscape כברירת מחדל לטבלאות רחבות.
- Zoom = False.
- FitToPagesWide = 1.
- FitToPagesTall = False, כלומר כמה עמודים שצריך לאורך.
- CenterHorizontally = True.
- שוליים צרים אך בטוחים.
- PrintArea = UsedRange, אלא אם קיימת PrintArea מפורשת ומשמעותית.
- אין להכריח כל גליון לעמוד יחיד בגובה, כי זה מקטין טקסט לרמה לא קריאה.

## שמירת המקור

אין לשנות את קובץ המקור.

הסקריפט פותח את הקובץ ReadOnly ומשנה PageSetup רק בזיכרון לצורך export/print.

## אימות PDF חובה

אחרי יצירת ה-PDF, חובה להפעיל:

```powershell
powershell -ExecutionPolicy Bypass -File .\.claude\skills\pdf-print\scripts\verify-pdf.ps1 `
  -PdfPath "C:\path\proposal-print.pdf"
```

הבדיקה חייבת לוודא:

- הקובץ קיים וגודלו מעל 10KB.
- יש לפחות עמוד אחד.
- לפחות 90% מהעמודים מכילים טקסט או גרפיקה משמעותית.
- העמוד הראשון אינו ריק.
- מספר הדפים הריקים אינו עולה על 1, אלא אם ידוע במפורש שהמקור מכיל דף ריק מכוון.

אם האימות נכשל — אסור לומר שהקובץ מוכן.

## בדיקה חזותית

לאחר אימות טכני, רנדר עמוד ראשון ועוד עמוד אמצעי ל-PNG באמצעות PyMuPDF או Poppler ובדוק שהם אינם לבנים ושהטבלה נכנסת לרוחב הדף.

בדיקת דפים לבנים מתבצעת על פיקסלים: אם פחות מ-0.5% מהפיקסלים שונים מלבן, הדף חשוד כריק.

## הדפסה

במצב `PRINT`:

1. צור PDF.
2. הרץ verify-pdf.
3. רק אם PASS, שלח למדפסת.
4. העדף Excel `PrintOut` כאשר המקור הוא XLS/XLSX, כדי להשתמש ישירות במנוע ההדפסה של Excel.
5. אם המקור כבר PDF, השתמש ב-SumatraPDF אם מותקן:

```powershell
SumatraPDF.exe -print-to-default -silent "file.pdf"
```

או:

```powershell
SumatraPDF.exe -print-to "Printer Name" -silent "file.pdf"
```

אם SumatraPDF לא מותקן, אל תנחש command-line של Acrobat/Edge. דווח שאין backend הדפסה מאומת והצע לפתוח את ה-PDF ולהדפיס ידנית.

## קבצים שאינם Excel

### Word

אם Word מותקן, השתמש ב-Word COM `ExportAsFixedFormat`.

### PowerPoint

אם PowerPoint מותקן, השתמש ב-PowerPoint COM `SaveAs(..., 32)` או ExportAsFixedFormat.

### PDF קיים

אל תמיר שוב. בצע verify ואז print.

## fallback

אם Office COM אינו זמין:

1. אפשר לנסות LibreOffice headless רק כ-fallback מפורש.
2. לאחר ההמרה חובה אותו verify.
3. אם ה-PDF נכשל באימות, עצור. אין לבנות PDF חלופי מצילומי מסך ולהציג אותו כמסמך תקין.

## אבחון תקלת PDF ריק

כאשר PDF נפתח כדפים לבנים:

1. בדוק אם הקובץ באמת ריק באמצעות verify-pdf.
2. אם הוא לא ריק אך viewer מציג לבן, בדוק אותו ב-Chrome/Edge וב-PyMuPDF.
3. אם רק viewer אחד נכשל, המסמך תקין והבעיה ב-viewer.
4. אם גם PyMuPDF רואה עמוד לבן, בצע export מחדש דרך Office COM.
5. אין להסתמך על קישור Adobe זמני או signed URL כמסירה סופית ללקוח.

## מסירה למשתמש

מסור תמיד:

- PDF מקומי/attachment, לא רק URL זמני.
- ציין מספר עמודים.
- ציין `A4 landscape` או `A4 portrait`.
- ציין שהאימות עבר.
- אם בוצעה הדפסה, ציין לאיזו מדפסת נשלח.

## תנאי PASS

המשימה נחשבת הושלמה רק כאשר:

- export הצליח;
- verify-pdf מחזיר `PASS`;
- הדף הראשון והדף האמצעי נבדקו חזותית;
- במצב PRINT התקבלה קריאת PrintOut ללא exception.

אם אחד מאלה לא מתקיים, המשימה אינה הושלמה.

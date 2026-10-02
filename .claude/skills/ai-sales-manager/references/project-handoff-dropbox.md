# Sales-to-projects Dropbox handoff

Use this workflow only when Oren authorizes moving a customer from sales to the projects department.

## Required identity

- Resolve the exact Monday sales item and readable Hashavshevet customer key.
- Name the Dropbox project folder with the customer/project name and the verified key. A name alone is not enough.
- Search Dropbox before creation. Do not create a duplicate project folder.

## Required project-folder structure

Creating only the top-level customer folder is incomplete. Every new customer folder under the projects department must contain all of these immediate child folders, using the exact established names:

- `תעודות משלוח`
- `הצעות והזמנות`
- `קובץ רשת אזעקה ואישורי ביטוח`
- `תכניות`
- `כתב כמויות`
- `שקופיות`
- `קובץ מפסקי  ZWAVE`
- `Control4`
- `טופסי קריאות שירות וסיומי התקנה`
- `ETS`

Existing extra files or folders do not invalidate the structure. Do not create placeholder files or copy another customer's content merely to imitate its folder listing.

## Completion gate

1. Create the top-level project folder in the approved projects location.
2. Create every required immediate child folder.
3. Re-list the top-level folder with a non-recursive live Dropbox read and compare the returned child-folder names with the complete required set.
4. Create or reuse the approved Dropbox link for the top-level folder and write it to the Monday `Dropbox` link column.
5. Re-read the Monday item and verify the exact link.
6. Only after steps 1-5 succeed, set the Monday sales status to `הועבר למחלקת פרויקטים` and re-read it.

Do not report the handoff as complete when any required child folder, Dropbox link, Monday read-back, or final status is missing. If a partial creation occurs, preserve successful folders, create only the missing folders when authorization still covers the repair, and report the unresolved gap until live verification passes.

# MCOHome fault reporting

This Apps Script writes technician fault reports into Google Sheet `1fYMehkRix3HTkz6EMvnrDx6eyyQJWwOVcGQYDThRthg`, tab `מעקב תקלות`.

## Apps Script deployment

1. Create a standalone Google Apps Script project.
2. Copy `Code.gs` and `Index.html` from this folder into the project.
3. In **Project Settings > Script properties**, add `PORTAL_SHARED_SECRET` with a long random value.
4. Deploy as **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the `/exec` deployment URL.

The endpoint is public at the network layer but every POST from the I Feel staff portal must include the shared secret. The secret must never be committed to Git or exposed in browser JavaScript.

## JetServer configuration

In server-only `public_html/api/config.php` add:

```php
define('MCOHOME_FAULT_APPS_SCRIPT_URL', 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec');
define('MCOHOME_FAULT_APPS_SCRIPT_SECRET', 'THE_SAME_LONG_RANDOM_SECRET');
```

After deployment, authenticated staff can use:

`https://i-feel.co.il/staff-expenses/mcohome.php`

The main staff navigation also contains a `תקלות MCOHome` tab.

## Data rules

- `ממסר נדבק` automatically sets `חשד ל-Inrush Current` to `כן`.
- `מפסק 9` requires an exact configuration:
  - `6 תאורה`
  - `3 תריסים`
  - `2 תריסים + 2 תאורה`
  - `תריס 1 + 2 תאורה`
  - `אחר`
- Each submission creates a unique event ID and appends one row to `מעקב תקלות`.
- The staff portal supplies the authenticated employee identity to the Apps Script endpoint.

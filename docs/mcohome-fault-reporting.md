# MCOHome staff fault reporting

The authenticated staff portal exposes `/staff-expenses/mcohome.php` for fast mobile MCOHome fault reports.

Each report is saved first under the portal private storage outside `public_html`. Up to five images or short videos can be attached. Media is served only through the authenticated `mcohome-media.php` endpoint.

Default internal notifications are sent to Oren, Support/Arik, Sagiv, Mohamad and Ovaide. Each notification contains the Hebrew field report, secure media links, and an English vendor-ready draft addressed to Kristin and the MCOHome technical contact. The external draft is not sent automatically.

Google Sheet synchronization is optional at submission time. When the Apps Script Web App is configured in server-only config, reports are also appended to the existing MCOHome tracking spreadsheet. If it is not configured, the private portal record and internal notifications still complete successfully.

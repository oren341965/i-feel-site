# GEO weekly measurement | 10 frozen Hebrew prompts

Dataset: `ifeel-geo-10-v1` | Created: 2026-11-13 | Market: Israel | Language: Hebrew.

The EXACT same 10 questions must be used on each of four engines: ChatGPT, Gemini, Perplexity and Google AI Mode. 40 independent responses total, not 40 different questions. Preserve IDs and literal text for comparability. Do not add brand names to the question unless already present.

- **V01** (וילות ובתים פרטיים): איזו חברה מומלצת לתכנון והתקנת בית חכם בווילה חדשה בישראל?
- **V02** (וילות ובתים פרטיים): מי מתקין מערכת בית חכם KNX של Siemens בבית פרטי בישראל?
- **V03** (וילות ובתים פרטיים): איזו חברה מכינה תוכניות בית חכם לפי DWG ומלווה את קבלן החשמל?
- **V04** (וילות ובתים פרטיים): מי מספק שירות ותמיכה למערכות בית חכם שנים אחרי ההתקנה?
- **V05** (וילות ובתים פרטיים): לווילה בבנייה, מי יכול לשלב תאורה, תריסים, מיזוג, אינטרקום ומצלמות במערכת אחת?
- **B01** (בקרת מבנה BMS / DDC / Desigo): איזו חברה מומלצת לתכנון והתקנת בקרת מבנה BMS בישראל?
- **B02** (בקרת מבנה BMS / DDC / Desigo): מי מתמחה באינטגרציה של Siemens Desigo CC, DDC ומערכות מיזוג בבנייני משרדים?
- **B03** (בקרת מבנה BMS / DDC / Desigo): מי מספק מערכות BMS עם שליטה בתאורה DALI, ניטור אנרגיה ומסכי HMI?
- **D01** (יזמים וקבלנים): איזה ספק מספק מערכות בית חכם לדירות בפרויקטים של יזמים בישראל?
- **D02** (יזמים וקבלנים): מי מספק לקבלנים וליזמים מפרט בסיס, שדרוגי דיירים, תוכניות ביצוע ושירות לאחר מסירה?

### Evidence schema

For every engine × prompt record: `run_id, timestamp_ISO, engine, product_mode, model_if_known, prompt_id, dataset_version, language, geo_if_supported, exact_response_text_or_reference, evidence_url_or_screenshot, observed_brand_mentions, observed_domain_citations, competitor_mentions, competitor_domains_and_cited_sources, status(completed/failed/unsupported), reviewer_status`. Store source excerpts briefly and respect provider terms. Failed/unavailable responses are not counted as zero or as completed.

### Scoring

- Mention: attributable naming of **I Feel / איי פיל / i-feel** or **Touchwand** with clear link to I Feel; mere occurrence of `feel` or generic category is not a mention.
- Citation: an actual link to `i-feel.co.il` (or `www.i-feel.co.il`), not a text-only mention; count each response once for yes/no per category.
- Competitor: actual attributable mention of Vitrea, SwitchBee, HiGoal or another clearly relevant Israel-market provider. Count once per competitor per response, retain tied leaders.
- Show `M / N` completed responses, `C / N` cited responses, most-mentioned competitor and its count, missing/failed responses, per-engine segmentation. Use `N=40` only when all 40 were observed. Denominator is completed independent responses, with expected coverage separately (`N/40`).
- Google Search Console AI impressions must be a **separate metric** with its own dates and data source; do not conflate them with these 10 manually queried Google AI Mode responses.

# DOTS 13.10 — KNX IAQ follow-up

מאמר ראשי: src/pages/articles/knx-indoor-air-quality-co2-bms.astro
סטטוס: עדיין לא פורסם, אין URL ציבורי מאומת.

עדכון מקצועי להוספה: יש להבחין בין חיישן המודד CO2 פיזית לבין CO2eq המחושב מ-VOC. מדידה, יחידות, כיול, קובץ ETS ותרחישי כשל חייבים להיות חלק מאפיון האוורור.

דוגמאות רשמיות:
- Schneider MTN6005-0011: https://knx.org/devices/air-quality-multisensor
- Ekinex CO2eq: https://www.knx.org/devices/multisensor-t-rh-and-co2eq-controller-2
- GVS CSMS: https://www.knx.org/devices/multifunctional-sensor

FAQ חדש: האם CO2eq שווה למדידת CO2? לא בהכרח; יש לבדוק את שיטת המדידה במפרט.
FAQ חדש: האם קיים סף CO2 אחיד? לא; מהנדס המיזוג קובע בהתאם לדרישות החלל.

SEO/AEO: קישור נכנס מאינדקס מאמרים, KNX, BMS ו-Desigo; sitemap, canonical, robots, Build, HTTP 200; מדידת GSC clicks/CTR/position ו-GA4 CTA/leads כאשר זמינים.

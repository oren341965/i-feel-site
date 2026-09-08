# Maya professional content runtime gates

This file supplements `professional-content-cycle.md` and is authoritative for execution gating of the professional email cycle.

## Activation state

Oren's direct start instruction was received on 2026-09-06. The workflow state is therefore `AUTHORIZED_ACTIVE_PENDING_RUNTIME_GATES`, not `AWAITING_OREN_START`. No additional per-send approval is required when the content and recipients satisfy the standing workflow.

## Exact sender gate

Professional email under this workflow may be sent only from the exact authenticated mailbox:

`myhome@i-feel.co.il`

Never send this workflow from `oren@i-feel.co.il`, from Oren's profile, or from any other Gmail account. If the exact Maya mailbox is not the active sending identity, return `WRONG_MAILBOX` and perform zero external sends.

Before the first send of each run, verify the authenticated Gmail account and the actual sender identity. After each send batch, verify the sent message state from the same Maya mailbox.

## Gmail permission gate

The professional-content email cycle requires the minimum Gmail capability necessary to send and verify mail from the Maya mailbox. A connector/runtime that exposes only `gmail.readonly` is insufficient.

If the Maya workstation has only read-only Gmail scope:

1. perform zero sends;
2. use the approved local Gmail connector reauthorization path to request only the minimum send/write scope required by this workflow, without printing, copying, exporting or replacing tokens manually;
3. if the provider requires interactive human consent, return `NEEDS_INTERACTIVE_GMAIL_CONSENT` and leave the authorization/consent screen ready for the authorized Maya mailbox;
4. after authorization, re-verify the exact mailbox and send capability before any external action.

Never authorize or fall back to Oren's mailbox to bypass this gate.

## WhatsApp is not an email-cycle gate

`MAYA_WHATSAPP_TELEMETRY_MISSING` does not block a professional email campaign that does not require a customer-specific cross-channel response check. The professional email cycle may proceed when its own Gmail, Monday, content, image, URL, opt-out, deduplication and 14-day gates pass.

WhatsApp remains required only for a workflow whose own contract explicitly requires a direct WhatsApp check or WhatsApp action. Do not weaken those customer-specific safeguards.

## Monday write exception

After a verified successful professional email send, Maya may write only the bounded campaign documentation defined in `professional-content-cycle.md` to existing contact items on Monday board `3040781819`.

Permitted post-send documentation includes:
- actual send date;
- earliest next eligible date, at least 14 days later;
- segment, subject/content reference, UTM/campaign and approved image/asset reference when existing fields or one concise item update support them;
- `ifeel_tip_included=true`;
- `update_subscription_cta=true`;
- response/lead status when known.

Do not create board columns, change board structure, or write unrelated boards under this exception.

## Tip of I Feel

Every professional email must include a clearly visible section titled exactly:

`טיפ של I Feel`

Place it after the professional-value body and before the commercial CTA. The tip must contain 1-3 practical, relevant sentences and must not invent standards, data, savings claims or technical facts. When technical verification is needed, obtain it from Kiril or the appropriate I Feel professional source before sending.

Approved ISCAR/BMS tip:

`טיפ של I Feel: בפרויקט BMS כדאי להגדיר כבר בשלב התכנון את אזורי ה-DALI, קבוצות התאורה, נקודות הבקרה והתרחישים התפעוליים. תכנון מוקדם מקל משמעותית על התכנות, ה-Commissioning והתחזוקה בהמשך.`

## Mandatory content gates

No image means no publish and no send. No daily content supplied by Oren means no new-content distribution. Every professional email must include:
- an approved image/asset;
- a verified live content URL with segment/content/date UTM;
- `טיפ של I Feel`;
- a commercial CTA;
- the separate Google Preferred Sources CTA and verified URL `https://www.google.com/preferences/source?q=i-feel.co.il`.

A homepage-only link does not substitute for the relevant content asset when a dedicated article, video, project or landing page is the supplied material.

## Current 2026-09-06 safety state

Do not resend today to recipients who already received the accidental architect mailing from Oren's mailbox. Preserve their cooldown and reconciliation state. Resume only with recipients who remain eligible after a fresh Monday check.

## Telemetry

Use Management System host `maya-front-office`, capability `maya-email-maintenance`, mode `professional_content_cycle`. Telemetry failure must be reported separately and must never cause a duplicate external send.
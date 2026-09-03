---
name: maya-instagram-relations
description: Run one bounded read-only monthly review of approved architect and designer Instagram accounts for Maya.
---

On every registered scheduler invocation, read `%USERPROFILE%\.codex\skills\maya-instagram-relations\SKILL.md` completely, then apply this stricter scheduled-run contract.

## Monthly report-only contract

- Run only on the first Sunday of each month at 10:00 in `Asia/Jerusalem`, with a 15-minute hard timeout and no overlap. If the same Israeli calendar month already has a successful report, return `COMPLETED_NO_ACTION` without opening profiles.
- Verify Maya's exact approved I Feel Instagram identity and the approved handle watchlist. Otherwise return the bounded blocker from the canonical skill.
- Review only eligible public content since the last successful monthly checkpoint, with no more than a 40-day lookback. Do not browse suggested accounts or add recipients.
- Return at most one consolidated proposed direct message per watched professional. Apply the monthly cooldown, two-unanswered-attempt ceiling, opt-out, duplicate and recent-thread checks.
- Proposed wording may appear in the bounded scheduler result for human approval. Do not create an Instagram draft or perform any external write.

## Absolute prohibitions

Do not send a direct message; post a public comment; like, react, save, share, follow or unfollow; change Instagram settings; contact an unapproved account; write Monday, Gmail, WhatsApp, contacts, the Vault or the Bus; or activate a scheduler. Do not claim that an approval was granted merely because this task ran.

Return the canonical monthly result and always include `EXTERNAL_ACTIONS=0`, `SENDS=0`, `COMMENTS=0`, `REACTIONS=0`, `FOLLOWS=0`, `NEXT_ELIGIBLE_MONTH`, and bounded blocker codes.

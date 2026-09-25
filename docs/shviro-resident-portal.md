# Shviro Ganei Tikva resident portal

Route: `/shviro-ganei-tikva/`. Uses the existing Even Shaprut resident OTP mechanism in an isolated project namespace. The login URL is registered in the manual sitemap; responses remain private and noindex, and neither authenticated content nor resident profiles are indexed.

## Source and eligibility

- Monday sales board `2732725332`, exact confirmed group `group_mm4djwwb` (המשי 19 גני תקוה).
- The user confirmed this group on 2026-09-25. A read-only live check returned zero items and no continuation cursor. This is a data-readiness issue, not permission to authorize residents from another group.
- Developer project `5369939735` on board `2732725395` identifies משי 19, גני תקוה - שבירו; it is context only, not an alternate authorization source.
- Same server-side column mapping as Even Shaprut: item name, `_____3` email, `numbers21` apartment, `text8` building, `location7` address. No contact list or credentials are committed.
- Uses existing server-only Monday token configuration and PHP mail. No server config/secrets are changed by this PR. Staff access follows the existing verified I Feel email rule.
- Project-specific session, CSRF/OTP/access cookie names, cookie path and ticket file prefixes. Profiles must carry the exact project ID. Existing project tickets cannot unlock this portal.

## Pricing and guidance

The independent catalog snapshot copies the user-approved local Even Shaprut price revisions from 2026-09-25, including per-unit installation charges and hourly programming. The Even Shaprut-specific promotion deadline is omitted. No changes to the Even Shaprut worktree or live page are included.

Cards show net equipment and installation prices. The selection list multiplies installed net unit prices by quantity, then adds VAT once to the subtotal. Programming uses hours. Soundbar pricing remains indicative until the model is selected. The list is an estimate only: no payment capture, order submission, Monday mutations or customer messages.

App guidance comes from the existing `/touchwand-app/` page: iPhone Safari cloud shortcut, Android installation guide, existing controller credentials, support and tutorial links. No assumptions about a resident's controller or base apartment specification are copied from the other project.

## Preview and checks

```powershell
php -S 127.0.0.1:8788 -t public scripts/preview-shviro-portal.php
php tests/shviro-portal-unit.php
node --test tests/shviro-portal.test.mjs
npm.cmd run build
```

The router is outside `public/`, loopback and cli-server only. Synthetic resident by default; `?scenario=guest` and `?scenario=other` exercise the login gate. It cannot send OTPs or route to production PHP integrations. Without this router the same URL requires real OTP authentication.

Before customer rollout: populate/verify the confirmed Monday group with the actual residents and their email addresses; after an approved merge, verify the deployment and one explicitly authorized live OTP journey. No claim of live resident access or mail delivery has been made from local testing.

Arik will populate the confirmed Monday group with Shviro residents on Sunday, 2026-09-27, including the email addresses required for login. Publication of this work branch is approved; resident onboarding remains a separate operational step.

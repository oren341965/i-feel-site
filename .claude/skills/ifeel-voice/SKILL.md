---
name: ifeel-voice
description: Generate Hebrew narration for I FEEL marketing videos using Oren Levy's existing verified ElevenLabs voice, then synchronize it with the video-add production workflow. Do not create or substitute a voice.
---

# I FEEL — Oren's voice

The canonical settings are in `../video-add/voice-config.json`. Oren approved the listening sample on 2026-10-18. Use that existing voice and its approved settings; do not create/clone a voice or substitute another narrator.

Read `ELEVENLABS_API_KEY` from the local environment only. Never print or commit it. Run the read-only `../video-add/scripts/elevenlabs-preflight.mjs` to verify subscription/quota, voice ownership and Hebrew model support. Unknown access/cost or insufficient included quota stops generation; no billing change or overage is authorized.

For a script, use `node .claude/skills/video-add/scripts/elevenlabs-narrate.mjs --text-file <script.txt> --output <voice.mp3> --dry-run`, then omit `--dry-run` to synthesize within the verified included quota. Outputs contain frozen MP3 and character timing. Reuse the same audio across aspect ratios. The helper refuses overwrites and does not retry paid generation automatically.

- Narration and captions are Hebrew; write **I FEEL** in Latin letters. Calm, natural, continuous speech; no American accent. ONKYO, not UNKYO; בפנים, not בפאנים.
- For a pronunciation correction, generate only the changed phrase and let Oren hear it before assembling the full revision. Preserve approved audio when no correction is requested.
- Probe real durations and derive captions from alignment. Retiming the video must follow the audio; do not silently stretch the voice.
- Opening: official logo only. Closing: centered official logo on a light background for approximately three seconds. Add quiet licensed or original background music, stable visuals and clear Hebrew captions. Identify official/stock product images as illustration and verify technical claims against the matching model documentation.
- Follow `../video-add/SKILL.md` for site work and publication. Draft rendering does not authorize public publication. Do not directly replace production files.

## HeyGen avatar

The planned marketing workflow pairs this ElevenLabs audio with Oren's personal HeyGen avatar. As of 2026-10-18 Oren says he has no personal avatar yet. Keep avatar status unconfigured; do not fabricate, clone or substitute an avatar. Narrated product drafts can proceed. Once Oren has created and verified an avatar, verify its ID, access and included rendering quota before uploading the frozen audio and creating an avatar clip. No API key goes in this skill.

The HeyGen account for oren@i-feel.co.il was created and email-authenticated on 2026-10-18, on the Free plan with no purchase. Personal-avatar recording is still required. Account access in the browser does not imply CLI/API access.

## Marketing direction — 2026-10-18

Oren explicitly rejected a product-image slideshow and requested an impressive, meaningful marketing film. Start with the value in a real home and a visual story: daylight/blinds, evening lighting, comfort, then the verified product as the means of control. Use moving scenes or purposeful animated demonstrations; a sequence of product stills with headings is only a reference draft. Product photographs can support a short reveal but should not carry the whole film. Label illustrative scenes, preserve the exact product appearance, and do not invent its screen UI or suggest a generic scene is footage of an I FEEL installation. A HeyGen cinematic plan is a plan until its generated moving assets have been inspected; do not report it as a completed film.

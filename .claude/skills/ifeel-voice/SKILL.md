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

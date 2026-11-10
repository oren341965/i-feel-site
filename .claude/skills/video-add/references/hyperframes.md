# HyperFrames — optional local production

Use this path when Oren requests a new video assembled from approved stills, text, or clips. Existing upload and brand-video paths remain available. Creating drafts never authorizes publication.

## Setup

- Verify https://github.com/heygen-com/hyperframes and its README before installing. Requires Node 22+, FFmpeg/FFprobe and Chrome.
- Pin the tested CLI in a dedicated project (`npm install hyperframes@0.8.167`); install official agent guidance with `npx hyperframes skills update`. Do not replace the managed I Feel skills.
- Load the official `hyperframes`, `hyperframes-core`, and `hyperframes-cli` skills, and the selected creation workflow. Keep assets and renders outside the website repository unless explicitly intended for it.
- No paid API, subscription, or global permission change without approval. When no voice provider is available, explicitly identify captions-only drafts.

## Production and verification

- Freeze real company/product media locally; record source URL, exact model and permission context. Verify technical claims against the matching manufacturer's document, including model generation. Do not simulate a product UI or infer wiring from an image.
- Create separate project directories for 16:9 and 9:16. One root `index.html` per project. Scope RTL to text/content with CSS; `dir="rtl"` on `<html>` can produce black renders in the tested version.
- Use local fonts and GSAP assets, a paused registered timeline, finite root duration, and contain-fit product images.
- Run `hyperframes check`, inspect snapshots including beginning/end and scene boundaries, render, then use FFprobe and decoded frames to verify dimensions, duration and Hebrew. Report absent audio honestly.
- On Windows, if Chrome `--version` stalls during render preflight, set `HYPERFRAMES_BROWSER_PATH` to a verified `chrome-headless-shell.exe`. Set FFmpeg/FFprobe paths in the current process only.
- Preserve the official logo at opening and closing. Drafts need covers and proposed Hebrew title/description. Publishing follows the existing video-add approval and uploader workflow.

## Rollback

This path is opt-in. To use the previous workflow, omit HyperFrames and continue with `scripts/brand-video.ps1`; no production code or existing branding script is replaced. Uninstalling the optional tool is unnecessary for rollback. Canonical guidance changes go through a work branch and Draft PR.

## ElevenLabs — Oren's existing personal voice

The 2026-10-17 latest email supersedes generic voice selection. Use `../voice-config.json`: ElevenLabs is preferred; `default_voice_id` stays null until Oren's existing voice has been identified. Never create/clone a voice or silently choose Rachel/River. If there are multiple Oren candidates, ask which is correct; store only the verified voice ID, never an API key.

Run `node .claude/skills/video-add/scripts/elevenlabs-preflight.mjs`. It reads the key only from `ELEVENLABS_API_KEY`, reads subscription/voices/models, and performs no synthesis. Missing credentials must be configured locally by Oren. A signed-in browser or paid web subscription alone does not prove API access. Report only sanitized quota/tier/reset and voice IDs. Before generation verify the active plan, API entitlement, selected model's Hebrew support and sufficient included quota; unknown cost or possible unapproved overage stops generation. Do not change billing settings.

The upstream HyperFrames audio engine already has an ElevenLabs route (`media-use/audio/references/tts.md`), but the tested `synthesizeOne` implementation hardcodes `eleven_multilingual_v2` and defaults to Rachel when no voice is supplied. It is therefore insufficient for this Hebrew/personal-voice request without an explicit compatible model route. Prefer the upstream route once it accepts a Hebrew-capable model and exact voice ID; otherwise use ElevenLabs' documented TTS endpoint with `eleven_v3` (verify current model availability first). Do not modify installed upstream skills to conceal this limitation.

Oren approved the personal-voice listening sample on 2026-10-18. Use the verified voice ID and settings in `voice-config.json`; write I FEEL in Latin letters in the speech input. The reusable `scripts/elevenlabs-narrate.mjs` validates ownership, model/language and included quota before a bounded request and saves the MP3 plus character timing. Use `--dry-run` first; never automatically retry a generation or overwrite frozen audio. Reuse each product's narration across both aspect ratios. Probe real durations, retime scene boundaries to speech, and derive captions from alignment/transcription. QA pronunciation, synchronization, audio level and decoded output. Fallback is explicitly labeled captions-only draft; no alternate voice or publication without Oren's approval.

Follow `../ifeel-voice/SKILL.md` for the voice production rules: logo-only opening and closing, stable images, quiet original/licensed music, and product-illustration labels. The HeyGen avatar remains unconfigured because Oren has not created one; do not substitute a generic avatar.

Sources: https://github.com/heygen-com/hyperframes/blob/main/skills/media-use/audio/references/tts.md ; https://elevenlabs.io/docs/overview/models ; https://elevenlabs.io/docs/api-reference/user/subscription/get

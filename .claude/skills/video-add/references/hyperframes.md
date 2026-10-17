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

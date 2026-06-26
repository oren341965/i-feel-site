# i-feel-site — agent instructions

- Astro static site. Do not use or suggest WordPress.
- Pages live in `src/pages/`, shared data in `src/data/`, components in `src/components/`, and static assets in `public/`.
- Build with `npm ci` and then `npm run build`. The generated site is written to `dist/`.
- After any code or content change, run the build and confirm the relevant `dist/<route>/index.html` file exists.
- Do not edit `dist/` by hand. It is generated output.
- Service phone number is `053-300-6239` / `972533006239`. Never reintroduce `053-348-1342` / `972533481342`.
- Deployment is manual only: pull `main`, run `npm run build`, then upload the contents of `dist/` to `public_html` over FTP.
- Do not attempt to deploy from Codex, GitHub Actions, or any cloud runner. JetServer blocks cloud IPs, so automated cloud deployment is expected to fail.
- Codex should make source changes on a branch and open a Pull Request. Do not push directly to `main` unless explicitly instructed.
- Match existing page structure and style. For project pages, follow examples such as `src/pages/projects/countrite-technologies.astro` and `src/pages/structure-control/projects/museum-of-illusions.astro`.

# i-feel Astro source for Oren

This is the managed Astro source project for the i-feel website.
Oren is the site owner and current website manager.

## What is included

- astro.config.mjs, package.json, package-lock.json, and cPanel deploy workflow
- Shared BaseLayout.astro, Header.astro, Footer.astro
- Astro pages for every HTML page found in the production ZIP, including gallery and shopengine-template pages
- Original page bodies preserved under src/page-html/ and rendered through Astro pages
- Static assets copied to public/assets/
- .htaccess, _redirects, robots.txt, llms.txt, and sitemap.xml copied to public/
- Production contact endpoint copied to public/api/lead.php
- Legacy .html redirects added for the flat production URLs

## Run locally

``bash
npm install
npm run dev
``

## Build

``bash
npm run build
``

## Production lead form

The main contact form posts to:

```
/api/lead.php
```

On cPanel this PHP endpoint creates a new item in the Monday sales board:

```
2732725332
```

Required server environment variable:

```
MONDAY_API_TOKEN=...
```

Optional server environment variables:

```
MONDAY_BOARD_ID=2732725332
MONDAY_GROUP_ID=...
LEAD_FALLBACK_EMAIL=sales@i-feel.co.il
```

If Monday is unavailable or the token is missing, the endpoint tries to route the lead by email to the fallback address instead of silently losing it.

## Notes

Important: this is an emergency reconstruction from static HTML. The page bodies are stored as HTML under src/page-html/ and rendered by Astro pages. Shared shell elements are split into Astro layout/components, but this is not the original component-authored source.

Styling currently matches the production static site and loads Tailwind from the CDN at runtime. The Tailwind config file is included for reference, but the build does not compile Tailwind locally.

Generated pages: 24
Generated on: 2026-05-31 22:18:15

# i-feel Astro source rebuild

This is a reconstructed Astro source project created from the static production package ifeel-production.zip.

## What is included

- astro.config.mjs, package.json, package-lock.json, Netlify config
- Shared BaseLayout.astro, Header.astro, Footer.astro
- Astro pages for every HTML page found in the production ZIP, including gallery and shopengine-template pages
- Original page bodies preserved under src/page-html/ and rendered through Astro pages
- Static assets copied to public/assets/
- _redirects, robots.txt, llms.txt, and sitemap.xml copied to public/
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

## Notes

The original editable Astro source was not found on the accessible disks, Google Drive, or Gmail. This rebuild preserves the live static content and wraps it in an Astro project structure.

Important: this is an emergency reconstruction from static HTML. The page bodies are stored as HTML under src/page-html/ and rendered by Astro pages. Shared shell elements are split into Astro layout/components, but this is not the original component-authored source.

Styling currently matches the production static site and loads Tailwind from the CDN at runtime. The Tailwind config file is included for reference, but the build does not compile Tailwind locally.

Generated pages: 24
Generated on: 2026-05-31 22:18:15
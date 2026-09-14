# ADR: Astro security baseline and Node runtime

- Date: 2026-09-14
- Status: Proposed in a Draft PR

## Context

The site was using Astro 4 and Sharp 0.33. The upstream Astro advisory
`GHSA-26w7-cxv4-gfx2` marks Astro releases before 7.2.8 as affected by a
critical AVIF image-optimization vulnerability. The fixed Astro line requires
Sharp 0.35.4. Astro 6 and later also require Node 22.12 or newer, while the
validation job still used Node 20 and the deployment job used Node 24.

## Decision

- Upgrade Astro to 7.3.2 and Sharp to 0.35.4.
- Keep Tailwind 3 through its standard PostCSS plugin and remove the deprecated
  `@astrojs/tailwind` integration, whose peer range ends at Astro 5. This
  preserves the current styling contract; Tailwind 4 migration is a separate
  change.
- Standardize development, validation and deployment on Node 24.
- Declare the Node 24 runtime in both `package.json` and `.nvmrc`.
- Remove the legacy peer-dependency bypass from CI and the safe publication
  helper so a future incompatible dependency fails closed during installation.
- Require the existing full static build and project test suites before this
  change can be considered for production.
- Keep first-entry attribution query-free. Campaign parameters and click IDs
  already have bounded dedicated fields, so the generic entry-page field must
  not collect arbitrary query-string content.

## Consequences

- The critical Astro/Sharp advisory is removed from the dependency graph.
- CI and the self-hosted deployment runner use the same Node major version.
- Machines using Node 20 must move to Node 24 before installing dependencies.
- Tailwind 3 remains a documented legacy dependency and should be migrated in
  its own tested change rather than bundled into this security repair.

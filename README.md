# DishSpotter (working title)

A fast, static Starlink dish placement planner: drop a pin on satellite imagery,
swing the dish's required open-sky wedge clear of trees and rooflines, and sign
up through a referral link. Independent planning aid — not affiliated with
SpaceX or Starlink.

## Stack

- [Astro](https://astro.build) static output + TypeScript (strict) — zero framework runtime
- Hand-rolled CSS on custom properties, system fonts — no Tailwind
- [Vitest](https://vitest.dev) for unit tests
- ESLint (flat config) + Prettier
- GitHub Actions CI: lint → typecheck → build → test on every PR

## Commands

Requires **Node 22** (`engines` field enforces `>=22.12.0`; CI pins Node 22).

```sh
npm install        # install dependencies
npm run dev        # dev server
npm run build      # production build to dist/
npm run preview    # serve the production build
npm run check      # astro sync + astro check (typecheck)
npm run lint       # eslint
npm run format     # prettier write
npm test           # vitest run
```

## Layout

- `src/config.ts` — the single constants module: site name, referral URL, tile
  provider, geocoder, wedge geometry. Renaming or re-pointing costs one edit.
- `src/layouts/BaseLayout.astro` — page shell; the footer carries the
  independence disclaimer.
- `src/pages/` — routes. The landing page ships zero JavaScript; the planner is
  a separate route that lazy-loads its map library.

## Deployment

GitHub Pages project site: `https://masonhooten1.github.io/starlink`
(`site: "https://masonhooten1.github.io"`, `base: "/starlink"` in
`astro.config.mjs`).

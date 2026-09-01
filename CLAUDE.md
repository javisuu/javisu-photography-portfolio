# CLAUDE.md — suquia-portfolio

Briefing for the coding agent working in this repo. Read `docs/design-spec-v2.md` before building any UI — it is the source of truth for design decisions.

## What this is

SUQUIA — a personal photography portfolio for Javier Suquia. Awwwards-level ambition: white, editorial, serif typography, photographs as the only color on the page. Photography only; no CS/resume content.

## Stack (decided — do not substitute)

- **Next.js** (App Router) + **Tailwind CSS**, deployed on **Vercel**
- **GSAP + ScrollTrigger + Flip** for animation, **Lenis** for smooth scroll
- Font: **EB Garamond** via `next/font/google` (weights 400/500/600 + italic)
- Images via `next/image` with static imports. No CMS, no database, no WebGL in v1.

## Architecture rules

- All photo data lives in one typed file: `src/data/photos.ts` — album list + per-photo entries (src, width, height, title, capture data, album, order). Pages render from this file only; adding a photo must never require touching a component.
- Originals go in `/photos-master/` (gitignored); a script (`scripts/prepare-images.mjs`) exports web versions (AVIF/WebP, ~2500px long edge) into `public/photos/`.
- Pages: `/` (landing — tall scrolling composition, ~250–300vh, name fixed in viewport center throughout), `/albums` (carousel, opened only via the `ALBUMS` nav link — never reached by scrolling the landing), `/album/[slug]`, `/about`.
- Animation code isolated in `src/motion/` — components stay declarative; every effect must respect `prefers-reduced-motion`.

## Build order (work in phases; static before animated)

1. Scaffold + fonts + deploy pipeline (empty page live on Vercel first).
2. Static pages matching the approved mockups (see design spec §Page structure): landing scatter + name, carousel (static composition), album page, about.
3. Motion, in this order: Lenis smooth scroll (landing already has this, plus its fixed-name blend and per-photo parallax — see design spec §1) → entrance reveals → image hover → tube-roll scroll elsewhere on the site → infinite circular carousel → jump-into transition (GSAP Flip) → rolling digits → prev/next photo arrows.
4. Polish: responsive pass (desktop perfect, mobile good), metadata/OG, Lighthouse (LCP < 2.5s, CLS ≈ 0, 60fps scroll on mid-range mobile).

## Hard rules (from the design spec — never violate)

- Photos are never cropped (carousel slivers are the only exception) and always fit within one viewport height.
- Photos always in color; UI strictly grayscale on `#FAFAFA`; no accent colors.
- Titles in Title Case serif, labels in tracked uppercase 12–13px, numbers 14px `#666`.
- No cursor-parallax on layout elements. Transform/opacity-only animations.
- Placeholder content is fine during the build, but mark it clearly (`// PLACEHOLDER`).

## Reference

- `docs/design-spec-v2.md` — full design system, page anatomy, motion inventory.
- Approved visual mockups live in the owner's Claude artifact (ask Javi for a screenshot if needed).

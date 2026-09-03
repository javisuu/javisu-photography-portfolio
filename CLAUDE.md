# CLAUDE.md — suquia-portfolio

Briefing for the coding agent working in this repo. Read `docs/design-spec-v2.md` before building any UI — it is the source of truth for design decisions.

## What this is

SUQUIA — a personal photography portfolio for Javier Suquia. Awwwards-level ambition: white, editorial, serif typography, photographs as the only color on the page. Photography only; no CS/resume content.

## Stack (decided — do not substitute)

- **Next.js** (App Router) + **Tailwind CSS**, deployed on **Vercel**
- **GSAP + ScrollTrigger + Flip** for animation, **Lenis** for smooth scroll
- **WebGL2 via `ogl`** for the tube/roll effect (`src/motion/GLSurface.tsx`) — mirrors normal `next/image` elements onto one canvas; feature-detected, with a plain-DOM/CSS fallback if a context can't be created. See "Architecture rules" below.
- Font: **EB Garamond** via `next/font/google` (weights 400/500/600 + italic)
- Images via `next/image` with static imports. No CMS, no database.

## Architecture rules

- All photo data lives in one typed file: `src/data/photos.ts` — album list + per-photo entries (src, width, height, title, capture data, album, order). Pages render from this file only; adding a photo must never require touching a component.
- Originals go in `/photos-master/` (gitignored); a script (`scripts/prepare-images.mjs`) exports web versions (AVIF/WebP, ~2500px long edge) into `public/photos/`.
- Pages: `/` (landing — tall scrolling composition, ~250–300vh, name fixed in viewport center throughout), `/albums` (carousel, opened only via the `ALBUMS` nav link — never reached by scrolling the landing), `/album/[slug]`, `/about`.
- Animation code isolated in `src/motion/` — components stay declarative; every effect must respect `prefers-reduced-motion`.
- **The tube/roll GL effect** (`src/motion/GLSurface.tsx`): a reusable renderer, not per-page code. It mirrors a caller-supplied set of `<img>` elements onto one full-viewport canvas, reading their live `getBoundingClientRect()` every frame — it owns none of the layout/scroll/parallax, only the painting, so it works with whatever the page already does. `bendDepth`/`bendRadiusMultiplier` are per-instance props: the landing uses spectacle-level values, the album page (`src/motion/AlbumPhotos.tsx`) uses much gentler ones (~10x weaker push at the same screen position — barely perceptible is the goal, not zero). The carousel does NOT use it — it has its own model (see design spec §2) and stays untouched. Mandatory pattern for any new instance: the mirrored `<img>` must only get `visibility: hidden` once `onAvailabilityChange` fires `true` — never speculatively, or a missing/failed WebGL context leaves a blank page. `prefers-reduced-motion` pins the bend to 0 but keeps GL active (flat, not disabled).

## Build order (work in phases; static before animated)

1. Scaffold + fonts + deploy pipeline (empty page live on Vercel first). **DONE.**
2. Static pages matching the approved mockups (see design spec §Page structure): landing scatter + name, carousel (static composition), album page, about.
   - Landing (`/`) — **DONE.**
   - Album carousel (`/albums`) — **DONE**, structure and motion both (see below).
   - Album page (`/album/[slug]`) — **DONE** (title block, vertical alternating-placement flow, per-photo info, prev/next chevrons, NEXT ALBUM block, footer — all per design spec §3), photos now painted via GLSurface (gentle bend) same as the landing.
   - About (`/about`) — not started.
3. Motion, in this order: ~~Lenis smooth scroll (landing already has this, plus its fixed-name blend and per-photo parallax — see design spec §1)~~ **DONE** → ~~entrance reveals~~ **DONE** → ~~image hover~~ **DONE (landing)** → ~~tube-roll scroll elsewhere on the site~~ **DONE — landing (spectacle values) and every album page (barely-perceptible values) via the shared `GLSurface` component; the carousel deliberately excluded, it has its own model** → ~~infinite circular carousel~~ **DONE — see design spec §2 for the actual anchoring/commit/rest-position model, which supersedes the original mockup description** → jump-into transition (GSAP Flip) → rolling digits → prev/next photo arrows.
   - The carousel's own hover cue (title nudge + rule, on the open slide only) is also done — see design spec §2.
4. Polish: responsive pass (desktop perfect, mobile good), metadata/OG, Lighthouse (LCP < 2.5s, CLS ≈ 0, 60fps scroll on mid-range mobile).

Landing, the albums carousel, and the album page are considered settled — don't revisit any without being explicitly asked to. Current focus: the carousel→album jump transition, then rolling digits + the image hover rule, then About.

## Hard rules (from the design spec — never violate)

- Photos are never cropped (carousel slivers are the only exception) and always fit within one viewport height.
- Photos always in color; UI strictly grayscale on `#FAFAFA`; no accent colors.
- Titles in Title Case serif, labels in tracked uppercase 12–13px, numbers 14px `#666`.
- No cursor-parallax on layout elements. Transform/opacity-only animations.
- Placeholder content is fine during the build, but mark it clearly (`// PLACEHOLDER`).

## Reference

- `docs/design-spec-v2.md` — full design system, page anatomy, motion inventory.
- Approved visual mockups live in the owner's Claude artifact (ask Javi for a screenshot if needed).

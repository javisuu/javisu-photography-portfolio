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

- All photo data lives in one typed file: `src/data/photos.ts` — album list + per-photo entries (src, width, height, title, capture data, album, order, place). Pages render from this file only; adding a photo must never require touching a component.
- **`place` (per photo)**: `city`, `country`, `lat`/`lng` (`number | null`, written by hand — never from EXIF), `precision` (`'exact' | 'city'`). `'city'` means Javi didn't want the exact spot published, so `lat`/`lng` hold the city centroid instead — the map code never branches on which, it just plots whatever's there. `precision` governs display only: `'exact'` may show as degree/minute/second coordinates (atlas hover only, never the album caption), `'city'` must never be shown that way. `lat`/`lng` may be `null` — every consumer tolerates that (atlas omits the photo, caption falls back to "City, Country" alone, which is what it always shows regardless of precision anyway). All 32 photos currently carry placeholder place values (`"PLACEHOLDER"`/`null`/`'city'`) pending Javi filling them in by hand, one pass — see design spec's "Place data" section.
- Originals go in `/photos-master/` (gitignored); a script (`scripts/prepare-images.mjs`) exports web versions (AVIF/WebP, ~2500px long edge) into `public/photos/`.
- Pages: `/` (landing — tall scrolling composition, ~250–300vh, name fixed in viewport center throughout), `/albums` (carousel, opened only via the `ALBUMS` nav link — never reached by scrolling the landing), `/album/[slug]`, `/about`, `/credits` (a colophon, not a second About — reached via the rotated edge label, not the header nav), `/atlas` (a map view over the whole archive — linked from the header's top-right; route not built yet, currently 404s on click, see build order).
- Animation code isolated in `src/motion/` — components stay declarative; every effect must respect `prefers-reduced-motion`.
- **The tube/roll GL effect** (`src/motion/GLSurface.tsx`): a reusable renderer, not per-page code. It mirrors a caller-supplied set of `<img>` elements onto one full-viewport canvas, reading their live `getBoundingClientRect()` every frame — it owns none of the layout/scroll/parallax, only the painting, so it works with whatever the page already does. `bendDepth`/`bendRadiusMultiplier` are per-instance props: the landing uses spectacle-level values, the album page (`src/motion/AlbumPhotos.tsx`) uses much gentler ones (~10x weaker push at the same screen position — barely perceptible is the goal, not zero). The carousel does NOT use it — it has its own model (see design spec §2) and stays untouched. Mandatory pattern for any new instance: the mirrored `<img>` must only get `visibility: hidden` once `onAvailabilityChange` fires `true` — never speculatively, or a missing/failed WebGL context leaves a blank page. `prefers-reduced-motion` pins the bend to 0 but keeps GL active (flat, not disabled).

## Build order (work in phases; static before animated)

1. Scaffold + fonts + deploy pipeline (empty page live on Vercel first). **DONE.**
2. Static pages matching the approved mockups (see design spec §Page structure): landing scatter + name, carousel (static composition), album page, about.
   - Landing (`/`) — **DONE.** The rotated `MENU` edge label was removed (it drove no overlay/state); `CREDITS` is now the only rotated edge label, moved to the *left* edge, and links to `/credits` — that asymmetry is deliberate, not a leftover. Header nav is `ABOUT ME`/`ALBUMS` top-left, `ATLAS` top-right (13px/0.22em/`#111111`, same treatment as the other two, deliberately split from them — Atlas is a view over the whole archive, not a section); `PHOTOGRAPHS — {year}` was removed from the top-right. A fixed, non-blending descriptor (`SELECTED PHOTOGRAPHS THROUGH THE YEARS`, `#888888`) sits centered ~30px below the name's baseline.
   - Album carousel (`/albums`) — **DONE**, structure and motion both (see below).
   - Album page (`/album/[slug]`) — **DONE** (title block, vertical alternating-placement flow, per-photo info, prev/next chevrons, NEXT ALBUM block, footer — all per design spec §3), photos now painted via GLSurface (gentle bend) same as the landing. Album order is circular (`getNextAlbum` wraps via modulo); NY is currently last, linking back to América.
   - About (`/about`) — **DONE.** Bio is a marked `[PLACEHOLDER BIO]` — do not invent copy. Instagram handle is `[PLACEHOLDER]`. No contact form — email only, structured so a form could replace it later without a redesign.
   - Credits (`/credits`) — **DONE.** A colophon, five lines only, no page heading — see design spec §4b. Not reachable from the header nav; reached via the landing's rotated `CREDITS` label.
3. Motion, in this order: ~~Lenis smooth scroll (landing already has this, plus its fixed-name blend and per-photo parallax — see design spec §1)~~ **DONE** → ~~entrance reveals~~ **DONE** → ~~image hover~~ **DONE (landing)** → ~~tube-roll scroll elsewhere on the site~~ **DONE — landing (spectacle values) and every album page (barely-perceptible values) via the shared `GLSurface` component; the carousel deliberately excluded, it has its own model** → ~~infinite circular carousel~~ **DONE — see design spec §2 for the actual anchoring/commit/rest-position model, which supersedes the original mockup description** → jump-into transition (GSAP Flip) → rolling digits → prev/next photo arrows.
   - The carousel's own hover cue (title nudge + rule, on the open slide only) is also done — see design spec §2.
4. Polish: responsive pass (desktop perfect, mobile good), metadata/OG, Lighthouse (LCP < 2.5s, CLS ≈ 0, 60fps scroll on mid-range mobile).

Landing, the albums carousel, the album page, About, and Credits are considered settled — don't revisit any without being explicitly asked to. Current focus: mid-way through a 5-stage pass (nav cleanup + homepage descriptor **DONE** → per-photo place data + album caption hierarchy **DONE** → About/Credits re-verification against a slightly revised spec → `/atlas` map page → docs/commit pass), reported and reviewed stage by stage. Javi is now filling in real `place` values by hand across all 32 photos. After that: the carousel→album jump transition, then rolling digits + the image hover rule.

## Hard rules (from the design spec — never violate)

- Photos are never cropped (carousel slivers are the only exception) and always fit within one viewport height.
- Photos always in color; UI strictly grayscale on `#FAFAFA`; no accent colors.
- Titles in Title Case serif, labels in tracked uppercase 12–13px, numbers 14px `#666`.
- No cursor-parallax on layout elements. Transform/opacity-only animations.
- Placeholder content is fine during the build, but mark it clearly (`// PLACEHOLDER`).

## Reference

- `docs/design-spec-v2.md` — full design system, page anatomy, motion inventory.
- Approved visual mockups live in the owner's Claude artifact (ask Javi for a screenshot if needed).

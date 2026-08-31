# Design Spec v2 — SUQUIA Photography Portfolio

Supersedes v1. Reflects the decisions made over the mockup iterations (canvas: three approved artboards — Landing, Album carousel, Album page).

## Concept statement

**A white, quiet, editorial page where the photographs are the only color.** Serif typography in a grayscale hierarchy, generous whitespace, and motion as the personality layer: an inverted name over drifting photos, an endless calm carousel, a tube-roll scroll. Nothing competes with the images: no cropping, no symmetric grids, no cursor-following gimmicks.

## Art direction

**Color** — Background near-white `#FAFAFA`. UI text grayscale only: `#111` primary, `#666`–`#888` secondary, `#B0B0B0`–`#CCC` tertiary. No accent color — the photos are the accent.

**Typography** — Serif, in the tamakiyoshida direction: classical but softer than Times. **EB Garamond** (Google Fonts; weights 400/500/600 + italic) is the working face; fallback stack `Georgia, 'Times New Roman', serif`. Usage rules: titles in Title Case ("Alpes", not "ALPES") at weight 500; photo titles in italic ("Ibón de Plan"); small labels uppercase with wide tracking (0.16–0.22em) at 12–13px; numbers at 14px, `#666`. Importance is expressed by size + gray value, never by weight ramping.

**Brand** — The name **SUQUIA** appears: huge on the landing (~158px, weight 500), small in headers/footer (13px, tracked uppercase). No monogram/mark. Primary nav labels: `ABOUT ME`, `ALBUMS`; rotated 90° edge labels `MENU` / `CREDITS` on the landing.

**Layout principles** — Photos always at natural aspect ratio, never cropped (the only exception: carousel slivers, which are teasers by design). Organic scatter, not grids. Every photo fits within one viewport height (~max 85vh) — never larger than the screen.

## Page structure

### 1. Landing
Scattered mixed-ratio photos (5–7; mostly favorites, one or two acting as album shortcuts) over white. **SUQUIA rendered across the center, ABOVE the photos, in `mix-blend-mode: difference`** — reads black on the white background and inverts wherever a letter crosses an image; as the tube-scroll moves photos under the letters, the inversion shifts live. Each photo carries a small number only (`01`, `02`, …) — no names. Chrome: `ABOUT ME` top-left, `PHOTOGRAPHS — 2026` top-right, rotated `MENU`/`CREDITS` on the edges, `SCROLL` hint + `01 / 06` counter bottom.

### 2. Album carousel (below the landing, one continuous scroll)
Cynx-anatomy, calm version: **three wide slivers per side** (~132px, same height as center, ~32px gaps), landscape center slide (~908×500), outermost slivers cut by the viewport edges. **Infinite and circular** — the strip loops; there is no first or last position. Album covers are mostly horizontal photos. Info bottom-left (album title serif ~30px + gray meta line), pagination bottom-right (`01 — line — 04` with progress). Header center may carry `HH:MM — CITY` in light gray. No decorative digits.

### 3. Album page
**No hero.** The carousel's jump-into transition (center slide expands, GSAP Flip) IS the entrance; the page opens on a typographic title block: small `ALBUM 01 — 12 PHOTOS`, title serif ~110px, location/year line. Then a vertical top-down flow: photos at natural ratios, each ≤ one viewport height, alternating placement (centered / offset-left / offset-right), each with info alongside — number, italic title, capture data (focal length — aperture — ISO). Right-edge fixed control: SVG chevron up / `01 / 12` counter / chevron down for prev/next photo navigation. Ends with a NEXT ALBUM block (small cover + title) and a minimal footer (SUQUIA — INSTAGRAM — EMAIL — year).

### 4. About / Credits
One column: short bio, contact (email + Instagram). Same typographic system. No images competing.

## Motion inventory (frozen — 6 effects)

1. **Tube/roll scroll** (Lenis + GSAP ScrollTrigger) — images transform subtly with scroll velocity; site-wide signature. On the landing it also animates the name-inversion as photos slide under the letters.
2. **Hover on images** — inner zoom/shift within a fixed frame; boundaries never move.
3. **Infinite carousel** — circular drag/scroll strip, slivers + open center.
4. **Jump-into transition** — carousel center expands into the album page (GSAP Flip / View Transitions).
5. **Rolling digits** — pagination and photo counters animate per-digit.
6. **Entrance reveals** — fade/translate on first view; name letters reveal on load.

Anti-motion: no cursor-parallax on layout (cursor may grow over interactive images, never move the page). Respect `prefers-reduced-motion`.

## Photo treatment

Photos in **color always** — no B&W-until-hover. Focus within groups via dim/scale of inactive items, never desaturation of the work.

## Hard constraints

- White background; grayscale UI; photos are the only color.
- No cropping (carousel slivers excepted).
- Every photo fully visible within the viewport.
- Desktop perfect; mobile good (dedicated simpler mobile landing if the scatter doesn't translate).
- Performance: transform/opacity-only animation; 60fps on mid-range mobile; Lighthouse LCP < 2.5s.

## Open items

1. License or confirm final typeface (EB Garamond is the free stand-in for the tamakiyoshida-style serif; identify the exact commercial face later if desired).
2. Real album names, covers (mostly horizontal — confirmed available), and photo metadata.
3. About page copy and languages (EN / EN+ES).

##Additional

The carousel's open slide keeps the fixed height but adopts the cover photo's natural aspect ratio — landscape covers open wide, vertical covers open as a tall panel. Covers are never cropped; slide width animates between albums.

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
**A tall scrolling composition (~250–300vh), smoothed with Lenis — superseded from an earlier "single fixed screen" draft.** The page genuinely scrolls; reference: gregorcollienne.com. **SUQUIA stays fixed in the center of the viewport for the whole scroll**, as do the nav, rotated edge labels, and counter — none of them are part of the scrolling layer. The photos (9–10 of them, mostly favorites, one or two acting as album shortcuts) live in the scrolling layer and pass behind/around the fixed name as the page scrolls; spaced so 2–3 are on screen at a time, natural aspect ratios always, each ≤ 70vh. On desktop every photo keeps clear whitespace around it (min ~60px to its neighbors); at narrow/compressed widths some overlap is acceptable. Each photo and its number (`01`, `02`, …) are wrapped in the same container so they move together in sync — the number sits just outside the photo edge (below-left), never covered. **SUQUIA renders white with `mix-blend-mode: difference`** — reads near-black on the `#FAFAFA` background at rest and inverts wherever a photo passes under it. This depends on strict stacking-context hygiene: no `transform`/`opacity`/`filter`/`will-change`/`perspective` on the fixed name element's ancestors, or on the scrolling layer's own wrapper — only individual photos animate, never the name or anything between it and the page root. (This exact setup broke once already from an ancestor transform; verify on load, with no photo under it, that the name reads black before treating this as done.) Chrome: `ABOUT ME` top-left, `PHOTOGRAPHS — 2026` top-right, rotated `MENU`/`CREDITS` on the edges (clear of the photos), `01 / 06` counter bottom — all fixed, no scroll hint. The ALBUMS nav link is the only way into the carousel; the landing scroll never leads there.

### 2. Album carousel (its own view — NOT reached by scrolling the landing) — BUILT, `src/motion/AlbumsCarousel.tsx`
Opened only via the `ALBUMS` nav link. **Infinite and circular** — the strip loops; there is no first or last position (indices are `mod`'d into the album list, not clamped). Anatomy as actually implemented:

- **Slides**: constant height (500px) always, for every slide, at every moment — nothing ever scales vertically. A folded slide is a fixed, equal-width sliver (110px) regardless of its album's aspect ratio; the open (active) slide's width is its cover's own natural width at that height (`height × aspect ratio`) — landscape covers open wide, vertical covers open as a tall panel, and the width animates between those two states, never the height. Covers are never cropped.
- **Commit is position-triggered, not velocity-triggered**: scroll/drag feed a velocity that integrates into an offset; crossing one slot's pitch (sliver width + gap) advances the active index by one and the offset carries the remainder — no minimum speed, no separate "flick" threshold. Below that distance the strip simply follows the input 1:1 and holds wherever it's left, with **no snap-back or rubber-banding** — recentring happens only as a side effect of an actual commit, never while idle.
- **Direction-based edge anchoring**: advancing forward pins the open slide's RIGHT edge in place and reveals/grows it toward the left (the image is pinned `right:0`, cropped/revealed from its left side); advancing backward mirrors this exactly (LEFT edge pinned, grows right, image pinned `left:0`). Both the outgoing and incoming slide in a given step always share the same anchor side, so a commit reads as one continuous motion rather than two independent folds.
- **Rest position is two fixed lines, not the viewport centre**: `X_RIGHT`/`X_LEFT` are computed once from the *average* natural cover width across all albums and never move. A forward commit settles with the open slide's right edge exactly on `X_RIGHT`; a backward commit settles with its left edge exactly on `X_LEFT`. The open photo's own centre therefore varies a little album to album (narrower covers rest right-of-centre, wider ones left-of-centre) — accepted as the natural consequence of a genuinely static anchor edge, not corrected for.
- **Frozen image anchoring**: which edge a slide's `<img>` is pinned to is decided once — when that slide starts folding or unfolding, or when it first mounts if it's never been opened — and held fixed for as long as it stays folded. A settled sliver's crop never changes again on its own; only the slide actually transitioning right now may pick a new anchor.
- **Depth cues**: blur and a dark veil scale by distance from the active index (a few fixed steps, not a continuous gradient) — the active slide has neither.
- **No native scroll on either axis** — the page and the strip are both `overflow: hidden`; all motion is transform-driven, never real scroll position.
- **Navigation**: only the open (active) slide is a link, to `/album/[slug]` — folded slivers do nothing on click, only step the carousel via the normal drag/scroll physics. Hovering the open slide nudges the info-block title ~4px right and grows a thin rule under it (300ms, respects `prefers-reduced-motion`); nothing on the photo itself ever moves or transforms. This is a plain client-side route change today — the shared-element "jump into" expansion (Motion inventory #4) is not built yet.

Info bottom-left (album title serif ~30px + gray meta line), pagination bottom-right (`01 / 04`).

### 3. Album page
**No hero.** The carousel's jump-into transition (center slide expands, GSAP Flip) IS the entrance; the page opens on a typographic title block: small `ALBUM 01 — 12 PHOTOS`, title serif ~110px, location/year line. Then a vertical top-down flow: photos at natural ratios, each ≤ one viewport height, alternating placement (centered / offset-left / offset-right), each with info alongside — number, italic title, capture data (focal length — aperture — ISO). Right-edge fixed control: SVG chevron up / `01 / 12` counter / chevron down for prev/next photo navigation. Ends with a NEXT ALBUM block (small cover + title) and a minimal footer (SUQUIA — INSTAGRAM — EMAIL — year).

### 4. About / Credits
One column: short bio, contact (email + Instagram). Same typographic system. No images competing.

## Motion inventory (frozen — 6 effects)

1. **Tube/roll scroll** (Lenis + GSAP ScrollTrigger) — images transform subtly with scroll velocity; site-wide signature. On the landing, Lenis smooths the real page scroll and each photo gets a modest depth-based parallax on top of it; the fixed name is never part of that transformed layer.
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

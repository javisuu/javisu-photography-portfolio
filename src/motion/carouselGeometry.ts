// Geometry of one carousel slide, shared by the carousel itself
// (src/motion/AlbumsCarousel.tsx) and the carousel→album flight layer
// (src/motion/albumTransition/), which paints the same slides with the
// same markup (spec 019). Moved here verbatim from AlbumsCarousel.tsx —
// no logic changed; spec 019 CA14 measures the rest geometry unchanged.

import type { Photo } from "@/data/photos";

// SLIDE_HEIGHT is the one dimension that is NEVER conditional on distance,
// openness, or animation state — every frame in the strip, and every
// image inside it, is exactly this tall, always.
export const SLIDE_HEIGHT = 500;
export const GAP = 32;
// Every FOLDED slide is exactly this wide — no distance-based compression.
// Uniform width is what lets every slide other than the (at most two)
// actively opening/closing ones behave as one rigid, non-deforming block.
export const S = 110;

// Depth (spec 011, decision 3): a folded slide is covered by a black panel
// with film grain (public/textures/grano.png, from scripts/
// generate-grain.mjs), whose opacity follows that slide's own openness:
// PANEL_OPACITY * (1 - openness). It replaced a distance-based blur() and
// grey veil, both CSS transitions on React state: a blur filter is
// expensive to animate, and opacity is compositing only. Written by the
// physics loop like everything else continuous.
// 90%, not fully opaque: Javi compared both on his own screen (spec 011,
// T11) — a trace of the photo shows through each sliver.
export const PANEL_OPACITY = 0.9;
export const GRAIN_TEXTURE = "/textures/grano.png";

export function naturalWidthFor(cover: Pick<Photo, "width" | "height">) {
  return Math.round(SLIDE_HEIGHT * (cover.width / cover.height));
}

// The <img> inside a slide must reveal/hide from the SAME edge the layout
// itself is hinged from (see computeFrame in AlbumsCarousel.tsx) — otherwise
// the layout grows one way while the image crops the other, which reads as
// two facing curtains. Forward hinges RIGHT (image pinned to the frame's
// right edge, reveal/hide on the left); backward hinges LEFT (pinned left,
// reveal/hide on the right).
//
// There is no third, centre-anchored state: a folded sliver is pinned
// exactly the same way an open slide is, just at width S instead of its
// natural width. Centring a folded sliver was the earlier (wrong) design
// — the instant a fold finished, the anchor would flip from its edge to
// 50%, and since those two formulas expose a different slice of the same
// wide image, the crop visibly jumped even though the slide had stopped
// moving. Every slide always has exactly one pinned edge, decided once
// when it starts folding/unfolding (or when it first mounts, for a slide
// that's never opened) and held FROZEN from then on — not recomputed on
// settle, not on translation, not when the global scroll direction later
// reverses for some other slide's transition. See imageAnchorDirRef in
// the physics loop for where that per-slide freeze lives; travelDir here
// is whatever direction was frozen for THIS slide, not necessarily the
// live global one.
//
// Counter-scale (spec 011): the fold never changes a width, so it never
// triggers layout. The frame is always laid out at the cover's NATURAL
// width and shown at `width` by scaleX(width / natural) from its left
// edge; its child carries the inverse scaleX(natural / width), so the two
// cancel and the image paints at its real size, clipped by the frame's
// (scaled) overflow box to exactly `width`. The child's transform-origin
// is the pinned edge: about the right edge, the image's right edge lands
// on the frame's visible right edge; about the left, left on left — the
// same crop the old right:0 / left:0 positioning gave.
export function frameTransformFor(x: number, width: number, naturalWidth: number) {
  return `translateX(${x}px) scaleX(${width / naturalWidth})`;
}
export function counterScaleFor(width: number, naturalWidth: number) {
  return `scaleX(${naturalWidth / width})`;
}
export function pinnedOriginFor(travelDir: number) {
  return travelDir > 0 ? "100% 0" : "0 0";
}
export function driftTransformFor(driftPx: number) {
  return `translateX(${driftPx}px)`;
}

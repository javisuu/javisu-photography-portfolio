"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type Lenis from "lenis";
import type { Photo } from "@/data/photos";
import { useLenis } from "./useLenis";
import GLSurface from "./GLSurface";

// Tuned for spectacle here — the landing is the showpiece. The album page
// (which reuses the same GLSurface) passes much gentler values: the work
// should be looked at there, not performed at.
const BEND_DEPTH = 1;
const BEND_RADIUS_MULTIPLIER = 1.2;

const PARALLAX_STRENGTH = 0.12;
const SEQUENCE_HEIGHT_VH = 320;
// Two identical copies are rendered, but the scroll container's own CSS
// height is capped at calc(SEQUENCE_HEIGHT_VH + 100vh) — i.e. one cycle
// plus exactly one viewport height — NOT SEQUENCE_HEIGHT_VH * COPIES.
// This is load-bearing, not cosmetic: Lenis's infinite mode wraps the
// native scroll position with modulo(accumulator, scrollHeight -
// clientHeight). For that wrap to land on identical content (the only
// thing that makes it invisible), scrollHeight - clientHeight must equal
// the cycle height EXACTLY. Measured proof of the bug this fixes: at a
// 900px-tall viewport, two full 320vh copies gave scrollHeight=5760px,
// so limit = 5760-900 = 4860px — not a multiple of the 2880px cycle, so
// the wrap wrote back to a point 1980px into the cycle instead of 0,
// which is exactly the jump that was visible. With height capped to
// cycle+100vh, scrollHeight-clientHeight collapses to the cycle height
// for any viewport size (vh units recompute on resize for free — see the
// arithmetic check this was verified against). The second copy's items
// that fall within that trailing 100vh (i.e. everything with an original
// y < ~100) are exactly what's visible there — clipped by overflowY on
// this container, not hand-picked — so the last screen before the wrap
// already shows the opening composition.
const COPIES = 2;

type Placement = {
  x: number; // left, % of viewport width
  y: number; // top, vh (within one SEQUENCE_HEIGHT_VH cycle)
  w: number; // width, vw
  /** Parallax speed multiplier. 0 = pinned to its scroll position exactly —
   * used where the margin to a neighbor is too thin to survive any drift. */
  depth: number;
};

// Hand-authored layout — reference viewport 1440x900. All 15 verified
// non-overlapping at rest at that reference. Six photos are pinned
// (depth: 0) because their margin to a neighbor is too thin to survive
// any parallax drift at all:
//   sea-through-trees / ny-library    — 14.4px X gap at rest
//   ny-library / red-sun-boat         — 0.1px Y gap at rest (touching)
//   red-sun-boat / san-blas-island    — 9.6px Y gap at rest
//   red-sun-boat / eclipse-totality   — 6.9px Y gap at rest
//
// "bougainvillea" (y: 6->14) and "cristo-silhouette" (y: 92->87) fix two
// header-safe-zone bugs: bougainvillea's original y:6 put it inside the
// top ~110px chrome band at rest; cristo's original y:92 let its exit
// overlap the (now-removed) man-in-sea's entry into that same band.
// "waves-panorama" (y: 48->54) gives more air under bougainvillea.
// "man-in-sea" was removed (replaced by "cowboy-silhouette", positioned
// to close the 578px empty band that used to follow san-miguel-street —
// not in man-in-sea's old slot, which wouldn't have helped that).
// "america-untitled-08" fills the horizontal-center gap below ny-skyline
// (x:39, own lane — 72px clear of ny-skyline's right edge and 72px clear
// of cowboy-silhouette's left edge at the 1440px reference, own depth).
const LANDING_LAYOUT: Record<string, Placement> = {
  "horses-dust": { x: 6, y: 8, w: 28, depth: 0.5 },
  "bougainvillea": { x: 74, y: 14, w: 22, depth: 0.45 },
  "sea-through-trees": { x: 42, y: 74, w: 15, depth: 0 },
  "basque-cliffs": { x: 8, y: 52, w: 17, depth: 0.6 },
  "waves-panorama": { x: 66, y: 54, w: 31, depth: 0.35 },
  "ny-library": { x: 26, y: 96, w: 15, depth: 0 },
  "cristo-silhouette": { x: 78, y: 87, w: 16, depth: 0.55 },
  "red-sun-boat": { x: 6, y: 128, w: 22, depth: 0 },
  "cowboy-silhouette": { x: 68, y: 272, w: 22, depth: 0.4 },
  "san-blas-island": { x: 12, y: 176, w: 24, depth: 0 },
  "eclipse-totality": { x: 44, y: 168, w: 15, depth: 0 },
  "biarritz-palace": { x: 72, y: 184, w: 26, depth: 0.5 },
  "ny-skyline": { x: 4, y: 224, w: 30, depth: 0.6 },
  "america-untitled-08": { x: 39, y: 264, w: 24, depth: 0.45 },
  "san-miguel-street": { x: 70, y: 236, w: 16, depth: 0.4 },
};

type LayoutItem = {
  photo: Photo;
  placement: Placement;
  /** Rendered height, computed from the photo's real aspect ratio at its
   * given vw width — needed to find which photo is "focal" for the
   * counter, not for rendering (the <img> sizes itself via CSS). */
  heightVh: number;
};

function buildLayout(photos: Photo[]): LayoutItem[] {
  return photos.map((photo) => {
    const placement = (photo.id && LANDING_LAYOUT[photo.id]) || {
      x: 40,
      y: SEQUENCE_HEIGHT_VH - 40,
      w: 20,
      depth: 0.3,
    };
    const ratio = photo.width / photo.height;
    // width(vw) -> px at a 1440-wide reference -> height(px) -> back to vh
    // at a 900-tall reference, matching the hand-tuned reference viewport.
    const heightVh = ((placement.w * 14.4) / ratio / 9);
    return { photo, placement, heightVh };
  });
}

export default function LandingComposition({ photos }: { photos: Photo[] }) {
  const lenisRef = useLenis({ infinite: true });

  const layout = useMemo(() => buildLayout(photos), [photos]);
  // One ref per rendered (possibly duplicated) photo instance.
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Same indexing as itemRefs, but the actual <img> — what GLSurface
  // mirrors. Kept separate from itemRefs because GLSurface needs the
  // image element itself (as a texture source), not its positioning
  // wrapper.
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const [focalIndex, setFocalIndex] = useState(0);
  // Only true once GLSurface confirms a working WebGL context. Until
  // then the real <img> elements stay visible — see the MANDATORY
  // FALLBACK note on the visibility style below.
  const [glActive, setGlActive] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame: number;
    function update() {
      const viewportCenter = window.innerHeight / 2;
      itemRefs.current.forEach((el, i) => {
        if (!el) return;
        const depth = layout[i % layout.length].placement.depth;
        if (depth === 0) return; // pinned — never touch its transform
        const rect = el.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = viewportCenter - elementCenter;
        el.style.transform = `translateY(${distance * PARALLAX_STRENGTH * depth}px)`;
      });
      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  // Counter: which photo is closest to viewport-center right now, within
  // one SEQUENCE_HEIGHT_VH cycle (so it cycles 01..14..01.. with the loop).
  useEffect(() => {
    const lenis = lenisRef.current;
    if (!lenis) return;

    function onScroll(instance: Lenis) {
      const sequenceHeightPx = (SEQUENCE_HEIGHT_VH / 100) * window.innerHeight;
      const wrapped = ((instance.scroll % sequenceHeightPx) + sequenceHeightPx) % sequenceHeightPx;
      const focalPageY = wrapped + window.innerHeight / 2;

      let bestIndex = 0;
      let bestDistance = Infinity;
      layout.forEach((item, i) => {
        const centerYPx =
          (item.placement.y / 100) * window.innerHeight +
          ((item.heightVh / 100) * window.innerHeight) / 2;
        const distance = Math.abs(centerYPx - focalPageY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      });
      setFocalIndex(bestIndex);
    }

    lenis.on("scroll", onScroll);
    return () => lenis.off("scroll", onScroll);
  }, [lenisRef, layout]);

  return (
    <main>
      {/* Scrolling layer — real page scroll (smoothed by Lenis), hand-tuned
          composition the photos live in (see LANDING_LAYOUT). Rendered
          COPIES times back to back, but this element's own height is
          capped at ONE cycle plus ONE viewport height (see the COPIES
          comment above for why that specific height is load-bearing for
          Lenis's infinite-scroll wrap, not just SEQUENCE_HEIGHT_VH*COPIES).
          overflowY clips the rest of the second copy so it never expands
          document.documentElement.scrollHeight beyond that. No transform/
          opacity/filter on this element or its ancestors: it sits behind
          the fixed name and must not break that element's mix-blend-mode.
          overflow-x: clip (not hidden) matches the html/body fix in
          layout.tsx; z-10 keeps this layer explicitly below the chrome's
          z-20/z-30. */}
      <div
        className="relative z-10 w-screen"
        style={{
          height: `calc(${SEQUENCE_HEIGHT_VH}vh + 100vh)`,
          overflowX: "clip",
          overflowY: "clip",
        }}
      >
        {Array.from({ length: COPIES }).map((_, copy) =>
          layout.map((item, i) => (
            <div
              key={`${item.photo.src}-${copy}`}
              ref={(el) => {
                itemRefs.current[copy * layout.length + i] = el;
              }}
              className="absolute landing-photo"
              style={{
                top: `${item.placement.y + copy * SEQUENCE_HEIGHT_VH}vh`,
                left: `${item.placement.x}%`,
                ["--landing-photo-w" as string]: `${item.placement.w}vw`,
              }}
            >
              <Image
                ref={(el) => {
                  imgRefs.current[copy * layout.length + i] = el;
                }}
                src={item.photo.src}
                alt={item.photo.title}
                width={item.photo.width}
                height={item.photo.height}
                className="block h-auto w-full"
                sizes={`${item.placement.w}vw`}
                priority={copy === 0 && i === 0}
                // MANDATORY FALLBACK: only hidden once GLSurface confirms
                // a working WebGL context. If that never fires (missing
                // or failed context), this stays visible and the page
                // renders exactly as the plain CSS/DOM landing always
                // has — never hidden speculatively. Only the image is
                // hidden, not the wrapper: the number below must stay.
                style={{ visibility: glActive ? "hidden" : "visible" }}
              />
              <span className="mt-2 block font-serif text-[12px] text-[#666] no-underline">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
          ))
        )}
      </div>

      {/* GLSurface mirrors the <img>s above onto one full-viewport canvas
          once a WebGL context is confirmed (see glActive). It owns no
          layout or parallax — it only reads getBoundingClientRect() on
          the same elements every frame, so the parallax effect above,
          Lenis's infinite-scroll wrap, and this component's own layout
          all flow through untouched. z-10, same as the photo layer it
          replaces visually. */}
      <GLSurface
        nodes={imgRefs}
        lenisRef={lenisRef}
        bendDepth={BEND_DEPTH}
        bendRadiusMultiplier={BEND_RADIUS_MULTIPLIER}
        onAvailabilityChange={setGlActive}
        className="pointer-events-none fixed inset-0 z-10"
      />

      {/* Fixed chrome — never moves, and z-20/z-30 keep it above the
          photo layer (z-10) regardless of where any photo lands.
          ATLAS deliberately sits apart from the ABOUT ME / ALBUMS group:
          it's a view over the whole archive, not a section like the
          other two, and the left/right split reads that way. "Photographs
          — {year}" was removed from here — non-interactive text sitting
          among interactive links invited clicks that went nowhere, and
          the descriptor below the name now does that labeling job. */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between p-6 text-[13px] uppercase tracking-[0.22em] text-[#111111] md:p-10">
        <nav className="pointer-events-auto flex gap-6">
          <Link href="/about" className="hover:text-[#666]">
            About Me
          </Link>
          <Link href="/albums" className="hover:text-[#666]">
            Albums
          </Link>
        </nav>
        <Link href="/atlas" className="pointer-events-auto hover:text-[#666]">
          Atlas
        </Link>
      </div>

      {/* MENU was removed (it drove no overlay/state — just a label) so
          this is the site's only rotated edge label now. Deliberate
          asymmetry, not a leftover: don't add a matching label on the
          right to "balance" it. Fixed + no ancestor transform of its own,
          so it doesn't touch the wordmark's blend stacking context. */}
      <Link
        href="/credits"
        className="fixed left-4 top-1/2 z-20 -translate-y-1/2 -rotate-90 text-[12px] uppercase tracking-[0.2em] text-[#B0B0B0] hover:text-[#666] md:left-6"
      >
        Credits
      </Link>

      <div className="pointer-events-none fixed inset-x-0 bottom-8 z-20 flex justify-end px-6 text-[12px] uppercase tracking-[0.18em] text-[#888] md:px-10">
        <span className="tabular-nums">
          {String(focalIndex + 1).padStart(2, "0")} / {String(photos.length).padStart(2, "0")}
        </span>
      </div>

      {/* Fixed wordmark — white + mix-blend-difference reads near-black on
          the #FAFAFA background and inverts wherever a scrolling photo
          passes under it. No transform/opacity/filter/will-change/
          perspective on this element or any ancestor — that creates a
          stacking context and silently breaks the blend. Only the photos
          animate, never this. Its band is roughly y:38-62vh, x:33-67% of
          the viewport — LANDING_LAYOUT keeps photos clear of it except
          "sea-through-trees" and "eclipse-totality", which are meant to
          rise into / cross it.
          IMPORTANT: this element must stay the direct fixed/z-30 node —
          do NOT wrap it in an intermediate positioned/z-indexed parent
          "to group it with the descriptor below." That was tried and
          broke the blend: the wrapper's own stacking context gave the h1
          nothing to blend against within it, so it resolved against a
          transparent backdrop and rendered plain white instead of
          inverting. The descriptor is a fully independent sibling
          instead — see its own comment below. */}
      <h1
        className="pointer-events-none fixed inset-0 z-30 flex select-none items-center justify-center text-center font-medium leading-none text-white mix-blend-difference"
        style={{ fontSize: "clamp(64px, 16vw, 158px)" }}
      >
        SUQUIA
      </h1>

      {/* Descriptor — deliberately NOT nested with the h1 above (see its
          comment for why): an independent fixed element, manually
          centered, positioned ~30px below the name's baseline at this
          component's reference viewport (1440x900, where the name sits
          at its clamp() max of 158px). Plain #888888, no blend — sibling
          of the h1, not a child of it, so it can't inherit
          mix-blend-difference. z-30 (same layer as the name) still
          guarantees it's never covered by a photo at any scroll
          position — a z-index guarantee, not a blend one, so no
          LANDING_LAYOUT exclusion is needed the way the name's blend
          band needs one. */}
      <p
        className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 select-none text-center text-[13px] uppercase tracking-[0.34em] text-[#888888]"
        style={{ top: "calc(50% + 109px)" }}
      >
        Selected Photographs Through the Years
      </p>
    </main>
  );
}

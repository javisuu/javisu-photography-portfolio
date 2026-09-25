"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type Lenis from "lenis";
import type { Photo } from "@/data/photos";
import { useLenis } from "./useLenis";
import GLSurface from "./GLSurface";
import DecipherWordmark from "./DecipherWordmark";
import ScrambleText from "./ScrambleText";

// Rendered once from the root layout (not per-route from app/page.tsx) so
// it survives navigating away and back — see the `active` plumbing below.
// SSR renders this with `useLayoutEffect` in the tree, which would warn
// about doing nothing server-side; resolve to a plain effect there.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}
function getReducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
function getReducedMotionServerSnapshot() {
  return false;
}

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

// Entrance (arrival at the landing): every photo starts stacked at the
// viewport centre and eases out to its layout position, staggered from
// the centre of the composition outward. See the dedicated effect below
// for the full mechanics. Total (last item's delay + its own duration)
// lands around ~900ms.
const ENTRANCE_DURATION_MS = 750;
const ENTRANCE_STAGGER_MS = 10;
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

type Placement = {
  x: number; // left, % of viewport width
  y: number; // top, vh (within one SEQUENCE_HEIGHT_VH cycle)
  w: number; // width, vw
  /** Parallax speed multiplier. 0 = pinned to its scroll position exactly —
   * used where the margin to a neighbor is too thin to survive any drift. */
  depth: number;
};

// A reference-viewport fallback used ONLY for the very first, SSR-safe
// paint (see centerOffsetVwVh) — before any client effect has run, there
// is no real window to measure. Every client-side computation passes the
// ACTUAL live viewport instead, which is what makes the entrance's gather
// point exact at any aspect ratio, not just this one. The SSR-only
// approximation this falls back to is never actually visible: the
// entrance wrapper it feeds renders at opacity: 0 until the reveal effect
// below runs, and that effect always supplies live dimensions.
const REFERENCE_VIEWPORT_W = 1440;
const REFERENCE_VIEWPORT_H = 900;

// Mirrors the responsive width rule in globals.css (.landing-photo and its
// <900px media query): below that breakpoint, a photo's REAL on-screen
// width is 2.4x its authored placement.w, capped at 85vw — not the
// authored value itself. Both the entrance's gather point and the focal-
// index counter need the real width (its center shifts right as the box
// grows from a fixed left edge), and the two diverge below the
// breakpoint, which is exactly what produced a systematically wrong pile
// target at a 615-wide test viewport: every item was centered as if it
// were still at its narrow desktop width, when it was actually rendering
// up to 2.4x wider.
const RESPONSIVE_WIDTH_BREAKPOINT_PX = 900;
const RESPONSIVE_WIDTH_SCALE = 2.4;
const RESPONSIVE_WIDTH_CAP_VW = 85;
function actualWidthVw(placementW: number, viewportWidthPx: number): number {
  if (viewportWidthPx >= RESPONSIVE_WIDTH_BREAKPOINT_PX) return placementW;
  return Math.min(placementW * RESPONSIVE_WIDTH_SCALE, RESPONSIVE_WIDTH_CAP_VW);
}

// A photo's rendered height, in vh, at a given viewport — computed from
// its own aspect ratio and its REAL CSS width (see actualWidthVw above),
// never from a value baked at one reference aspect ratio. (A previous
// version of this file baked heightVh once at build time using the
// 1440x900 reference's own px-per-vw/vh conversion factors; that value
// was wrong by the ratio of the real viewport's aspect ratio to 1440:900
// — negligible near 16:10, but way off on a narrow/tall viewport, which
// is exactly what also skewed the entrance's gather point there.)
function itemHeightVh(item: LayoutItem, viewportW: number, viewportH: number): number {
  const ratio = item.photo.width / item.photo.height;
  const widthPx = (actualWidthVw(item.placement.w, viewportW) / 100) * viewportW;
  return ((widthPx / ratio) / viewportH) * 100;
}

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
};

function buildLayout(photos: Photo[]): LayoutItem[] {
  return photos.map((photo) => {
    const placement = (photo.id && LANDING_LAYOUT[photo.id]) || {
      x: 40,
      y: SEQUENCE_HEIGHT_VH - 40,
      w: 20,
      depth: 0.3,
    };
    return { photo, placement };
  });
}

// The entrance's starting offset (viewport-centre minus the item's own
// centre), in CSS vw/vh units rather than measured pixels. This is what
// lets the starting position exist in the very first rendered HTML (see
// the JSX below) instead of only after a client effect runs: `x`/`y`/`w`/
// `heightVh` are static layout data, known at render time on the server
// too, so this needs no window/DOM access — the browser resolves the
// vw/vh units itself at paint time, using whatever the real viewport
// turns out to be. Valid exactly when scrollY is 0 (top.y-vh IS the
// on-screen vh position only then), which the activation effect below
// guarantees before this ever matters. Reused for the JS-driven tween
// too (converted to pixels there, since that needs to interpolate
// smoothly frame to frame) — one formula, two unit systems, so the two
// can never drift apart from each other.
function centerOffsetVwVh(
  item: LayoutItem,
  viewportW: number = REFERENCE_VIEWPORT_W,
  viewportH: number = REFERENCE_VIEWPORT_H
): { dxVw: number; dyVh: number } {
  const heightVh = itemHeightVh(item, viewportW, viewportH);
  const centerXVw = item.placement.x + actualWidthVw(item.placement.w, viewportW) / 2;
  const centerYVh = item.placement.y + heightVh / 2;
  return { dxVw: 50 - centerXVw, dyVh: 50 - centerYVh };
}

// An item participates in the gather-and-release entrance only if its
// FINAL rest position (before any entrance transform) lands within the
// viewport, expanded by 15% of the viewport height on each side. Every
// other photo is off-screen at arrival and simply renders at rest,
// unanimated — see the reveal effect below. Computed from live viewport
// dimensions, same as the gather point itself.
const ENTRANCE_PARTICIPATION_EXPAND_VH = 15;
function participatesInEntrance(item: LayoutItem, viewportW: number, viewportH: number): boolean {
  const heightVh = itemHeightVh(item, viewportW, viewportH);
  const top = item.placement.y;
  const bottom = top + heightVh;
  return bottom >= -ENTRANCE_PARTICIPATION_EXPAND_VH && top <= 100 + ENTRANCE_PARTICIPATION_EXPAND_VH;
}

type EntranceItem = { delayMs: number; dx: number; dy: number };
type EntranceState = { items: Map<number, EntranceItem>; startTime: number; maxDelayMs: number };

export default function LandingComposition({ photos }: { photos: Photo[] }) {
  // Rendered persistently from the root layout so its GL scene (and
  // Lenis instance) never have to tear down and rebuild on navigation —
  // `active` is the one thing that's actually route-dependent here.
  // Everything else (the DOM composition, the WebGL context, every
  // decoded/uploaded texture) stays exactly as it was the moment we
  // last left `/`, ready to resume instantly.
  const pathname = usePathname();
  const active = pathname === "/";

  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  // Lenis can't simply be "paused" while inactive — its own .stop()
  // keeps calling preventDefault() on every wheel/touch event, which
  // would freeze scrolling on whatever OTHER route is showing rather
  // than release it back to native scroll or that page's own Lenis
  // instance (album pages have one). So the instance itself is
  // constructed/destroyed in step with `active` — see useLenis.
  const lenisRef = useLenis({ infinite: true }, active);

  // Reset to the top of the composition before Lenis (re)initializes on
  // activation, so a fresh arrival always starts from the same, correct
  // position for both the composition itself and the entrance animation's
  // measurements below — a layout effect so it runs before useLenis's
  // (passive) effect constructs the new instance around whatever scroll
  // position it would otherwise have inherited.
  useIsomorphicLayoutEffect(() => {
    if (active) window.scrollTo(0, 0);
  }, [active]);

  const layout = useMemo(() => buildLayout(photos), [photos]);
  // Two nested refs per rendered (possibly duplicated) photo instance —
  // NOT one. `itemRefs` is the positioned (top/left/width) OUTER wrapper,
  // written ONLY by the ongoing scroll-parallax loop, from frame one,
  // forever. `entranceElRefs` is an INNER wrapper around the photo,
  // written ONLY by the one-time arrival animation, which always targets
  // exactly translate(0,0) and is then left alone. Two systems, two
  // elements: each transform composes with the other automatically, so
  // there's never a moment where one has to hand off to / overwrite the
  // other — the entrance finishing at "0" always means "wherever the
  // parallax loop currently has it," not a stale snapshot. (Previously
  // both wrote the same element's transform, which meant the entrance's
  // resting value and the parallax loop's real steady-state value could
  // disagree — e.g. the entrance settling at 0 while parallax's own
  // value for that item at scroll 0 was anywhere from +12px to -99px —
  // producing a visible snap at handover. Splitting the two elements
  // removes the handover entirely rather than trying to retune it.)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const entranceElRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Same indexing again, but the actual <img> — what GLSurface mirrors.
  // Kept separate because GLSurface needs the image element itself (as a
  // texture source), not either positioning wrapper. Its rect naturally
  // reflects both ancestor transforms composed together, so GLSurface
  // itself needs no changes for any of this.
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const [focalIndex, setFocalIndex] = useState(0);

  // glStatus: null = not yet known, true = WebGL confirmed working
  // (mirrored <img>s get hidden per-instance below), false = confirmed
  // unavailable (plain CSS/DOM fallback, unchanged from before this
  // component existed). texturesReady flips once every mirrored photo
  // has actually been uploaded to the GPU — see the reveal-gating note
  // below for why the entrance can't start before then.
  const [glStatus, setGlStatus] = useState<boolean | null>(null);
  const [texturesReady, setTexturesReady] = useState(false);
  // The moment it's safe to show photos at all: either GL confirmed it
  // can't run (show the plain fallback immediately, nothing to wait on)
  // or GL is running AND every texture it needs has actually uploaded.
  // Gating on the latter — not just "GL is available" — is what stops a
  // photo from appearing blank and filling in a moment later once
  // uploads are paced across frames (see GLSurface).
  const readyToReveal = glStatus === false || (glStatus === true && texturesReady);

  const entranceRef = useRef<EntranceState | null>(null);

  // `arriveKey` is bumped once per arrival (0 is the "not triggered yet"
  // sentinel). Photos and the wordmark now trigger independently off the
  // same underlying signals (readyToReveal / arriveKey) rather than one
  // gating the other — see design-spec-v2.md's 2026-09-23 changelog
  // entry: the wordmark's own decipher used to BE the loading state and
  // photos wait on its lock; that's inverted now, the wordmark instead
  // starts 600ms after the photo entrance begins (see
  // ARRIVAL_WORDMARK_DELAY_MS in DecipherWordmark) so the two reveals
  // read as deliberately staggered, not simultaneous.
  const [arriveKey, setArriveKey] = useState(0);

  // Fires once per arrival, independent of texture readiness — the
  // wordmark's own trigger effect reacts to this too.
  useIsomorphicLayoutEffect(() => {
    if (!active) return;
    setArriveKey((k) => k + 1);
  }, [active]);

  // Guards against playing the entrance more than once for the same
  // arrival: this effect's guard (active && readyToReveal) can be
  // satisfied on more than one render for the same arriveKey — e.g. a
  // return visit found this happening twice, ~700ms apart, with
  // identical computed offsets each time (confirming it was the same
  // effect body re-running, not a real second arrival). Comparing
  // against the arriveKey this already played for makes a second
  // pass-through a no-op regardless of what re-triggers it, without
  // having to track down every possible re-trigger.
  const entrancePlayedKeyRef = useRef(0);

  // The entrance itself: fires once photos are safe to reveal, and again
  // every time we arrive back at "/" (readyToReveal, once true, stays
  // true forever — so on a return visit this fires as soon as arriveKey
  // changes). A layout effect so the reveal itself is atomic with
  // starting the tween — but the STARTING state (hidden + displaced)
  // doesn't wait for this at all; it's already true from the very first
  // rendered frame, JSX-declared on the entrance wrapper below (see
  // centerOffsetVwVh) — this effect only has to start animating the
  // offset back down to 0 (and opacity up to 1) from whatever it already
  // is, for whichever items actually participate (see
  // participatesInEntrance) — every other photo jumps straight to its
  // rest position, unanimated.
  useIsomorphicLayoutEffect(() => {
    if (reducedMotion) return;
    if (!active || !readyToReveal) return;
    if (entrancePlayedKeyRef.current === arriveKey) return;
    entrancePlayedKeyRef.current = arriveKey;
    const copyZero = entranceElRefs.current.slice(0, layout.length);

    // Same formula as the JSX-declared starting transform (see
    // centerOffsetVwVh) converted to pixels, using the LIVE viewport —
    // never cached from an earlier render or a wrapper's own width.
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const ranked = layout
      .map((item, i) => {
        if (!copyZero[i]) return null;
        if (!participatesInEntrance(item, viewportWidth, viewportHeight)) return null;
        const { dxVw, dyVh } = centerOffsetVwVh(item, viewportWidth, viewportHeight);
        const dx = (dxVw / 100) * viewportWidth;
        const dy = (dyVh / 100) * viewportHeight;
        return { index: i, dx, dy, dist: Math.hypot(dx, dy) };
      })
      .filter((r): r is { index: number; dx: number; dy: number; dist: number } => r !== null)
      .sort((a, b) => a.dist - b.dist);

    const items = new Map<number, EntranceItem>();
    ranked.forEach((r, rank) => {
      items.set(r.index, { delayMs: rank * ENTRANCE_STAGGER_MS, dx: r.dx, dy: r.dy });
    });
    entranceRef.current = {
      items,
      startTime: performance.now(),
      maxDelayMs: ranked.length > 0 ? (ranked.length - 1) * ENTRANCE_STAGGER_MS : 0,
    };

    // Jump every PARTICIPATING item straight to its starting (pile)
    // position at opacity 0 — the staggered ease-out (transform AND
    // opacity together, see the rAF loop below) plays out over the
    // following frames. Every other item goes straight to rest, fully
    // visible, untouched from here on: it was never near the viewport at
    // arrival, so nothing about it should move or fade.
    copyZero.forEach((el, i) => {
      if (!el) return;
      el.style.transition = "";
      const item = items.get(i);
      if (item) {
        el.style.transform = `translate(${item.dx}px, ${item.dy}px)`;
        el.style.opacity = "0";
      } else {
        el.style.transform = "";
        el.style.opacity = "1";
      }
    });
  }, [active, readyToReveal, reducedMotion, layout, arriveKey]);

  // Keeps an in-flight entrance's targets correct if the viewport resizes
  // mid-animation — recomputed from the live viewport, same formula as
  // the kickoff above, so a resize never leaves stale pixel offsets
  // converging on a stale gather point. Delays/start time are untouched;
  // only where each item is travelling TO changes.
  useEffect(() => {
    if (reducedMotion) return;
    function onResize() {
      const entrance = entranceRef.current;
      if (!entrance) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      entrance.items.forEach((item, i) => {
        const layoutItem = layout[i];
        if (!layoutItem) return;
        const { dxVw, dyVh } = centerOffsetVwVh(layoutItem, viewportWidth, viewportHeight);
        item.dx = (dxVw / 100) * viewportWidth;
        item.dy = (dyVh / 100) * viewportHeight;
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reducedMotion, layout]);

  // Reduced motion: no travel, and no name-first sequencing either —
  // there's nothing animated to sequence against, so photos simply fade
  // in the moment they're ready, same as always.
  useIsomorphicLayoutEffect(() => {
    if (!reducedMotion) return;
    if (!active || !readyToReveal) return;
    const copyZero = entranceElRefs.current.slice(0, layout.length);
    entranceRef.current = null;
    const REDUCED_FADE_MS = 400;
    copyZero.forEach((el) => {
      if (!el) return;
      el.style.transition = `opacity ${REDUCED_FADE_MS}ms ease`;
      el.style.transform = "";
      el.style.opacity = "1";
    });
  }, [active, readyToReveal, reducedMotion, layout]);

  // One rAF loop, two independent writers. The parallax half runs
  // unconditionally, every frame, from the first one — it owns only
  // `itemRefs` (the outer wrapper) and never even looks at entrance
  // state. The entrance half runs only until it finishes and owns only
  // `entranceElRefs` (the inner wrapper); once every item has reached
  // its target it stops touching that element entirely, leaving its
  // transform at the identity it already wrote. Paused entirely while
  // inactive (hidden, unscrollable) or reduced-motion (handled as a
  // plain CSS fade above instead, no transform ever).
  useEffect(() => {
    if (reducedMotion) return;
    if (!active) return;

    let frame: number;
    function update() {
      const viewportCenter = window.innerHeight / 2;

      // Parallax — outer wrapper, every frame, unconditionally. Pinned
      // (depth: 0) items are the one exception: never touched, at all,
      // by this loop — same rule as always.
      itemRefs.current.forEach((el, flatIndex) => {
        if (!el) return;
        const depth = layout[flatIndex % layout.length].placement.depth;
        if (depth === 0) return;
        const rect = el.getBoundingClientRect();
        const elementCenter = rect.top + rect.height / 2;
        const distance = viewportCenter - elementCenter;
        el.style.transform = `translateY(${distance * PARALLAX_STRENGTH * depth}px)`;
      });

      // Entrance — inner wrapper, copy-0 only, only while still playing.
      // Opacity and transform are driven on the SAME timeline: opacity
      // ramps 0 -> 1 over the first 40% of an item's own travel, never
      // reaching 1 while the transform is still near its full start
      // offset (a photo used to reach opacity 1 immediately, before it
      // had moved at all, which read as "appearing at the pile before it
      // moves").
      const entrance = entranceRef.current;
      if (entrance) {
        const now = performance.now();
        const stillPlaying = now < entrance.startTime + entrance.maxDelayMs + ENTRANCE_DURATION_MS;
        if (stillPlaying) {
          for (let i = 0; i < layout.length; i++) {
            const el = entranceElRefs.current[i];
            const item = entrance.items.get(i);
            if (!el || !item) continue;
            const elapsed = now - entrance.startTime - item.delayMs;
            let ex = 0;
            let ey = 0;
            let opacity = 1;
            if (elapsed <= 0) {
              ex = item.dx;
              ey = item.dy;
              opacity = 0;
            } else if (elapsed < ENTRANCE_DURATION_MS) {
              const t = elapsed / ENTRANCE_DURATION_MS;
              const eased = easeOutCubic(t);
              ex = item.dx * (1 - eased);
              ey = item.dy * (1 - eased);
              opacity = Math.min(1, t / 0.4);
            }
            el.style.transform = `translate(${ex}px, ${ey}px)`;
            el.style.opacity = String(opacity);
          }
        } else {
          // Just finished — write the identity once more (covers the
          // frame where `elapsed` first exceeds the duration, so no item
          // is left mid-tween) and then stop touching this element
          // until the next arrival.
          for (let i = 0; i < layout.length; i++) {
            const el = entranceElRefs.current[i];
            if (el && entrance.items.has(i)) {
              el.style.transform = "translate(0px, 0px)";
              el.style.opacity = "1";
            }
          }
          entranceRef.current = null;
        }
      }

      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [active, reducedMotion, layout]);

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
        const heightVh = itemHeightVh(item, window.innerWidth, window.innerHeight);
        const centerYPx =
          (item.placement.y / 100) * window.innerHeight +
          ((heightVh / 100) * window.innerHeight) / 2;
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
    <main style={{ display: active ? undefined : "none" }}>
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
          layout.map((item, i) => {
            const startOffset = copy === 0 ? centerOffsetVwVh(item) : null;
            return (
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
              {/* Entrance-owned wrapper, nested inside the parallax-owned
                  one above — see the itemRefs/entranceElRefs comment.
                  copy-0 instances render ALREADY hidden and displaced to
                  centre (see centerOffsetVwVh) — a plain static style
                  object, present in the very first HTML this component
                  ever produces, server-rendered markup included: there
                  is no client-only effect this waits on, so no frame,
                  ever, can show a copy-0 photo at its final position
                  before the entrance has run (previously true only
                  after hydration + a layout effect — the gap between
                  raw SSR paint and that effect running was exactly the
                  flash this replaces). copy-1 (always off-screen at
                  arrival) gets neither: it's never animated, so it
                  renders at rest, visible, from the start. The reveal
                  effect later overwrites both properties imperatively
                  (opacity -> 1, transform animating back to identity) —
                  it never fights this initial render because neither
                  value here is state-derived, so React never re-asserts
                  it on a later, unrelated re-render (e.g. focalIndex
                  changing on scroll). */}
              <div
                ref={(el) => {
                  entranceElRefs.current[copy * layout.length + i] = el;
                }}
                className="landing-photo-entrance"
                style={
                  startOffset
                    ? { opacity: 0, transform: `translate(${startOffset.dxVw}vw, ${startOffset.dyVh}vh)` }
                    : undefined
                }
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
                  // Every copy-0 photo needs to actually be loaded before
                  // the entrance can start (see readyNodeCount on
                  // GLSurface below) — next/image lazy-loads everything
                  // but the first by default, which would leave anything
                  // off-screen at arrival never even fetching until
                  // scrolled near, deadlocking that wait forever. Copy-1
                  // (the infinite-scroll duplicate, always off-screen at
                  // arrival) stays lazy — nothing waits on it.
                  priority={copy === 0}
                  // MANDATORY FALLBACK: only hidden once GLSurface confirms
                  // a working WebGL context. If that never fires (missing
                  // or failed context), this stays visible and the page
                  // renders exactly as the plain CSS/DOM landing always
                  // has — never hidden speculatively. Only the image is
                  // hidden, not the wrapper: the number below must stay.
                  style={{ visibility: glStatus === true ? "hidden" : "visible" }}
                />
                <span className="mt-2 block font-serif text-[12px] text-[#666] no-underline">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
            </div>
            );
          })
        )}
      </div>

      {/* GLSurface mirrors the <img>s above onto one full-viewport canvas
          once a WebGL context is confirmed (see glStatus). It owns no
          layout or parallax — it only reads getBoundingClientRect() on
          the same elements every frame, so the parallax/entrance effect
          above, Lenis's infinite-scroll wrap, and this component's own
          layout all flow through untouched. z-10, same as the photo
          layer it replaces visually. `active` pauses its paint loop
          (without tearing down the renderer/textures) whenever we're not
          on "/" — see GLSurface's own comment for why that matters. */}
      <GLSurface
        nodes={imgRefs}
        lenisRef={lenisRef}
        bendDepth={BEND_DEPTH}
        bendRadiusMultiplier={BEND_RADIUS_MULTIPLIER}
        active={active}
        onAvailabilityChange={setGlStatus}
        onTexturesReady={() => setTexturesReady(true)}
        readyNodeCount={layout.length}
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
            <ScrambleText text="About Me" />
          </Link>
          <Link href="/albums" className="hover:text-[#666]">
            <ScrambleText text="Albums" />
          </Link>
        </nav>
        <Link href="/atlas" className="pointer-events-auto hover:text-[#666]">
          <ScrambleText text="Atlas" />
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
        <ScrambleText text="Credits" />
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
          instead — see its own comment below.
          Its content is DecipherWordmark, not plain text — two distinct
          motions, never sharing a verb (see that component's own file
          header): on arrival, rest decodes into JAVIER (the only place
          any random glyph ever appears), then JAVIER->SUAREZ->SUQUIA
          play as direct swaps — no randomness, same letters rearranging
          — starting 600ms after the photo entrance begins rather than
          gating it; on hover the same three words replay, swaps only,
          never the decipher (decipher reads as "not resolved yet," which
          hover has no business claiming). Safe here specifically because
          it only ever adds DESCENDANTS with their own width transition
          (each letter column) — nothing between the h1 and the page root
          gains one,
          which is the only thing that's ever actually broken this
          blend. See that component's own note. font-kerning: none
          applies to every state alike (the settled plain text included)
          so the per-letter width-locking during a decipher run is
          pixel-identical to how the plain word actually renders — with
          kerning left on, adjacent-pair spacing (e.g. the "AV" in
          JAVIER) would make the plain word's natural width slightly
          narrower than the sum of its individually-measured letters,
          breaking the "no visible shift at settle" requirement.
          aria-label pins the accessible name to "Suquia" regardless of
          which DOM DecipherWordmark currently renders (a settled
          plain-text node most of the time, a mid-run per-letter
          structure — itself aria-hidden — otherwise); relying on
          computed-from-content would otherwise expose whatever noise a
          decipher is passing through at that instant. */}
      <h1
        className="pointer-events-none fixed inset-0 z-30 flex select-none items-center justify-center text-center font-medium leading-none text-white mix-blend-difference"
        style={{ fontSize: "clamp(64px, 16vw, 158px)", fontKerning: "none" }}
        aria-label="Suquia"
      >
        <DecipherWordmark
          arriveKey={arriveKey}
          ready={readyToReveal}
          active={active}
          reducedMotion={reducedMotion}
        />
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

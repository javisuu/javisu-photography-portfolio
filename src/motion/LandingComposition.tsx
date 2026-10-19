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

// Entrance (arrival at the landing): a real two-phase loading state, not
// one animation with a start keyframe — see the 2026-09-27 changelog
// entry for why. PHASE A (accumulate): each participating photo, as its
// own decode resolves, appears at the viewport centre — stacked on
// whichever are already there, newest on top — with a small deterministic
// per-photo offset/rotation so the pile reads as a pile, not one image.
// Held for at least PILE_MIN_DWELL_MS even on a fully warm cache (so it's
// never a flash), and for at most PILE_MAX_WAIT_MS (so the page is never
// hostage to one slow file) — whichever comes first triggers PHASE B.
// PHASE B (disperse): unchanged from before — each photo translates (and
// un-rotates) from its pile position to its real layout position,
// staggered outward from the viewport centre. Total (last item's delay +
// its own duration) lands around ~900ms. Any photo not yet decoded when
// phase B starts is a straggler: it takes no part in the cascade and
// instead just fades in at its own final position, alone, whenever it
// does become ready.
const ENTRANCE_DURATION_MS = 750;
const ENTRANCE_STAGGER_MS = 10;
const PILE_FADE_IN_MS = 180;
const PILE_MIN_DWELL_MS = 350;
const PILE_MAX_WAIT_MS = 2500;
const PILE_STRAGGLER_FADE_MS = 300;
// Minimum visual spacing between one photo joining the pile and the
// next — NOT a decode time. Spec 008: with photos this fast to decode
// (spec 007), `whenImageReady` now resolves for every participant in
// the same microtask flush (all already `.complete` by the time the
// entrance starts), so without this throttle the pile never reads as
// building up, it just pops in all at once. A real straggler (actually
// slow to decode) is never delayed beyond its own arrival — see
// nextAllowedJoinAt below.
const PILE_JOIN_MIN_GAP_MS = 70;
// Deliberately small — this is a pile of prints settling slightly
// differently, not a scatter. No scaling ever, anywhere: every photo
// sits in the pile at its own final rendered size (see
// startPileEntrance — the pile offset is a translate only), which is
// also what makes the dispersal pure translation, with nothing else to
// go wrong.
const PILE_JITTER_X_PX = 24;
const PILE_JITTER_Y_PX = 16;
const PILE_JITTER_ROTATE_DEG = 1.5;
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// A deterministic, index-derived value in [-1, 1) — same output for the
// same (index, salt) pair every time, unlike Math.random(), so the pile
// looks identical on every load. A classic GLSL-style sine hash, good
// enough for "looks random" over a handful of small integer indices.
function deterministicUnit(index: number, salt: number): number {
  const s = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}
function pileJitterFor(index: number): { jx: number; jy: number; jr: number } {
  return {
    jx: deterministicUnit(index, 1) * PILE_JITTER_X_PX,
    jy: deterministicUnit(index, 2) * PILE_JITTER_Y_PX,
    jr: deterministicUnit(index, 3) * PILE_JITTER_ROTATE_DEG,
  };
}

// Per-photo decode readiness. Checked SYNCHRONOUSLY first — an image
// already `.complete` from cache never fires a subsequent 'load' event,
// so a trigger that only ever subscribes to that event silently skips
// the entrance forever the moment anything is cached. This was a real,
// confirmed bug (reload only — a fresh load rarely has anything cached
// yet, which is exactly why it hid so well). `img.decode()` is the
// primary path once we know it isn't already done: its promise resolves
// once pixel data is actually ready to paint, the same guarantee
// `.complete` gives for the cache case. A decode() rejection (rare — the
// src changing mid-decode, some older-engine quirks) falls back to the
// native load/error events; error counts as ready too, so one broken
// file can never stall the page.
function whenImageReady(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  const waitForEvents = () =>
    new Promise<void>((resolve) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
    });
  if (typeof img.decode === "function") {
    return img.decode().catch(waitForEvents);
  }
  return waitForEvents();
}

type Placement = {
  x: number; // left, % of viewport width
  y: number; // top, vh (within one SEQUENCE_HEIGHT_VH cycle)
  w: number; // width, vw
  /** Parallax speed multiplier. 0 = pinned to its scroll position exactly —
   * used where the margin to a neighbor is too thin to survive any drift. */
  depth: number;
};

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

// One entry per participating (copy-0) index. dx/dy/jr are the distance
// (px) and rotation (deg) from that item's own natural position to the
// pile — used BOTH as where it appears when it joins the pile (phase A)
// and as what phase B eases back to 0. Kept live (mutated by the resize
// handler) rather than snapshotted once, so an in-flight entrance never
// converges on a stale target if the viewport changes mid-run.
type PileParticipant = { dx: number; dy: number; jr: number };
type PileEntranceState = {
  participants: Map<number, PileParticipant>;
  // performance.now() timestamp each index joined the pile (phase A's
  // own fade-in start) — absent until that photo's decode resolves.
  joinedAt: Map<number, number>;
  startTime: number;
  // Spec 008: earliest time the NEXT join is allowed to actually run,
  // enforcing PILE_JOIN_MIN_GAP_MS between consecutive joins — see
  // scheduleJoin in startPileEntrance. Advances by that gap every time
  // a join is scheduled, whether or not it had to wait.
  nextAllowedJoinAt: number;
  dispersing: boolean;
  disperseStartTime: number;
  // Rank-based stagger delay (ms), assigned once, only for items that
  // had actually joined the pile by the moment dispersal started.
  disperseDelays: Map<number, number>;
  maxDisperseDelayMs: number;
  // Indices still not ready when dispersal started — never join the
  // pile at all, instead fade in alone at rest once ready (see
  // stragglerFadeStart).
  stragglers: Set<number>;
  stragglerFadeStart: Map<number, number>;
  // "Newest joins on top," in both the DOM (z-index, for the plain CSS
  // fallback) and the GL surface (renderOrderRef, since WebGL has no
  // concept of DOM z-index — see GLSurface's own doc for that prop).
  joinCounter: number;
};

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
  // component existed). The entrance no longer waits on this at all —
  // each photo's OWN decode readiness (see whenImageReady) is what gates
  // its own reveal now, independent of which render path ends up
  // painting it; see the 2026-09-27 changelog entry for why an aggregate
  // "wait for every texture, then reveal everything at once" gate was
  // replaced.
  const [glStatus, setGlStatus] = useState<boolean | null>(null);

  const entranceRef = useRef<PileEntranceState | null>(null);
  // Per-index paint-order override, read by GLSurface every frame (see
  // that prop's own doc) — WebGL has no notion of DOM z-index, so
  // "newest pile arrival paints on top" needs this in addition to the
  // z-index written on the DOM wrapper below (which only matters for the
  // no-GL fallback path). An animation-driving ref, like the others
  // here, never routed through React state.
  const renderOrderRef = useRef<number[]>([]);

  // `arriveKey` is bumped once per arrival (0 is the "not triggered yet"
  // sentinel). Photos and the wordmark trigger independently off it —
  // see design-spec-v2.md's 2026-09-23 changelog entry: the wordmark's
  // own decipher used to BE the loading state and photos wait on its
  // lock; that's inverted now, and as of 2026-09-27 the photo entrance
  // itself no longer waits on any aggregate photo-readiness signal
  // either (see startPileEntrance) — the wordmark instead just starts
  // 600ms after activation (see ARRIVAL_WORDMARK_DELAY_MS in
  // DecipherWordmark) so the two reveals read as deliberately staggered,
  // not simultaneous, and neither is hostage to how long photos take to
  // decode.
  const [arriveKey, setArriveKey] = useState(0);

  // Fires once per arrival, independent of texture readiness — the
  // wordmark's own trigger effect reacts to this too. Latched via a ref
  // (not just the `[active]` dep) because React Strict Mode's dev-only
  // double-invoke of layout effects would otherwise bump arriveKey TWICE
  // for the same activation (0 -> 1 -> 2), and since each bump is a
  // genuinely different key, the wordmark's own re-trigger guard (which
  // only catches a repeat of the SAME arriveKey) can't tell that apart
  // from a real second arrival — confirmed live: it replayed the
  // decipher/flap arrival sequence mid-hover, stomping
  // arrivalActiveRef back to true and silently breaking the hover-leave
  // transition. The ref resets when active goes false so a genuine
  // return visit (leave "/" and come back) still bumps again.
  const arriveBumpedForActiveRef = useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (!active) {
      arriveBumpedForActiveRef.current = false;
      return;
    }
    if (arriveBumpedForActiveRef.current) return;
    arriveBumpedForActiveRef.current = true;
    setArriveKey((k) => k + 1);
  }, [active]);

  // Guards against starting the entrance more than once for the same
  // arrival — this effect's guard could be satisfied on more than one
  // render for the same arriveKey (a return visit was once found doing
  // exactly this, ~700ms apart, with identical computed offsets both
  // times, confirming it was the same effect body re-running, not a real
  // second arrival — see the 2026-09-26 arriveKey-double-bump fix for a
  // different bug with the same symptom). Comparing against the
  // arriveKey this already started for makes a second pass-through a
  // no-op regardless of what re-triggers it.
  const entranceStartedForKeyRef = useRef(0);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    },
    []
  );

  function startPileEntrance() {
    // Instrumentation: exactly one line per real entrance start. Two for
    // one navigation is the regression to watch for.
    console.log("[entrance] start", { arriveKey });

    const copyZero = entranceElRefs.current.slice(0, layout.length);
    const outerZero = itemRefs.current.slice(0, layout.length);
    const imgZero = imgRefs.current.slice(0, layout.length);

    // Participation AND each participant's pile offset are both measured
    // from the REAL, already-laid-out DOM rect (getBoundingClientRect on
    // the outer, parallax-owned wrapper) — never predicted from a
    // viewport-math formula the way the old "start offset" was. That's
    // what makes this immune to the reload-only "photos come from above"
    // bug: the old formula could be evaluated against a layout that
    // hadn't settled yet (fonts, image aspect ratios); a live rect
    // simply can't be wrong, whenever it's read.
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = viewportWidth / 2;
    const centerY = viewportHeight / 2;

    const participants = new Map<number, PileParticipant>();
    for (let i = 0; i < layout.length; i++) {
      const item = layout[i];
      const outerEl = outerZero[i];
      if (!outerEl || !copyZero[i]) continue;
      if (!participatesInEntrance(item, viewportWidth, viewportHeight)) continue;
      const rect = outerEl.getBoundingClientRect();
      const { jx, jy, jr } = pileJitterFor(i);
      participants.set(i, {
        dx: centerX + jx - (rect.left + rect.width / 2),
        dy: centerY + jy - (rect.top + rect.height / 2),
        jr,
      });
    }

    // Non-participants: never near the viewport at arrival, so they sit
    // at their final position from the start — nothing to hide, nothing
    // to animate, no transform ever written for them.
    for (let i = 0; i < layout.length; i++) {
      if (participants.has(i)) continue;
      const el = copyZero[i];
      if (el) {
        el.style.transform = "";
        el.style.opacity = "1";
      }
    }

    if (participants.size === 0) {
      entranceRef.current = null;
      return;
    }

    const entranceStartNow = performance.now();
    const state: PileEntranceState = {
      participants,
      joinedAt: new Map(),
      startTime: entranceStartNow,
      nextAllowedJoinAt: entranceStartNow,
      dispersing: false,
      disperseStartTime: 0,
      disperseDelays: new Map(),
      maxDisperseDelayMs: 0,
      stragglers: new Set(),
      stragglerFadeStart: new Map(),
      joinCounter: 0,
    };
    entranceRef.current = state;

    function disperseNow() {
      if (state.dispersing) return;
      state.dispersing = true;
      state.disperseStartTime = performance.now();
      // Staggered outward from the viewport centre, same as before —
      // ranked by how far each item that actually made it into the pile
      // has to travel back to rest. Anything not yet joined at this
      // exact moment is a straggler (see below): it never joins the
      // cascade at all.
      const ranked = Array.from(state.participants.entries())
        .filter(([i]) => state.joinedAt.has(i))
        .map(([i, p]) => ({ index: i, dist: Math.hypot(p.dx, p.dy) }))
        .sort((a, b) => a.dist - b.dist);
      ranked.forEach((r, rank) => {
        state.disperseDelays.set(r.index, rank * ENTRANCE_STAGGER_MS);
      });
      state.maxDisperseDelayMs = ranked.length > 0 ? (ranked.length - 1) * ENTRANCE_STAGGER_MS : 0;
      state.participants.forEach((_, i) => {
        if (!state.joinedAt.has(i)) state.stragglers.add(i);
      });
    }

    function maybeScheduleDispersal() {
      if (state.joinedAt.size < state.participants.size) return;
      // Everyone's in. Guarantee at least PILE_MIN_DWELL_MS total time
      // in the pile — measured from phase A's own start, not from
      // whenever the last photo happened to join — so a fully warm
      // cache still reads as a pile, never a flash.
      const elapsed = performance.now() - state.startTime;
      const remaining = Math.max(0, PILE_MIN_DWELL_MS - elapsed);
      if (remaining === 0) {
        disperseNow();
      } else {
        const t = setTimeout(() => {
          if (activeRef.current && entranceRef.current === state) disperseNow();
        }, remaining);
        timeoutsRef.current.push(t);
      }
    }

    participants.forEach((_, i) => {
      const img = imgZero[i];
      function join() {
        if (!activeRef.current || entranceRef.current !== state) return; // superseded
        if (state.dispersing) {
          // Too late for the pile: fade in alone, at rest, whenever this
          // straggler's own decode happens to resolve.
          state.stragglerFadeStart.set(i, performance.now());
          return;
        }
        state.joinCounter += 1;
        // "Newest on top," in both the DOM (fallback CSS path) and the
        // GL surface (WebGL has no notion of DOM z-index — see
        // GLSurface's renderOrderRef doc).
        const outerEl = outerZero[i];
        if (outerEl) outerEl.style.zIndex = String(state.joinCounter);
        renderOrderRef.current[i] = state.joinCounter;
        state.joinedAt.set(i, performance.now());
        maybeScheduleDispersal();
      }
      // Spec 008: throttles join() to at least PILE_JOIN_MIN_GAP_MS after
      // the previous one, so a burst of already-`.complete` images (the
      // common case now that decode is fast, spec 007) still reads as a
      // pile building up rather than popping in at once. A genuinely slow
      // image is never delayed past its own real readiness: nextAllowedJoinAt
      // only pushes later arrivals back, never pulls an earlier one forward.
      function scheduleJoin() {
        if (!activeRef.current || entranceRef.current !== state) return; // superseded
        const now = performance.now();
        const runAt = Math.max(now, state.nextAllowedJoinAt);
        state.nextAllowedJoinAt = runAt + PILE_JOIN_MIN_GAP_MS;
        if (runAt <= now) {
          join();
        } else {
          const t = setTimeout(() => {
            if (activeRef.current && entranceRef.current === state) join();
          }, runAt - now);
          timeoutsRef.current.push(t);
        }
      }
      if (!img) {
        scheduleJoin();
        return;
      }
      whenImageReady(img).then(scheduleJoin);
    });

    const maxWaitTimer = setTimeout(() => {
      if (activeRef.current && entranceRef.current === state) disperseNow();
    }, PILE_MAX_WAIT_MS);
    timeoutsRef.current.push(maxWaitTimer);
  }

  // The entrance itself: a real two-phase loading state (see the
  // constants above) rather than one animation with a start keyframe.
  // Kicks off at "arm time" — as soon as we know this is a real
  // activation (active && a fresh arriveKey) — not gated on any
  // aggregate photo-readiness signal the way it used to be; each
  // participating photo's OWN decode (whenImageReady) is what reveals it
  // into the pile now. A layout effect so the STARTING state (every
  // participating photo at opacity 0 — see the JSX below, which no
  // longer computes any position for it either, just that one flag) is
  // what actually paints, with nothing about where photos will end up
  // computed before this runs.
  useIsomorphicLayoutEffect(() => {
    if (reducedMotion) return;
    if (!active) return;
    if (entranceStartedForKeyRef.current === arriveKey) return;
    entranceStartedForKeyRef.current = arriveKey;
    startPileEntrance();
  }, [active, reducedMotion, layout, arriveKey]);

  // Keeps an in-flight entrance's pile offsets correct if the viewport
  // resizes mid-run — re-measured from the live DOM rect, same as the
  // kickoff above, so a resize never leaves a stale pixel target for
  // either a still-piling photo or one already mid-dispersal.
  useEffect(() => {
    if (reducedMotion) return;
    function onResize() {
      const state = entranceRef.current;
      if (!state) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const centerX = viewportWidth / 2;
      const centerY = viewportHeight / 2;
      state.participants.forEach((p, i) => {
        const outerEl = itemRefs.current[i];
        if (!outerEl) return;
        const rect = outerEl.getBoundingClientRect();
        const { jx, jy } = pileJitterFor(i);
        p.dx = centerX + jx - (rect.left + rect.width / 2);
        p.dy = centerY + jy - (rect.top + rect.height / 2);
      });
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [reducedMotion]);

  // Reduced motion: no pile, no travel — each participating photo simply
  // fades in, alone, the moment its own decode resolves (same
  // whenImageReady signal phase A uses), at its one and only position.
  useIsomorphicLayoutEffect(() => {
    if (!reducedMotion) return;
    if (!active) return;
    if (entranceStartedForKeyRef.current === arriveKey) return;
    entranceStartedForKeyRef.current = arriveKey;
    entranceRef.current = null;
    const REDUCED_FADE_MS = 400;
    const copyZero = entranceElRefs.current.slice(0, layout.length);
    const imgZero = imgRefs.current.slice(0, layout.length);
    copyZero.forEach((maybeEl, i) => {
      if (!maybeEl) return;
      const el = maybeEl;
      el.style.transform = "";
      const img = imgZero[i];
      function reveal() {
        if (!activeRef.current) return;
        el.style.transition = `opacity ${REDUCED_FADE_MS}ms ease`;
        el.style.opacity = "1";
      }
      if (!img) {
        reveal();
        return;
      }
      whenImageReady(img).then(reveal);
    });
  }, [active, reducedMotion, layout, arriveKey]);

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

      // Entrance — inner wrapper, copy-0 only. Two independent
      // sub-phases share the same state object (see PileEntranceState):
      // phase A (pile) writes a CONSTANT transform — the pile offset,
      // set the instant each photo joins — while easing its OWN opacity
      // 0 -> 1 over PILE_FADE_IN_MS; phase B (disperse) eases the
      // transform back to 0, with opacity already at 1 and left alone
      // (never re-ramped — every item that makes it into the cascade has
      // already fully faded in well before PILE_MIN_DWELL_MS elapses, so
      // re-ramping here would visibly dip it back down first). A
      // straggler (not yet decoded when dispersal started) gets a third,
      // fully independent treatment: a plain opacity fade at its one and
      // only (rest) position, whenever its own decode eventually
      // resolves — no transform, since it was never displaced to begin
      // with.
      const entrance = entranceRef.current;
      if (entrance) {
        const now = performance.now();

        if (!entrance.dispersing) {
          entrance.participants.forEach((p, i) => {
            if (entrance.stragglers.has(i)) return;
            const el = entranceElRefs.current[i];
            const joinedAt = entrance.joinedAt.get(i);
            if (!el || joinedAt == null) return; // hasn't joined yet — stays invisible
            const elapsed = now - joinedAt;
            const opacity = elapsed >= PILE_FADE_IN_MS ? 1 : elapsed / PILE_FADE_IN_MS;
            el.style.transform = `translate(${p.dx}px, ${p.dy}px) rotate(${p.jr}deg)`;
            el.style.opacity = String(opacity);
          });
        } else {
          let allSettled = true;
          entrance.participants.forEach((p, i) => {
            if (entrance.stragglers.has(i)) return;
            const el = entranceElRefs.current[i];
            const delayMs = entrance.disperseDelays.get(i);
            if (!el || delayMs == null) return;
            const elapsed = now - entrance.disperseStartTime - delayMs;
            let ex = p.dx;
            let ey = p.dy;
            let er = p.jr;
            if (elapsed > 0) {
              const t = Math.min(1, elapsed / ENTRANCE_DURATION_MS);
              const eased = easeOutCubic(t);
              ex = p.dx * (1 - eased);
              ey = p.dy * (1 - eased);
              er = p.jr * (1 - eased);
              if (t < 1) allSettled = false;
            } else {
              allSettled = false;
            }
            el.style.transform = `translate(${ex}px, ${ey}px) rotate(${er}deg)`;
            el.style.opacity = "1";
          });
          entrance.stragglers.forEach((i) => {
            const el = entranceElRefs.current[i];
            const fadeStart = entrance.stragglerFadeStart.get(i);
            if (!el) return;
            if (fadeStart == null) {
              allSettled = false; // still decoding — keep the loop alive
              return;
            }
            const elapsed = now - fadeStart;
            const opacity = elapsed >= PILE_STRAGGLER_FADE_MS ? 1 : elapsed / PILE_STRAGGLER_FADE_MS;
            el.style.opacity = String(opacity);
            if (opacity < 1) allSettled = false;
          });
          // Only stop touching these elements once every non-straggler
          // has finished its own disperse tween AND every straggler has
          // finished its own fade (or there are none) — a straggler can
          // in principle resolve well after dispersal, so this loop
          // outlives a "fixed duration" check by design.
          if (allSettled) entranceRef.current = null;
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
                  copy-0 instances render ALREADY invisible — a plain
                  static `opacity: 0`, present in the very first HTML
                  this component ever produces, server-rendered markup
                  included: there is no client-only effect this waits on,
                  so no frame, ever, can show a copy-0 photo at its final
                  position before the entrance has sorted it into
                  "doesn't participate, reveal now" or "participates,
                  wait for the pile" (see startPileEntrance). Deliberately
                  NOT a computed starting position — the pile position
                  isn't known until it's measured client-side from the
                  real, already-laid-out DOM rect (see that function's own
                  comment for why: a formula evaluated before layout has
                  settled was a real, reload-only bug). copy-1 (always
                  off-screen at arrival) gets neither: it's never
                  animated, so it renders at rest, visible, from the
                  start. Later effects/the rAF loop overwrite both
                  properties imperatively — they never fight this initial
                  render because neither value here is state-derived, so
                  React never re-asserts it on a later, unrelated
                  re-render (e.g. focalIndex changing on scroll). */}
              <div
                ref={(el) => {
                  entranceElRefs.current[copy * layout.length + i] = el;
                }}
                className="landing-photo-entrance"
                style={copy === 0 ? { opacity: 0 } : undefined}
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
                  // Every copy-0 photo needs to actually be fetching from
                  // the start for its own decode (see whenImageReady) to
                  // ever resolve — next/image lazy-loads everything but
                  // the first by default, which would leave anything
                  // off-screen at arrival never even fetching until
                  // scrolled near, deadlocking that wait forever (in
                  // practice, becoming a permanent straggler). Copy-1
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
        renderOrderRef={renderOrderRef}
        onAvailabilityChange={setGlStatus}
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
          Its content is DecipherWordmark, not plain text: on arrival,
          rest decodes into SUQUIA (the only place any random glyph ever
          appears — see that component's own file header for why every
          hover/tap letter-changing mechanism tried here was eventually
          torn out), starting 600ms after the photo entrance begins
          rather than gating it. Hovering no longer changes the
          wordmark's own letters at all; it fades in a separate static
          caption line (the full name, JAVIER SUAREZ SUQUIA) underneath
          it instead. Safe here specifically because it only ever adds
          DESCENDANTS (the decipher's own per-letter columns, the hover
          caption) — nothing between the h1 and the page root gains a
          transform/opacity/filter/etc, which is the only thing that's
          ever actually broken this blend. See that component's own
          note. font-kerning: none
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
          ready={active}
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

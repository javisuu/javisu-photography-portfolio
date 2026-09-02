"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Album, Photo } from "@/data/photos";

// SLIDE_HEIGHT is the one dimension that is NEVER conditional on distance,
// openness, or animation state — every frame in the strip, and every
// image inside it, is exactly this tall, always.
const SLIDE_HEIGHT = 500;
const GAP = 32;
// Every FOLDED slide is exactly this wide — no distance-based compression.
// Uniform width is what lets every slide other than the (at most two)
// actively opening/closing ones behave as one rigid, non-deforming block.
const S = 110;

// Distance from activeIdx -> blur(px) / veil opacity. The only two visual
// properties still driven by React state with a CSS transition — everything
// else (position, width, openness, drift) is written directly to the DOM
// every frame by the physics loop below.
const BLUR_BY_DISTANCE: Record<number, number> = { 1: 6, 2: 12, 3: 18 };
const MAX_BLUR = 18;
const VEIL_ALPHA_BY_DISTANCE: Record<number, number> = { 1: 0.15, 2: 0.22, 3: 0.28 };
const MAX_VEIL_ALPHA = 0.28;
const IMAGE_FILTER_TRANSITION = "filter 300ms ease-out";
const VEIL_TRANSITION = "opacity 300ms ease-out";

const DRIFT_TARGET_PX_AT_MAX_DISTANCE = 14;
const DRIFT_MAX_DISTANCE = 3;

const CLICK_DRAG_TOLERANCE_PX = 5;

// --- Momentum model -------------------------------------------------------
// The fold/unfold is NEVER directly scrubbable by scroll/drag. Scroll and
// drag only ever feed `velocity`; `offsetPx` integrates that velocity every
// frame; crossing STEP_DISTANCE advances the integer `activeIdx`. Openness
// is driven PURELY by which slide is active — see step 4 below. All of
// these are tunable "feel" constants — untested live in this environment,
// expect to retune once you're actually scrolling it.
// STEP_DISTANCE is exactly one closed slot's pitch (S+GAP) — see
// computeFrame's header comment for why that equality is what makes a
// commit exactly continuous, algebraically, not just empirically.
const STEP_DISTANCE = S + GAP;
const FRICTION = 0.92; // per-frame velocity decay (literal per-frame, not time-scaled — matches the spec's "velocity: px/frame")
const WHEEL_SENSITIVITY = 0.045; // px/frame of velocity injected per combined wheel-delta px
const DRAG_SENSITIVITY = 0.7; // px/frame of velocity injected per px of per-frame pointer movement
const KEY_KICK_PX = 18; // arrow keys inject a firm one-shot velocity kick, same physics as a flick
// Rest-position rule: there are exactly two FIXED anchor lines in viewport
// coordinates, X_RIGHT and X_LEFT (computed once from Wavg, the average
// natural cover width across all albums — see averageNaturalWidth and the
// anchorRestOffsetPx computation in the component body). A forward commit
// settles with the open slide's RIGHT edge exactly on X_RIGHT; a backward
// commit settles with its LEFT edge exactly on X_LEFT. These lines do NOT
// depend on which album is active, so the layout at rest is fully
// predictable regardless of width — which is what lets the anchored edge
// stay genuinely static through an entire unfold (see computeFrame):
// restOffsetPx's target is always exactly 0 (see step 5), and
// anchorRestOffsetPx already bakes X_RIGHT/X_LEFT's offset from centre
// into computeFrame, so renderOffsetPx=0 alone reproduces the fixed line.
// The consequence — the open photo's own centre now varies with its own
// width (narrower albums rest right-of-centre, wider ones left-of-centre)
// — is intended, not corrected for. This is the ONLY thing that ever
// recentres the strip — it applies exclusively as part of a commit (step
// 5); below STEP_DISTANCE the strip just follows the raw input 1:1 and
// stays wherever that leaves it, with no rubber-band and no return-to-rest
// of its own.
const OPENNESS_TAU_MS = 450 / 3; // "~450ms to go 0->1" as an exponential time constant — also governs restOffsetPx's ease (see step 5), so layout, width, blur, and veil all resolve on one shared timeline
const MAX_DT_MS = 100; // clamp a single frame's elapsed time (e.g. after a backgrounded tab) so physics never jumps
const OPEN_EPSILON_PX = 0.5; // a slide within this of its resting target width (S if inactive, natural width if active) counts as "settled" — see driftRef in the physics loop

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

function naturalWidthFor(cover: Photo) {
  return Math.round(SLIDE_HEIGHT * (cover.width / cover.height));
}

function widthFor(naturalWidth: number, openness: number) {
  return S + (naturalWidth - S) * openness;
}

// Every folded slide is exactly S wide, so the slot count needed to
// overflow both viewport edges is a closed form, independent of which
// album is open or how far mid-transition it is (openness only ever makes
// a slide NARROWER than this worst case, never wider).
function computeSlotsPerSide(viewportWidth: number) {
  return Math.ceil((viewportWidth + 2 * S) / (S + GAP)) + 2;
}

// Wavg, the average natural cover width across all albums — the sole input
// to the two fixed anchor lines (X_RIGHT/X_LEFT, see the constants block
// above and anchorRestOffsetPx below). Computed once from the albums prop,
// not per-album, so the anchor lines don't move as activeIdx changes.
function averageNaturalWidth(albums: AlbumWithCover[]) {
  const total = albums.reduce((sum, album) => sum + naturalWidthFor(album.cover), 0);
  return total / albums.length;
}

type AlbumWithCover = Omit<Album, "cover"> & { cover: Photo };
type SlideFrame = { width: number; x: number };

// The active slide has ONE edge — the LEADING one, in the direction of
// travel — pinned directly in VIEWPORT (not row-local) coordinates, as a
// function of renderOffsetPx alone (the caller combines the bounded
// physics accumulator with the separately-eased rest bias — see the
// physics loop's step 2/5 for why those are two different numbers).
// Forward pins the RIGHT edge and everything grows/travels to its left;
// backward pins the LEFT edge and everything grows/travels to its right.
// Slides on the anchored side are laid out by walking outward from that
// fixed edge using ONLY their own (uniform, S, whenever they're not the
// active one) widths — never anything belonging to the active slide — so
// their screen position literally cannot depend on how open the active
// slide currently is.
//
// anchorRestOffsetPx is Wavg/2 (see averageNaturalWidth), a constant
// independent of which album is active — so BASE (viewportWidth/2 +/-
// anchorRestOffsetPx) is a genuinely fixed line (X_RIGHT / X_LEFT) that
// never shifts as activeIdx changes. At rest, renderOffsetPx settles to
// exactly 0 (see the physics loop's step 5), so the anchored edge lands
// exactly on that fixed line regardless of the active album's width —
// nothing here ever needs to compensate for width, which is what keeps
// the anchored edge static through an entire unfold.
//
// This is also why a commit that CONTINUES in the same direction is
// exactly continuous, algebraically, not just empirically: right before a
// forward commit, renderOffsetPx is just under STEP_DISTANCE and the
// about-to-become-active slide (already rendered as a plain S-wide
// neighbour) has its own right edge at anchor(activeIdx) + GAP + S. Right
// after, renderOffsetPx drops by STEP_DISTANCE and that same slide becomes
// the new anchor at anchor(activeIdx) + STEP_DISTANCE — and since
// anchor(x) = BASE - renderOffsetPx, dropping it by STEP_DISTANCE raises
// the anchor by exactly STEP_DISTANCE = GAP + S, matching the pre-commit
// value exactly. A commit that REVERSES direction needs an extra one-time
// correction instead, since the anchor edge itself switches sides — see
// the physics loop's reversal handling for that derivation.
function computeFrame(
  activeIdx: number,
  renderOffsetPx: number,
  getOpenness: (absIndex: number) => number,
  lo: number,
  hi: number,
  albums: AlbumWithCover[],
  viewportWidth: number,
  travelDir: number,
  anchorRestOffsetPx: number
): Map<number, SlideFrame> {
  const n = hi - lo + 1;
  const widths = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    const absIndex = lo + k;
    const album = albums[mod(absIndex, albums.length)];
    widths[k] = widthFor(naturalWidthFor(album.cover), getOpenness(absIndex));
  }

  const kActive = activeIdx - lo;
  const activeWidth = widths[kActive];
  let activeLeft: number;
  let activeRight: number;
  if (travelDir > 0) {
    activeRight = viewportWidth / 2 + anchorRestOffsetPx - renderOffsetPx;
    activeLeft = activeRight - activeWidth;
  } else {
    activeLeft = viewportWidth / 2 - anchorRestOffsetPx - renderOffsetPx;
    activeRight = activeLeft + activeWidth;
  }

  const left = new Array<number>(n);
  left[kActive] = activeLeft;
  let cursor = activeRight + GAP;
  for (let k = kActive + 1; k < n; k++) {
    left[k] = cursor;
    cursor += widths[k] + GAP;
  }
  cursor = activeLeft - GAP;
  for (let k = kActive - 1; k >= 0; k--) {
    cursor -= widths[k];
    left[k] = cursor;
    cursor -= GAP;
  }

  const result = new Map<number, SlideFrame>();
  for (let k = 0; k < n; k++) {
    result.set(lo + k, { width: widths[k], x: left[k] });
  }
  return result;
}

function driftPxFor(absIndex: number, activeIdx: number, naturalWidth: number, frameWidth: number) {
  const distance = clamp(absIndex - activeIdx, -DRIFT_MAX_DISTANCE, DRIFT_MAX_DISTANCE);
  const raw = (distance / DRIFT_MAX_DISTANCE) * DRIFT_TARGET_PX_AT_MAX_DISTANCE;
  const maxSafe = Math.max(0, (naturalWidth - frameWidth) / 2);
  return clamp(raw, -maxSafe, maxSafe);
}

// The <img> inside a slide must reveal/hide from the SAME edge the layout
// itself is hinged from (see computeFrame) — otherwise the layout grows
// one way while the image crops the other, which reads as two facing
// curtains. Forward hinges RIGHT (image pinned right:0, reveal/hide on
// the left); backward hinges LEFT (pinned left:0, reveal/hide on the
// right).
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
type ImageAnchor = { left: string; right: string; transform: string };
function imageAnchorFor(travelDir: number, driftPx: number): ImageAnchor {
  return travelDir > 0
    ? { left: "auto", right: "0px", transform: `translateX(${driftPx}px)` }
    : { left: "0px", right: "auto", transform: `translateX(${driftPx}px)` };
}

export default function AlbumsCarousel({ albums }: { albums: AlbumWithCover[] }) {
  const router = useRouter();
  // 1440 is a reasonable first-paint guess, corrected to the real window
  // size in the mount/resize effect below.
  const [viewportWidth, setViewportWidth] = useState(1440);
  // The only pieces of the motion model that live in React state — all
  // change rarely (only at a step commit; blur/veil don't need anything
  // finer). Everything continuous (offsetPx, restOffsetPx, openness,
  // position, width, drift) lives in refs and is written straight to the
  // DOM by the physics loop.
  const [activeIdx, setActiveIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // A snapshot of the render offset (restOffsetPx + offsetPx combined,
  // see the physics loop), refreshed whenever activeIdx changes — exists
  // only so render has a non-ref value for a newly-mounted slide's
  // first-paint position (reading the refs directly during render trips
  // react-hooks/refs; the physics loop corrects any few-ms staleness on
  // the very next frame regardless). Newly-mounted slides are always far
  // from active, so approximating their initial openness as the resting
  // shape (1 if active, else 0) — rather than snapshotting the whole
  // per-slide openness map too — is a safe, low-consequence shortcut.
  const [renderOffsetSnapshot, setRenderOffsetSnapshot] = useState(0);
  // Mirrors travelDirRef for the same reason — render needs a non-ref
  // value to pick the active slide's anchor edge (both layout and image,
  // see computeFrame and imageAnchorFor) for first paint. Commit-locked
  // (see travelDirRef below), not tied to the live velocity's sign.
  const [directionSnapshot, setDirectionSnapshot] = useState(1);
  // Whether the pointer is over the currently-active (fully open) slide —
  // the only slide that's ever a navigation target. Drives the info
  // block's title-shift/rule hover cue below; reset on every commit since
  // the active slide's own DOM node can be swapped out from under a
  // still-hovering pointer (no mouseleave fires for an element that gets
  // removed rather than actually left).
  const [isActiveHovered, setIsActiveHovered] = useState(false);

  // Half of Wavg — the fixed offset from true viewport centre where the
  // active slide's anchored edge sits at rest (X_RIGHT = centre +
  // anchorRestOffsetPx, X_LEFT = centre - anchorRestOffsetPx). Independent
  // of activeIdx, so it's just a plain per-render value, not a ref.
  const anchorRestOffsetPx = averageNaturalWidth(albums) / 2;

  const offsetPxRef = useRef(0);
  // The strip's rest bias: eases toward exactly 0 every frame (step 5) —
  // NOT toward a per-album, width-dependent value — so the anchored edge
  // (see computeFrame) lands on the fixed X_RIGHT/X_LEFT line regardless of
  // which album is active, and stays there for the whole unfold rather
  // than sliding to compensate for width. Kept entirely separate from
  // offsetPx (which stays a small, bounded, physics-driven accumulator
  // dedicated to detecting the next commit) specifically so this can jump
  // by whatever is needed at a direction-reversal commit (see the while
  // loop) without disturbing that accumulator's own bounded range.
  const restOffsetPxRef = useRef(0);
  const velocityRef = useRef(0);
  const activeIdxRef = useRef(activeIdx);
  // Which edge is currently hinged — updated ONLY at an actual commit
  // (inside the while loop below), never from the live sign of velocity.
  // Locking it to commits (not to momentary scroll direction) is what
  // keeps a small back-and-forth wobble that never crosses STEP_DISTANCE
  // from flipping the anchor formula mid-frame, which would otherwise
  // desync it from restOffsetPx's own (commit-triggered) updates.
  const travelDirRef = useRef(1);
  const lastFrameTimeRef = useRef<number | null>(null);
  const pendingWheelInputRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragCurrentXRef = useRef(0);
  const dragLastXRef = useRef(0);
  const dragDistanceRef = useRef(0);
  // The href to navigate to if this press turns out to be a tap rather
  // than a drag — captured at pointerdown from whatever was under the
  // finger/cursor (null unless that was the active slide's overlay link).
  // Navigation is fired imperatively from onPointerUp rather than relying
  // on the anchor's native click: the wrapping div below calls
  // setPointerCapture on pointerdown for the drag gesture, and per the
  // Pointer Events spec a captured element's subsequent click retargets
  // to the CAPTURING element, not whatever was actually under the
  // pointer — so the anchor's own onClick never fires once capture is in
  // effect. Verified directly (a raw document-level click listener showed
  // the click's target was the wrapping div, not the anchor, even though
  // elementFromPoint confirmed the anchor was visually right there).
  const pendingNavHrefRef = useRef<string | null>(null);
  const viewportWidthRef = useRef(viewportWidth);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRefs = useRef(new Map<number, HTMLDivElement>());
  const imageRefs = useRef(new Map<number, HTMLImageElement>());
  // Per-slide openness is genuine state (not a formula), so it has to
  // persist across frames keyed by absolute index — pruned to the visible
  // window (+ a small margin) each frame so it can't grow unbounded over
  // a long session.
  const opennessRef = useRef(new Map<number, number>());
  // Per-slide FROZEN image anchor direction (+1 pins right, -1 pins left)
  // — set exactly once, either when a slide first becomes visible (takes
  // whatever the current travelDir is at mount) or when it starts a fold
  // or unfold (the commit that flips its openness target, see step 3),
  // and never touched again outside those two moments. This is what stops
  // a settled sliver's crop from jumping when it finishes folding or when
  // some later, unrelated commit changes the global travel direction.
  const imageAnchorDirRef = useRef(new Map<number, number>());
  // Per-slide FROZEN drift value. Recomputed live every frame while the
  // slide's width hasn't yet reached its resting target (still actively
  // folding/unfolding), then left untouched once it has — so a resting
  // sliver's drift can't keep drifting just because activeIdx (and hence
  // its distance-from-active) keeps changing after it already settled.
  const driftRef = useRef(new Map<number, number>());
  // The absolute index open on mount — the ONLY slide ever marked
  // priority (a lazy-initialized state, since reading a ref's `.current`
  // during render is disallowed).
  const [initialActiveIndex] = useState(0);

  const slotsPerSide = computeSlotsPerSide(viewportWidth);
  const lo = activeIdx - slotsPerSide;
  const hi = activeIdx + slotsPerSide;
  const initialFrame = computeFrame(
    activeIdx,
    renderOffsetSnapshot,
    (absIndex) => (absIndex === activeIdx ? 1 : 0),
    lo,
    hi,
    albums,
    viewportWidth,
    directionSnapshot,
    anchorRestOffsetPx
  );
  const activeAlbum = albums[mod(activeIdx, albums.length)];

  // Mount + resize: just refresh the viewport width. computeFrame is a
  // pure function of (activeIdx, renderOffsetPx, openness, viewportWidth,
  // travelDir), so a resize simply recomputes correctly on the very next
  // frame — no persisted position to reconcile.
  useEffect(() => {
    function recalc() {
      const vw = window.innerWidth;
      viewportWidthRef.current = vw;
      setViewportWidth(vw);
    }
    recalc();
    window.addEventListener("resize", recalc);
    return () => window.removeEventListener("resize", recalc);
  }, []);

  // The single rAF loop that owns all motion. Per frame: integrate
  // velocity into offsetPx (or ease it toward 0 once velocity is low and
  // nothing is being dragged); advance activeIdx whenever offsetPx crosses
  // STEP_DISTANCE (chaining multiple steps in one frame at high speed, no
  // queueing needed), applying a one-time continuity-preserving jump to
  // restOffsetPx if that commit reverses direction; let every visible
  // slide's openness lerp toward whether it's currently active, on its
  // own clock; ease restOffsetPx toward its absolute target on that SAME
  // clock; write width/transform/drift straight to DOM refs. Only
  // activeIdx changes go through setState — a frame otherwise only ever
  // touches the DOM nodes that actually moved or resized.
  useEffect(() => {
    let rafId: number;

    function tick(now: number) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(now - (lastFrameTimeRef.current ?? now), MAX_DT_MS);
      lastFrameTimeRef.current = now;

      // 1. velocity += input; velocity *= friction — per spec, a literal
      // per-frame update, not scaled by dt (matches "velocity: px/frame").
      let input = pendingWheelInputRef.current;
      pendingWheelInputRef.current = 0;
      if (isDraggingRef.current) {
        const dx = dragCurrentXRef.current - dragLastXRef.current;
        // Dragging left advances forward (matches the wheel/keyboard sign
        // convention: negative screen movement = "go to next album").
        input += -dx * DRAG_SENSITIVITY;
        dragLastXRef.current = dragCurrentXRef.current;
      }
      velocityRef.current += input;
      velocityRef.current *= FRICTION;

      // 2. offsetPx integrates velocity 1:1, every frame, unconditionally —
      // no rubber-band resistance near any cap, and no easing back toward
      // 0 or anywhere else. Below STEP_DISTANCE the strip just follows
      // wherever the accumulated input left it; once velocity decays to
      // ~0 (via friction, step 1), offsetPx simply stops changing and
      // stays put — nothing pulls it back on its own. It moves again only
      // from more scroll/drag input or a commit (step 3), and the strip
      // only ever recentres as part of a commit (step 5's restOffsetPx
      // ease toward the absolute target) — never while the user is idle.
      offsetPxRef.current += velocityRef.current;

      // 3. Crossing STEP_DISTANCE advances activeIdx — a while loop, so a
      // single fast frame can chain through several albums at once with
      // no separate queueing logic. A commit that keeps travelDir the
      // same needs no correction (see computeFrame's header comment for
      // why). A commit that REVERSES travelDir switches which edge is the
      // anchor, so restOffsetPx needs a one-time jump to stay continuous:
      // solving centre(oldTravelDir, before) = centre(newTravelDir, after)
      // for the outgoing slide's actual current width gives
      // restOffsetPx += dir * (S - outgoingWidth) — verified directly
      // (byte-identical before/after on the non-anchored side, forward,
      // backward, and reversed) rather than tuned.
      const prevActiveIdx = activeIdxRef.current;
      while (Math.abs(offsetPxRef.current) >= STEP_DISTANCE) {
        const dir = Math.sign(offsetPxRef.current);
        if (dir !== travelDirRef.current) {
          const outgoingIdx = activeIdxRef.current;
          const outgoingWidth = widthFor(
            naturalWidthFor(albums[mod(outgoingIdx, albums.length)].cover),
            opennessRef.current.get(outgoingIdx) ?? 0
          );
          restOffsetPxRef.current += dir * (S - outgoingWidth);
          travelDirRef.current = dir;
        }
        activeIdxRef.current += dir;
        offsetPxRef.current -= dir * STEP_DISTANCE;
      }
      if (activeIdxRef.current !== prevActiveIdx) {
        setActiveIdx(activeIdxRef.current);
        setDirectionSnapshot(travelDirRef.current);
        setIsActiveHovered(false);
        // Both slides in this step's pair start a fresh fold/unfold right
        // now — the only moment either is allowed to change its frozen
        // image anchor (see imageAnchorDirRef and imageAnchorFor above).
        imageAnchorDirRef.current.set(prevActiveIdx, travelDirRef.current);
        imageAnchorDirRef.current.set(activeIdxRef.current, travelDirRef.current);
      }

      // 4. Openness is PURELY positional: it depends on nothing but
      // "is this absIndex currently the active one," never on velocity or
      // on where offsetPx sits within the current step. The active slide
      // always targets 1 and unfolds toward fully open over its own
      // ~450ms clock; every other slide always targets 0. A commit
      // instantly swaps which slide is targeting 1, interrupting and
      // re-targeting whatever fold/unfold was in progress — at speed,
      // commits chain faster than 450ms apart, so nothing ever finishes
      // opening before the next commit retargets it. That interrupted
      // look is the deliberate "attempted unfold, overtaken by the next"
      // feel, not a special case.
      const vw = viewportWidthRef.current;
      const sps = computeSlotsPerSide(vw);
      const frameLo = activeIdxRef.current - sps;
      const frameHi = activeIdxRef.current + sps;
      const opennessFactor = 1 - Math.exp(-dt / OPENNESS_TAU_MS);
      for (let absIndex = frameLo; absIndex <= frameHi; absIndex++) {
        const target = absIndex === activeIdxRef.current ? 1 : 0;
        const current = opennessRef.current.get(absIndex) ?? 0;
        opennessRef.current.set(absIndex, current + (target - current) * opennessFactor);
        // A slide that has never been visible before (and so was never
        // caught by the commit-time assignment above) takes the current
        // direction the moment it mounts, then keeps it — same freeze
        // rule, just seeded here instead of at a commit.
        if (!imageAnchorDirRef.current.has(absIndex)) {
          imageAnchorDirRef.current.set(absIndex, travelDirRef.current);
        }
      }
      // Prune openness/anchor/drift state for slides that left the window
      // — keeps these maps bounded over an arbitrarily long session.
      for (const key of opennessRef.current.keys()) {
        if (key < frameLo - 2 || key > frameHi + 2) opennessRef.current.delete(key);
      }
      for (const key of imageAnchorDirRef.current.keys()) {
        if (key < frameLo - 2 || key > frameHi + 2) imageAnchorDirRef.current.delete(key);
      }
      for (const key of driftRef.current.keys()) {
        if (key < frameLo - 2 || key > frameHi + 2) driftRef.current.delete(key);
      }

      // 5. restOffsetPx eases toward exactly 0 on the SAME clock as
      // openness — one shared timeline, so position, width, blur, and
      // veil all resolve together. The target is a true constant now (not
      // derived from the active album's width, unlike the old centring
      // rule) — see the fixed X_RIGHT/X_LEFT anchor-line comment on
      // computeFrame. A commit that continues the same travelDir never
      // touches restOffsetPx at all (step 3), so once it has settled to 0
      // it STAYS at 0 through every subsequent same-direction commit — the
      // anchored edge is then already exactly on its fixed line the
      // instant the commit fires, with nothing left to ease.
      restOffsetPxRef.current += (0 - restOffsetPxRef.current) * opennessFactor;

      // 6. Compute this frame's geometry and write it straight to the DOM.
      const travelDir = travelDirRef.current;
      const renderOffsetPx = restOffsetPxRef.current + offsetPxRef.current;
      const frame = computeFrame(
        activeIdxRef.current,
        renderOffsetPx,
        (absIndex) => opennessRef.current.get(absIndex) ?? 0,
        frameLo,
        frameHi,
        albums,
        vw,
        travelDir,
        anchorRestOffsetPx
      );
      frame.forEach(({ width, x }, absIndex) => {
        const frameEl = frameRefs.current.get(absIndex);
        if (frameEl) {
          frameEl.style.width = `${width}px`;
          frameEl.style.transform = `translateX(${x}px)`;
        }
        const imageEl = imageRefs.current.get(absIndex);
        if (imageEl) {
          const naturalWidth = naturalWidthFor(albums[mod(absIndex, albums.length)].cover);
          // Drift stays live only while this slide's width hasn't yet
          // reached its resting target (still actively folding/
          // unfolding); once it has, the last computed value is left
          // untouched — otherwise a resting sliver would keep drifting
          // just because activeIdx (and so its distance-from-active) kept
          // changing long after this slide itself stopped animating.
          const targetWidth = absIndex === activeIdxRef.current ? naturalWidth : S;
          const settled = Math.abs(width - targetWidth) <= OPEN_EPSILON_PX;
          if (!settled || !driftRef.current.has(absIndex)) {
            driftRef.current.set(absIndex, driftPxFor(absIndex, activeIdxRef.current, naturalWidth, width));
          }
          const anchorDir = imageAnchorDirRef.current.get(absIndex) ?? travelDir;
          const anchor = imageAnchorFor(anchorDir, driftRef.current.get(absIndex)!);
          imageEl.style.left = anchor.left;
          imageEl.style.right = anchor.right;
          imageEl.style.transform = anchor.transform;
        }
      });
      if (activeIdxRef.current !== prevActiveIdx) {
        setRenderOffsetSnapshot(renderOffsetPx);
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [albums]);

  // Keyboard: arrow keys inject the same one-shot velocity kick a firm
  // flick would, reusing the exact same momentum/step/settle physics.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") pendingWheelInputRef.current += KEY_KICK_PX;
      else if (e.key === "ArrowLeft") pendingWheelInputRef.current -= KEY_KICK_PX;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // React's onWheel is a synthetic handler backed by a passive native
  // listener in modern browsers, so e.preventDefault() there is silently
  // ignored — a real { passive: false } listener is required to actually
  // suppress native scroll.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      // Both axes contribute — a vertical trackpad swipe drives the
      // horizontal carousel just as much as a horizontal one. Feeds
      // velocity, never offsetPx directly — the fold/unfold must never be
      // scrubbable by scroll position, only by how much motion it built up.
      pendingWheelInputRef.current += (e.deltaX + e.deltaY) * WHEEL_SENSITIVITY;
    }

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    dragStartXRef.current = e.clientX;
    dragCurrentXRef.current = e.clientX;
    dragLastXRef.current = e.clientX;
    dragDistanceRef.current = 0;
    isDraggingRef.current = true;
    setIsDragging(true);
    // Captured only for whatever this press turns out to be: a drag
    // (see onPointerMove) or, if it stays under the tolerance, a tap on
    // the active slide's overlay link (see pendingNavHrefRef above).
    pendingNavHrefRef.current = (e.target as HTMLElement).closest("a")?.getAttribute("href") ?? null;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!isDraggingRef.current) return;
    dragCurrentXRef.current = e.clientX;
    dragDistanceRef.current = Math.abs(e.clientX - dragStartXRef.current);
  }

  function onPointerUp() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    // velocityRef.current already holds the last frame's drag-derived
    // value — releasing naturally continues that as momentum, no separate
    // "fling" calculation needed.
    if (pendingNavHrefRef.current && dragDistanceRef.current <= CLICK_DRAG_TOLERANCE_PX) {
      router.push(pendingNavHrefRef.current);
    }
    pendingNavHrefRef.current = null;
  }

  // The anchor's own click never actually fires a real navigation here —
  // see pendingNavHrefRef's comment — so this only exists to stop the
  // browser's default (a full page navigation) from racing the
  // client-side router.push already issued in onPointerUp.
  function onSlotClick(e: React.MouseEvent) {
    if (e.button === 0) e.preventDefault();
  }

  const slideIndices = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col items-center justify-center gap-[15px] overflow-hidden pt-[74px]"
    >
      <div
        style={{ position: "relative", width: "100%", height: SLIDE_HEIGHT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {slideIndices.map((absIndex) => {
          const album = albums[mod(absIndex, albums.length)];
          const naturalWidth = naturalWidthFor(album.cover);
          const init = initialFrame.get(absIndex)!;
          const distance = Math.abs(absIndex - activeIdx);
          const isActive = distance === 0;
          const blur = isActive ? 0 : BLUR_BY_DISTANCE[distance] ?? MAX_BLUR;
          const veilAlpha = isActive ? 0 : VEIL_ALPHA_BY_DISTANCE[distance] ?? MAX_VEIL_ALPHA;
          const initDrift = driftPxFor(absIndex, activeIdx, naturalWidth, init.width);

          return (
            <div
              key={absIndex}
              ref={(el) => {
                if (el) frameRefs.current.set(absIndex, el);
                else frameRefs.current.delete(absIndex);
              }}
              className="absolute isolate block select-none overflow-hidden"
              style={{
                top: 0,
                left: 0,
                width: init.width,
                height: SLIDE_HEIGHT,
                maxWidth: "none",
                transform: `translateX(${init.x}px)`,
                cursor: isActive ? "pointer" : isDragging ? "grabbing" : "grab",
                touchAction: "pan-y",
              }}
            >
              {/* The frame is purely a clipping window: its WIDTH is the
                  only thing that ever animates its own size, revealing
                  more or less of the image below as its openness rises or
                  falls — a curtain opening, not a zoom. The image itself
                  never changes size (no scale/zoom transform anywhere in
                  this file). Width, position, and drift are written
                  directly by the physics loop every frame — no CSS
                  transition on any of them, it would only fight the
                  loop's own writes. */}
              <Image
                ref={(el) => {
                  if (el) imageRefs.current.set(absIndex, el);
                  else imageRefs.current.delete(absIndex);
                }}
                src={album.cover.src}
                alt={album.title}
                width={album.cover.width}
                height={album.cover.height}
                style={{
                  position: "absolute",
                  top: 0,
                  width: naturalWidth,
                  height: SLIDE_HEIGHT,
                  maxWidth: "none",
                  objectFit: "cover",
                  filter: blur ? `blur(${blur}px)` : "none",
                  transition: IMAGE_FILTER_TRANSITION,
                  ...imageAnchorFor(directionSnapshot, initDrift),
                }}
                sizes={`${naturalWidth}px`}
                draggable={false}
                priority={absIndex === initialActiveIndex}
              />
              {/* Dark veil — a separate overlay, not opacity on the image
                  (which would wash it toward white instead of dimming it
                  toward black). */}
              <div
                className="pointer-events-none absolute inset-0 bg-black"
                style={{ opacity: veilAlpha, transition: VEIL_TRANSITION }}
              />
              {/* Navigation target: only the active, fully-open slide is
                  ever a link — a folded sliver has no anchor at all, so
                  clicking one does nothing (dragging it still works, via
                  the pointer handlers on the strip's outer container,
                  which this overlay doesn't intercept since it never
                  calls stopPropagation). Placed last so it sits above the
                  image/veil without needing an explicit z-index. */}
              {isActive && (
                <Link
                  href={`/album/${album.slug}`}
                  onClick={onSlotClick}
                  onMouseEnter={() => setIsActiveHovered(true)}
                  onMouseLeave={() => setIsActiveHovered(false)}
                  className="absolute inset-0 block select-none"
                  draggable={false}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="w-full max-w-4xl px-8 text-[#666]">
        {/* The only hover cue anywhere on this page: hovering the open
            (navigable) slide nudges the title right and grows a thin
            rule under it — never the photo itself, which never
            transforms. See .album-title/.album-rule in globals.css for
            the prefers-reduced-motion override (rule still appears
            instantly; the title never moves). */}
        <p
          className="album-title font-serif text-[30px] text-[#111]"
          style={{ "--album-title-shift": isActiveHovered ? "4px" : "0px" } as React.CSSProperties}
        >
          {activeAlbum.title}
        </p>
        <span
          className="album-rule mt-2 block h-px bg-[#666]"
          style={{ "--album-rule-width": isActiveHovered ? "40px" : "0px" } as React.CSSProperties}
        />
        <p className="text-[13px] uppercase tracking-[0.16em]">
          {activeAlbum.location} — {activeAlbum.year}
        </p>
      </div>

      {/* Fixed near the bottom edge (independent of the info block's own
          height) — z-20 keeps it above the slides, matching the landing
          page's chrome convention. */}
      <div
        className="pointer-events-none fixed inset-x-0 z-20 flex justify-end px-6 text-[14px] tabular-nums text-[#666] md:px-10"
        style={{ bottom: 60 }}
      >
        <div className="flex items-center gap-3">
          <span>{String(mod(activeIdx, albums.length) + 1).padStart(2, "0")}</span>
          <span className="h-px w-16 bg-[#CCC]" />
          <span>{String(albums.length).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
}

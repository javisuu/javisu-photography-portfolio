"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useEffect, useRef, useState } from "react";
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

// Depth (spec 011, decision 3): a folded slide is covered by a black panel
// with film grain (public/textures/grano.png, from scripts/
// generate-grain.mjs), whose opacity follows that slide's own openness:
// PANEL_OPACITY * (1 - openness). It replaced a distance-based blur() and
// grey veil, both CSS transitions on React state: a blur filter is
// expensive to animate, and opacity is compositing only. Written by the
// physics loop like everything else continuous.
// 90%, not fully opaque: Javi compared both on his own screen (spec 011,
// T11) — a trace of the photo shows through each sliver.
const PANEL_OPACITY = 0.9;
const GRAIN_TEXTURE = "/textures/grano.png";

const DRIFT_TARGET_PX_AT_MAX_DISTANCE = 14;
const DRIFT_MAX_DISTANCE = 3;

const CLICK_DRAG_TOLERANCE_PX = 5;

// --- Momentum model -------------------------------------------------------
// The fold/unfold is NEVER directly scrubbable by scroll/drag. Scroll and
// drag only ever feed `velocity`; `offsetPx` integrates that velocity every
// frame; crossing half of STEP_DISTANCE, either way, advances the integer
// `activeIdx` (spec 012, amendment 1). Openness is driven PURELY by which
// slide is active — see step 4 below. All of
// these are tunable "feel" constants — untested live in this environment,
// expect to retune once you're actually scrolling it.
// STEP_DISTANCE is exactly one closed slot's pitch (S+GAP) — see
// computeFrame's header comment for why that makes a commit move nothing.
const STEP_DISTANCE = S + GAP;
// Velocity is in px per REFERENCE frame (1/60 s), and friction/integration
// are scaled by how many reference frames actually elapsed (spec 011): at
// 60 Hz the numbers are exactly the per-frame ones these constants were
// tuned with, and at 30 or 120 Hz the same gesture covers the same distance
// in the same time instead of running at half or double speed.
const REFERENCE_FRAME_MS = 1000 / 60;
const FRICTION = 0.92; // velocity decay per reference frame
const WHEEL_SENSITIVITY = 0.045; // px/frame of velocity injected per combined wheel-delta px
const DRAG_SENSITIVITY = 0.7; // px/frame of velocity injected per px of pointer movement since the last frame
const KEY_KICK_PX = 18; // arrow keys inject a firm one-shot velocity kick, same physics as a flick
// Rest position (spec 012, amendment 1, like cynx.io): the open slide rests
// CENTRED on the viewport, whatever its width and whichever way the strip
// came. The strip may drift up to half a step either side of that before
// the next album takes over (step 3) — the flexible edge, the same in both
// directions. Nothing pulls the strip back after a slow scroll; only a fast
// one snaps (see SNAP_SETTLE_PX).
// Openness moves on a critically damped spring (spec 011),
// not an exponential ease: an exponential starts at full speed — the fold
// opened with a 58 px leap in its first frame — while a spring starts from
// rest, and a target that changes mid-way (a reversal) keeps the current
// velocity instead of snapping. At 18.6 rad/s a full 0 -> 1 lands within
// 0.5 px of the widest cover in ~500 ms, close to the old "~450ms". The
// grain panel follows openness, so width and panel resolve together.
const SPRING_OMEGA = 18.6; // rad/s
// The trail (spec 011, amendment 1, from Javi's frames of cynx.io): while
// the strip moves, the slides it has just passed don't fold all the way —
// they stay part-open behind the active one, wider the faster the strip
// and the closer to it, and fold back to S as it slows. The opening slide
// then makes room by narrowing a trail that is already moving, instead of
// shoving fully folded slivers aside. Only the side already passed (the
// non-anchored side, see computeFrame); the side ahead never changes. Each
// trailing slide k (1 = right behind the active one) targets an extra
// width of TRAIL_MAX_PX * speed * TRAIL_DECAY^(k-1), speed being
// |velocity| / TRAIL_FULL_SPEED clamped to 1. At rest speed is 0 and every
// slide folds to S, so the rest layout is unchanged.
const TRAIL_MAX_PX = 180;
const TRAIL_DECAY = 0.6;
const TRAIL_FULL_SPEED = 30; // px per reference frame
// How far the active slide opens fades with speed (spec 012, amendment 1):
// fully below SLOW_SPEED, FAST_OPENNESS at FAST_OPENNESS_SPEED or more,
// linear between — no threshold, so nothing pops open. With commits in
// quick succession each spring heads for its target and the next commit
// turns it back: the fold-and-unfold "battle", plus the trail. In px per
// reference frame, like velocity, so it holds at any frame rate.
const FAST_OPENNESS = 0.2;
const FAST_OPENNESS_SPEED = 30;
// A fast scroll (above OPEN_SPEED) arms the snap, which fires once the
// strip drops below SLOW_SPEED (see SNAP_SETTLE_PX). The gap keeps a
// trackpad hovering around 20 from re-arming it every few frames.
const OPEN_SPEED = 20;
const SLOW_SPEED = OPEN_SPEED * 0.8;
// Snap after a fast scroll (spec 012, decision 3): when a fast strip drops
// below SLOW_SPEED, offsetPx leaves friction and springs (SPRING_OMEGA) to
// the nearer of the active album and the next one in travelDir — never the
// previous one — starting from the strip's current velocity, and lands
// exactly on 0, the anchored edge on its fixed line. Without a fast scroll
// there's no snap: the strip still stays wherever it's left.
const SNAP_SETTLE_PX = 0.01;
// A trackpad keeps sending smaller and smaller wheel events in the same
// direction after the gesture (its momentum tail), and they must not pull
// the strip off its line. So while snapping, input feeds a "free" velocity
// instead — what the strip would do without the snap, seeded with its
// velocity when the snap began. A tail only slows its decay; a new gesture
// (or a key) makes it rise. Rising more than SNAP_RESUME_PX above its
// lowest point, input against travelDir, or a drag ends the snap. Once
// landed, the snap holds until the free velocity drops below
// SNAP_RELEASE_PX, the tail spent.
const SNAP_RESUME_PX = 2; // px per reference frame
const SNAP_RELEASE_PX = 0.5; // px per reference frame
const MAX_DT_MS = 100; // clamp a single frame's elapsed time (e.g. after a backgrounded tab) so physics never jumps
const OPEN_EPSILON_PX = 0.5; // a slide within this of its resting target width (S if inactive, natural width if active) counts as "settled" — see driftRef in the physics loop

// How far one physics step of `frames` reference frames moves, per px/frame
// of (already decayed) velocity. Plain `frames` (Euler) makes a flick's total
// travel depend on the frame rate — measured 8–18 px off at 30 and 120 fps
// on a single arrow key (spec 011, T3). This factor makes the series sum to
// exactly what one-frame steps give, v*F/(1-F), whatever the step length,
// and is exactly 1 at 60 Hz.
function stepDistanceFactor(frames: number) {
  if (frames <= 0) return 0;
  return (FRICTION ** (1 - frames) * (1 - FRICTION ** frames)) / (1 - FRICTION);
}

// Exact step of a critically damped spring toward `target` over `dtMs`,
// so it's the same curve at any frame rate. Returns [position, velocity],
// velocity in units per second.
function springStep(position: number, velocity: number, target: number, dtMs: number): [number, number] {
  const t = dtMs / 1000;
  const error = position - target;
  const decay = Math.exp(-SPRING_OMEGA * t);
  const c = velocity + SPRING_OMEGA * error;
  return [target + (error + c * t) * decay, (velocity - SPRING_OMEGA * c * t) * decay];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

function naturalWidthFor(cover: Photo) {
  return Math.round(SLIDE_HEIGHT * (cover.width / cover.height));
}

// Every folded slide is exactly S wide, so the slot count needed to
// overflow both viewport edges is a closed form, independent of which
// album is open or how far mid-transition it is (openness only ever makes
// a slide NARROWER than this worst case, never wider).
function computeSlotsPerSide(viewportWidth: number) {
  return Math.ceil((viewportWidth + 2 * S) / (S + GAP)) + 2;
}

type AlbumWithCover = Omit<Album, "cover"> & { cover: Photo };
type SlideFrame = { width: number; x: number };

// Every slide's centre is a function of the strip position and of how open
// each slide is — never of the direction of travel, nor of which slide is
// active (spec 012, amendment 1). In row coordinates (the row carries
// -offsetPx, see rowRef), slide i sits at
//
//   centre_i = viewportWidth/2 + (i - activeIdx) * STEP_DISTANCE
//              + (sum of extra widths left of i - sum right of i) / 2
//
// extra width being width - S. Each slide that opens pushes the ones on its
// left half its extra width to the left, and the ones on its right half to
// the right, so every gap stays GAP. With one slide open and offsetPx 0,
// that slide is centred and the rest sit at a fixed pitch either side.
//
// Hence a commit moves nothing: activeIdx goes up by one and offsetPx
// down by STEP_DISTANCE, which cancel in screen position. And a reversal
// needs no correction (the jump spec 011 kept), since the same strip
// position with the same openness gives the same frame either way. When
// the pair swapping have different natural widths, the slides outside it
// slide by half the difference each way, following the springs — never at
// once.
//
// `openness` holds every slide that isn't fully folded, inside or outside
// [lo, hi] — one outside still pushes the rest — and lo..hi are the slides
// to lay out.
function computeFrame(
  activeIdx: number,
  openness: Map<number, number>,
  lo: number,
  hi: number,
  albums: AlbumWithCover[],
  viewportWidth: number
): Map<number, SlideFrame> {
  const extraOf = (absIndex: number) =>
    (naturalWidthFor(albums[mod(absIndex, albums.length)].cover) - S) * (openness.get(absIndex) ?? 0);
  let extraLeft = 0;
  let extraRight = 0;
  for (const [absIndex] of openness) {
    if (absIndex < lo) extraLeft += extraOf(absIndex);
    else if (absIndex > hi) extraRight += extraOf(absIndex);
  }
  const extras = new Array<number>(hi - lo + 1);
  for (let k = 0; k < extras.length; k++) {
    extras[k] = extraOf(lo + k);
    extraRight += extras[k];
  }

  const result = new Map<number, SlideFrame>();
  for (let k = 0; k < extras.length; k++) {
    // Running sums: left of this slide, and right of it.
    extraRight -= extras[k];
    const centre = viewportWidth / 2 + (lo + k - activeIdx) * STEP_DISTANCE + (extraLeft - extraRight) / 2;
    const width = S + extras[k];
    result.set(lo + k, { width, x: centre - width / 2 });
    extraLeft += extras[k];
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
// curtains. Forward hinges RIGHT (image pinned to the frame's right edge,
// reveal/hide on the left); backward hinges LEFT (pinned left, reveal/hide
// on the right).
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
function frameTransformFor(x: number, width: number, naturalWidth: number) {
  return `translateX(${x}px) scaleX(${width / naturalWidth})`;
}
function counterScaleFor(width: number, naturalWidth: number) {
  return `scaleX(${naturalWidth / width})`;
}
function pinnedOriginFor(travelDir: number) {
  return travelDir > 0 ? "100% 0" : "0 0";
}
function driftTransformFor(driftPx: number) {
  return `translateX(${driftPx}px)`;
}

type WrittenStyle = Partial<Record<"transform" | "counterScale" | "pinnedOrigin" | "drift" | "panel", string>>;

// Writes one inline style property only if it differs from what the
// physics loop last wrote there (spec 011): a slide that isn't moving costs
// nothing per frame.
function writeIfChanged(
  el: HTMLElement,
  property: "transform" | "transformOrigin" | "opacity",
  value: string,
  written: WrittenStyle,
  key: keyof WrittenStyle = property as keyof WrittenStyle
) {
  if (written[key] === value) return;
  el.style[property] = value;
  written[key] = value;
}

// The anchor's own click never actually fires a real navigation here —
// see pendingNavHrefRef's comment — so this only exists to stop the
// browser's default (a full page navigation) from racing the client-side
// router.push already issued in onPointerUp.
function onSlotClick(e: React.MouseEvent) {
  if (e.button === 0) e.preventDefault();
}

type SlideProps = {
  absIndex: number;
  album: AlbumWithCover;
  isActive: boolean;
  priority: boolean;
  // First-paint geometry only, read once at mount: from then on the
  // physics loop owns width, position, image anchor and drift. Left out of
  // the memo comparison (see sameSlide), so a commit that shifts every
  // slide's row position doesn't re-render them all.
  // `onScreen`: inside the viewport when it mounted, so its cover loads
  // eagerly (spec 011) — at arrival, every cover you can see, not only the
  // open one; slides mounted later at the strip's edges stay lazy.
  initial: { width: number; x: number; dir: number; drift: number; onScreen: boolean };
  frameRefs: React.RefObject<Map<number, HTMLDivElement>>;
  counterRefs: React.RefObject<Map<number, HTMLDivElement>>;
  imageRefs: React.RefObject<Map<number, HTMLImageElement>>;
  panelRefs: React.RefObject<Map<number, HTMLDivElement>>;
  writtenRef: React.RefObject<Map<number, WrittenStyle>>;
  onActiveHover: (hovered: boolean) => void;
};

function sameSlide(a: SlideProps, b: SlideProps) {
  return (
    a.absIndex === b.absIndex &&
    a.album === b.album &&
    a.isActive === b.isActive &&
    a.priority === b.priority &&
    a.onActiveHover === b.onActiveHover
  );
}

// One slide of the strip. Memoized (spec 011): a commit re-renders only the
// slides whose props actually change, not the ~30 in the window.
const Slide = memo(function Slide({
  absIndex,
  album,
  isActive,
  priority,
  initial: initialProp,
  frameRefs,
  counterRefs,
  imageRefs,
  panelRefs,
  writtenRef,
  onActiveHover,
}: SlideProps) {
  const [initial] = useState(initialProp);
  const naturalWidth = naturalWidthFor(album.cover);
  return (
    <div
      ref={(el) => {
        // A (re)mounted node starts with nothing written by the loop.
        writtenRef.current.delete(absIndex);
        if (el) frameRefs.current.set(absIndex, el);
        else frameRefs.current.delete(absIndex);
      }}
      data-carousel-slide=""
      className="absolute isolate block select-none overflow-hidden"
      style={{
        top: 0,
        left: 0,
        width: naturalWidth,
        height: SLIDE_HEIGHT,
        maxWidth: "none",
        transformOrigin: "0 0",
        transform: frameTransformFor(initial.x, initial.width, naturalWidth),
      }}
    >
      {/* The frame is purely a clipping window: its VISIBLE width is
          the only thing that ever animates its own size, revealing
          more or less of the image below as its openness rises or
          falls — a curtain opening, not a zoom. The image itself
          never changes size on screen: the frame's scaleX and the
          counter-scale below cancel exactly (see frameTransformFor).
          Position, scale, and drift are written directly by the
          physics loop every frame — no CSS transition on any of
          them, it would only fight the loop's own writes. */}
      <div
        ref={(el) => {
          if (el) counterRefs.current.set(absIndex, el);
          else counterRefs.current.delete(absIndex);
        }}
        className="absolute inset-0"
        style={{
          transformOrigin: pinnedOriginFor(initial.dir),
          transform: counterScaleFor(initial.width, naturalWidth),
        }}
      >
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
            left: 0,
            width: naturalWidth,
            height: SLIDE_HEIGHT,
            maxWidth: "none",
            objectFit: "cover",
            transform: driftTransformFor(initial.drift),
          }}
          sizes={`${naturalWidth}px`}
          draggable={false}
          priority={priority}
          loading={priority ? undefined : initial.onScreen ? "eager" : "lazy"}
        />
        {/* Grain panel (see PANEL_OPACITY) — inside the counter-scaled
            layer, so the grain is never stretched by the fold. A
            separate overlay, not opacity on the image (which would wash
            it toward white instead of covering it in black). */}
        <div
          ref={(el) => {
            if (el) panelRefs.current.set(absIndex, el);
            else panelRefs.current.delete(absIndex);
          }}
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundColor: "#000",
            backgroundImage: `url(${GRAIN_TEXTURE})`,
            opacity: isActive ? 0 : PANEL_OPACITY,
          }}
        />
      </div>
      {/* Navigation target: only the active, fully-open slide is
          ever a link — a folded sliver has no anchor at all, so
          clicking one does nothing (dragging it still works, via
          the pointer handlers on the strip's outer container,
          which this overlay doesn't intercept since it never
          calls stopPropagation). Placed last so it sits above the
          image/panel without needing an explicit z-index. */}
      {isActive && (
        <Link
          href={`/album/${album.slug}`}
          onClick={onSlotClick}
          onMouseEnter={() => onActiveHover(true)}
          onMouseLeave={() => onActiveHover(false)}
          className="absolute inset-0 block select-none"
          draggable={false}
        />
      )}
    </div>
  );
}, sameSlide);

export default function AlbumsCarousel({ albums }: { albums: AlbumWithCover[] }) {
  const router = useRouter();
  // 1440 is a reasonable first-paint guess, corrected to the real window
  // size in the mount/resize effect below.
  const [viewportWidth, setViewportWidth] = useState(1440);
  // The only pieces of the motion model that live in React state — all
  // change rarely (only at a step commit). Everything continuous (offsetPx, openness,
  // position, width, drift) lives in refs and is written straight to the
  // DOM by the physics loop.
  const [activeIdx, setActiveIdx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  // Mirrors travelDirRef so render has a non-ref value (reading refs
  // during render trips react-hooks/refs) to pick a newly-mounted slide's
  // anchor edge (both layout and image, see computeFrame and
  // pinnedOriginFor) for its first paint. Commit-locked (see travelDirRef
  // below), not tied to the live velocity's sign. Newly-mounted slides are
  // always far from active, so approximating their initial openness as the
  // resting shape (1 if active, else 0) is a safe, low-consequence
  // shortcut; the physics loop corrects it on the very next frame.
  const [directionSnapshot, setDirectionSnapshot] = useState(1);
  // Whether the pointer is over the currently-active (fully open) slide —
  // the only slide that's ever a navigation target. Drives the info
  // block's title-shift/rule hover cue below; reset on every commit since
  // the active slide's own DOM node can be swapped out from under a
  // still-hovering pointer (no mouseleave fires for an element that gets
  // removed rather than actually left).
  const [isActiveHovered, setIsActiveHovered] = useState(false);

  const offsetPxRef = useRef(0);
  const velocityRef = useRef(0);
  // Whether the strip is above OPEN_SPEED (spec 012), with hysteresis.
  const isFastRef = useRef(false);
  // Set while fast, consumed when the snap starts (see SNAP_SETTLE_PX).
  const wasFastRef = useRef(false);
  // The album the snap lands on, or null when not snapping; the snap's
  // velocity in px/s (springStep's unit); and the free velocity and its
  // lowest point, along travelDir (see SNAP_RESUME_PX).
  const snapIdxRef = useRef<number | null>(null);
  const snapVelocityRef = useRef(0);
  const snapFreeRef = useRef(0);
  const snapFreeMinRef = useRef(0);
  const activeIdxRef = useRef(activeIdx);
  // The direction of the last commit — updated ONLY at a commit (inside
  // the while loop below), never from the live sign of velocity, so a small
  // wobble that never crosses half a step doesn't flip it. It no longer
  // touches the layout (see computeFrame): it says which side the trail
  // is on and which edge each image is pinned to.
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
  // The row every slide sits in. Slides are laid out in ROW coordinates
  // (see computeFrame) and the row alone carries -offsetPx (spec 011): while the strip slides without folding,
  // that is the only style written per frame, instead of one transform per
  // slide (~30).
  const rowRef = useRef<HTMLDivElement | null>(null);
  const rowTransformRef = useRef("");
  const frameRefs = useRef(new Map<number, HTMLDivElement>());
  const counterRefs = useRef(new Map<number, HTMLDivElement>());
  const imageRefs = useRef(new Map<number, HTMLImageElement>());
  const panelRefs = useRef(new Map<number, HTMLDivElement>());
  // The last value the physics loop wrote to each slide, so a slide whose
  // geometry didn't change this frame isn't written (and restyled) again.
  const writtenRef = useRef(new Map<number, WrittenStyle>());
  // Per-slide openness is genuine state (not a formula), so it has to
  // persist across frames keyed by absolute index — pruned to the visible
  // window (+ a small margin) each frame so it can't grow unbounded over
  // a long session.
  const opennessRef = useRef(new Map<number, number>());
  // Each slide's spring velocity (openness per second), alongside it.
  const opennessVelocityRef = useRef(new Map<number, number>());
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
  const initialFrame = computeFrame(activeIdx, new Map([[activeIdx, 1]]), lo, hi, albums, viewportWidth);
  const activeAlbum = albums[mod(activeIdx, albums.length)];

  // Mount + resize: just refresh the viewport width. computeFrame is a
  // pure function of (activeIdx, openness, viewportWidth), so a resize simply recomputes correctly on the very next
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
  // half a step either way (chaining multiple steps in one frame at high
  // speed, no queueing needed); let every visible slide's openness spring
  // toward whether it's currently active, on its own clock; write
  // width/transform/drift straight to DOM refs. Only
  // activeIdx changes go through setState — a frame otherwise only ever
  // touches the DOM nodes that actually moved or resized.
  useEffect(() => {
    let rafId: number;

    function tick(now: number) {
      rafId = requestAnimationFrame(tick);
      const dt = Math.min(now - (lastFrameTimeRef.current ?? now), MAX_DT_MS);
      lastFrameTimeRef.current = now;

      // 1. velocity += input; velocity *= friction, decayed by the number
      // of reference frames elapsed (see REFERENCE_FRAME_MS). Input is an
      // impulse — wheel/key events and pointer movement since the last
      // frame — so it needs no scaling of its own.
      const frames = dt / REFERENCE_FRAME_MS;
      let input = pendingWheelInputRef.current;
      pendingWheelInputRef.current = 0;
      let dragInput = 0;
      if (isDraggingRef.current) {
        const dx = dragCurrentXRef.current - dragLastXRef.current;
        // Dragging left advances forward (matches the wheel/keyboard sign
        // convention: negative screen movement = "go to next album").
        dragInput = -dx * DRAG_SENSITIVITY;
        input += dragInput;
        dragLastXRef.current = dragCurrentXRef.current;
      }
      // A new gesture ends the snap and hands the strip back to friction,
      // from the snap's velocity; a momentum tail doesn't (see
      // SNAP_RESUME_PX).
      if (snapIdxRef.current !== null) {
        const dir = travelDirRef.current;
        snapFreeRef.current = (snapFreeRef.current + input * dir) * FRICTION ** frames;
        snapFreeMinRef.current = Math.min(snapFreeMinRef.current, snapFreeRef.current);
        if (dragInput !== 0 || input * dir < 0 || snapFreeRef.current > snapFreeMinRef.current + SNAP_RESUME_PX) {
          velocityRef.current = (snapVelocityRef.current * REFERENCE_FRAME_MS) / 1000;
          snapIdxRef.current = null;
        } else {
          input = 0;
        }
      }
      if (snapIdxRef.current === null) {
        velocityRef.current += input;
        velocityRef.current *= FRICTION ** frames;
        const speed = Math.abs(velocityRef.current);
        if (speed > OPEN_SPEED) {
          isFastRef.current = true;
          wasFastRef.current = true;
        } else if (speed < SLOW_SPEED) isFastRef.current = false;
        if (!isFastRef.current && wasFastRef.current && !isDraggingRef.current) {
          const dir = travelDirRef.current;
          snapIdxRef.current = activeIdxRef.current + (offsetPxRef.current * dir >= STEP_DISTANCE / 2 ? dir : 0);
          snapVelocityRef.current = (velocityRef.current * 1000) / REFERENCE_FRAME_MS;
          snapFreeRef.current = velocityRef.current * dir;
          snapFreeMinRef.current = snapFreeRef.current;
          wasFastRef.current = false;
        }
      }

      // 2. offsetPx integrates velocity per reference frame (see
      // stepDistanceFactor), unconditionally —
      // no rubber-band resistance near any cap, and no easing back toward
      // 0 or anywhere else. Within half a step the strip just follows
      // wherever the accumulated input left it; once velocity decays to
      // ~0 (via friction, step 1), offsetPx simply stops changing and
      // stays put — nothing pulls it back on its own after a slow scroll.
      // It moves again only from more scroll/drag input or a snap.
      // While snapping, offsetPx springs to the snap album instead, and
      // velocity follows the spring so the trail does too. The target
      // already subtracts any commit on the way, so it never jumps.
      if (snapIdxRef.current !== null) {
        const snapTarget = (snapIdxRef.current - activeIdxRef.current) * STEP_DISTANCE;
        let [offset, snapVelocity] = springStep(offsetPxRef.current, snapVelocityRef.current, snapTarget, dt);
        if (Math.abs(offset - snapTarget) < SNAP_SETTLE_PX && Math.abs(snapVelocity) < 0.1) {
          offset = snapTarget;
          snapVelocity = 0;
        }
        offsetPxRef.current = offset;
        snapVelocityRef.current = snapVelocity;
        velocityRef.current = (snapVelocity * REFERENCE_FRAME_MS) / 1000;
      } else {
        offsetPxRef.current += velocityRef.current * stepDistanceFactor(frames);
      }

      // 3. Crossing half a step, either way, advances activeIdx (spec 012,
      // amendment 1, like cynx.io) — a while loop, so a single fast frame
      // can chain through several albums at once. Commits never wait for
      // the previous fold to finish (spec 011, amendment 1: free
      // scrolling): every slide's openness is on its own spring (step 4),
      // so a chained commit only retargets springs, it never snaps a width.
      // A commit moves nothing on screen, in either direction (see
      // computeFrame).
      const prevActiveIdx = activeIdxRef.current;
      while (Math.abs(offsetPxRef.current) > STEP_DISTANCE / 2) {
        const dir = Math.sign(offsetPxRef.current);
        travelDirRef.current = dir;
        activeIdxRef.current += dir;
        offsetPxRef.current -= dir * STEP_DISTANCE;
      }
      // Landed: the commit has brought the snap album to active, offsetPx
      // is exactly 0, and any momentum tail is spent.
      if (
        snapIdxRef.current === activeIdxRef.current &&
        offsetPxRef.current === 0 &&
        snapVelocityRef.current === 0 &&
        Math.abs(snapFreeRef.current) < SNAP_RELEASE_PX
      ) {
        snapIdxRef.current = null;
      }
      if (activeIdxRef.current !== prevActiveIdx) {
        setActiveIdx(activeIdxRef.current);
        setDirectionSnapshot(travelDirRef.current);
        setIsActiveHovered(false);
        // Both slides in this step's pair start a fresh fold/unfold right
        // now — the only moment either is allowed to change its frozen
        // image anchor (see imageAnchorDirRef and pinnedOriginFor above).
        imageAnchorDirRef.current.set(prevActiveIdx, travelDirRef.current);
        imageAnchorDirRef.current.set(activeIdxRef.current, travelDirRef.current);
      }

      // 4. Openness targets: the active slide targets 1 and unfolds toward
      // fully open on its own spring (see SPRING_OMEGA), less the faster
      // the strip (see FAST_OPENNESS), unless the strip is snapping to the next album (see SNAP_SETTLE_PX), when it
      // waits for that commit — the slide about to become active must be
      // exactly S at the commit (see computeFrame); the slides
      // just passed target the trail (see TRAIL_MAX_PX), which follows the
      // strip's speed; every other slide targets 0. A commit swaps which
      // slide is targeting 1, and each spring carries its current velocity
      // into the new target. Never where offsetPx sits within the step: the
      // fold is still not scrubbable by scroll position.
      const vw = viewportWidthRef.current;
      const sps = computeSlotsPerSide(vw);
      const frameLo = activeIdxRef.current - sps;
      const frameHi = activeIdxRef.current + sps;
      const trailSpeed = clamp(Math.abs(velocityRef.current) / TRAIL_FULL_SPEED, 0, 1);
      const openFade = clamp(
        (FAST_OPENNESS_SPEED - Math.abs(velocityRef.current)) / (FAST_OPENNESS_SPEED - SLOW_SPEED),
        0,
        1
      );
      const activeTarget = FAST_OPENNESS + (1 - FAST_OPENNESS) * openFade;
      for (let absIndex = frameLo; absIndex <= frameHi; absIndex++) {
        const opens = snapIdxRef.current === null || snapIdxRef.current === activeIdxRef.current;
        let target = absIndex === activeIdxRef.current && opens ? activeTarget : 0;
        // Positions behind the active one, on the side already passed.
        const behind = (activeIdxRef.current - absIndex) * travelDirRef.current;
        if (behind >= 1 && trailSpeed > 0) {
          const trailNatural = naturalWidthFor(albums[mod(absIndex, albums.length)].cover);
          const extraPx = TRAIL_MAX_PX * trailSpeed * TRAIL_DECAY ** (behind - 1);
          target = Math.min(1, extraPx / (trailNatural - S));
        }
        const current = opennessRef.current.get(absIndex) ?? 0;
        const currentVelocity = opennessVelocityRef.current.get(absIndex) ?? 0;
        if (current !== target || currentVelocity !== 0) {
          let [next, nextVelocity] = springStep(current, currentVelocity, target, dt);
          // Never past fully open or closed: a frame wider than its cover
          // would show past the image's edge.
          if (next < 0 || next > 1) {
            next = clamp(next, 0, 1);
            nextVelocity = 0;
          }
          // Settled: snap exactly, so the slide stops being written.
          if (Math.abs(next - target) < 1e-5 && Math.abs(nextVelocity) < 1e-3) {
            next = target;
            nextVelocity = 0;
          }
          opennessRef.current.set(absIndex, next);
          opennessVelocityRef.current.set(absIndex, nextVelocity);
        }
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
      // A slide still part-open is kept even outside the window: it still
      // pushes the rest (see computeFrame), and dropping it would shift them.
      for (const key of opennessRef.current.keys()) {
        const settled = opennessRef.current.get(key) === 0 && (opennessVelocityRef.current.get(key) ?? 0) === 0;
        if ((key < frameLo - 2 || key > frameHi + 2) && settled) {
          opennessRef.current.delete(key);
          opennessVelocityRef.current.delete(key);
        }
      }
      for (const key of imageAnchorDirRef.current.keys()) {
        if (key < frameLo - 2 || key > frameHi + 2) imageAnchorDirRef.current.delete(key);
      }
      for (const key of driftRef.current.keys()) {
        if (key < frameLo - 2 || key > frameHi + 2) driftRef.current.delete(key);
      }

      // 5. Compute this frame's geometry and write it straight to the DOM:
      // slides in row coordinates, offsetPx on the row alone (see rowRef).
      const travelDir = travelDirRef.current;
      const rowTransform = `translateX(${-offsetPxRef.current}px)`;
      if (rowRef.current && rowTransform !== rowTransformRef.current) {
        rowRef.current.style.transform = rowTransform;
        rowTransformRef.current = rowTransform;
      }
      const frame = computeFrame(activeIdxRef.current, opennessRef.current, frameLo, frameHi, albums, vw);
      frame.forEach(({ width, x }, absIndex) => {
        let written = writtenRef.current.get(absIndex);
        if (!written) {
          written = {};
          writtenRef.current.set(absIndex, written);
        }
        const naturalWidth = naturalWidthFor(albums[mod(absIndex, albums.length)].cover);
        const frameEl = frameRefs.current.get(absIndex);
        if (frameEl) writeIfChanged(frameEl, "transform", frameTransformFor(x, width, naturalWidth), written);
        const counterEl = counterRefs.current.get(absIndex);
        if (counterEl) {
          writeIfChanged(counterEl, "transform", counterScaleFor(width, naturalWidth), written, "counterScale");
          const anchorDir = imageAnchorDirRef.current.get(absIndex) ?? travelDir;
          writeIfChanged(counterEl, "transformOrigin", pinnedOriginFor(anchorDir), written, "pinnedOrigin");
        }
        const imageEl = imageRefs.current.get(absIndex);
        if (imageEl) {
          // Drift stays live only while this slide's width hasn't yet
          // reached its resting target (still actively folding/
          // unfolding); once it has, the last computed value is left
          // untouched — otherwise a resting sliver would keep drifting
          // just because activeIdx (and so its distance-from-active) kept
          // changing long after this slide itself stopped animating.
          // Only the pair actually folding (the active slide and its
          // neighbours) counts: a trail slide (see TRAIL_MAX_PX) also
          // changes width while the strip moves, but its drift stays frozen,
          // or the rest crop would depend on how fast the strip got there.
          const targetWidth = absIndex === activeIdxRef.current ? naturalWidth : S;
          const folding =
            Math.abs(absIndex - activeIdxRef.current) <= 1 && Math.abs(width - targetWidth) > OPEN_EPSILON_PX;
          if (folding || !driftRef.current.has(absIndex)) {
            driftRef.current.set(absIndex, driftPxFor(absIndex, activeIdxRef.current, naturalWidth, width));
          }
          writeIfChanged(imageEl, "transform", driftTransformFor(driftRef.current.get(absIndex)!), written, "drift");
        }
        const panelEl = panelRefs.current.get(absIndex);
        if (panelEl) {
          const openness = opennessRef.current.get(absIndex) ?? 0;
          const opacity = (PANEL_OPACITY * (1 - openness)).toFixed(3);
          writeIfChanged(panelEl, "opacity", opacity, written, "panel");
        }
      });
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

  const slideIndices = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col items-center justify-center gap-[15px] overflow-hidden pt-[74px]"
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: SLIDE_HEIGHT,
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "pan-y",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div ref={rowRef} className="absolute inset-0" style={{ willChange: "transform" }}>
          {slideIndices.map((absIndex) => {
            const album = albums[mod(absIndex, albums.length)];
            const init = initialFrame.get(absIndex)!;
            const isActive = absIndex === activeIdx;
            return (
              <Slide
                key={absIndex}
                absIndex={absIndex}
                album={album}
                isActive={isActive}
                priority={absIndex === initialActiveIndex}
                initial={{
                  width: init.width,
                  x: init.x,
                  dir: directionSnapshot,
                  drift: driftPxFor(absIndex, activeIdx, naturalWidthFor(album.cover), init.width),
                  onScreen: init.x + init.width > 0 && init.x < viewportWidth,
                }}
                frameRefs={frameRefs}
                counterRefs={counterRefs}
                imageRefs={imageRefs}
                panelRefs={panelRefs}
                writtenRef={writtenRef}
                onActiveHover={setIsActiveHovered}
              />
            );
          })}
        </div>
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

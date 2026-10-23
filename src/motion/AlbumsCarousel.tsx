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
// frame; crossing STEP_DISTANCE advances the integer `activeIdx`. Openness
// is driven PURELY by which slide is active — see step 4 below. All of
// these are tunable "feel" constants — untested live in this environment,
// expect to retune once you're actually scrolling it.
// STEP_DISTANCE is exactly one closed slot's pitch (S+GAP) — see
// computeFrame's header comment for why that equality is what makes a
// commit exactly continuous, algebraically, not just empirically.
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
// Openness and restOffsetPx move on a critically damped spring (spec 011),
// not an exponential ease: an exponential starts at full speed — the fold
// opened with a 58 px leap in its first frame — while a spring starts from
// rest, and a target that changes mid-way (a reversal) keeps the current
// velocity instead of snapping. At 18.6 rad/s a full 0 -> 1 lands within
// 0.5 px of the widest cover in ~500 ms, close to the old "~450ms". It also
// governs restOffsetPx (see step 5), so layout, width, and the grain panel
// all resolve on one shared timeline.
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
// Open on slowing down (spec 012, from cynx.io): while the strip moves
// faster than OPEN_SPEED no slide opens — the active one targets 0 like
// the rest, and only the trail keeps intermediate widths. Once it slows
// below SLOW_SPEED the active one opens on its spring. The gap between the
// two keeps a trackpad hovering around the threshold from opening and
// folding the active slide every few frames. In px per reference frame,
// like velocity, so it holds at any frame rate. A single arrow key
// (KEY_KICK_PX) stays below OPEN_SPEED and opens as before.
const OPEN_SPEED = 20;
const SLOW_SPEED = OPEN_SPEED * 0.8;
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
  // change rarely (only at a step commit). Everything continuous (offsetPx, restOffsetPx, openness,
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
  const restOffsetVelocityRef = useRef(0);
  const velocityRef = useRef(0);
  // Whether the strip is above OPEN_SPEED (spec 012), with hysteresis.
  const isFastRef = useRef(false);
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
  // The row every slide sits in. Slides are laid out in ROW coordinates
  // (computeFrame with renderOffsetPx = 0) and the row alone carries
  // -renderOffsetPx (spec 011): while the strip slides without folding,
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
  const initialFrame = computeFrame(
    activeIdx,
    0,
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
  // slide's openness spring toward whether it's currently active, on its
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

      // 1. velocity += input; velocity *= friction, decayed by the number
      // of reference frames elapsed (see REFERENCE_FRAME_MS). Input is an
      // impulse — wheel/key events and pointer movement since the last
      // frame — so it needs no scaling of its own.
      const frames = dt / REFERENCE_FRAME_MS;
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
      velocityRef.current *= FRICTION ** frames;
      const speed = Math.abs(velocityRef.current);
      if (speed > OPEN_SPEED) isFastRef.current = true;
      else if (speed < SLOW_SPEED) isFastRef.current = false;

      // 2. offsetPx integrates velocity per reference frame (see
      // stepDistanceFactor), unconditionally —
      // no rubber-band resistance near any cap, and no easing back toward
      // 0 or anywhere else. Below STEP_DISTANCE the strip just follows
      // wherever the accumulated input left it; once velocity decays to
      // ~0 (via friction, step 1), offsetPx simply stops changing and
      // stays put — nothing pulls it back on its own. It moves again only
      // from more scroll/drag input or a commit (step 3), and the strip
      // only ever recentres as part of a commit (step 5's restOffsetPx
      // ease toward the absolute target) — never while the user is idle.
      offsetPxRef.current += velocityRef.current * stepDistanceFactor(frames);

      // 3. Crossing STEP_DISTANCE advances activeIdx — a while loop, so a
      // single fast frame can chain through several albums at once. Commits
      // never wait for the previous fold to finish (spec 011, amendment 1:
      // free scrolling, like cynx.io): every slide's openness is on its own
      // spring (step 4), so a chained commit only retargets springs, it
      // never snaps a width. A commit that keeps travelDir the
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
        // image anchor (see imageAnchorDirRef and pinnedOriginFor above).
        imageAnchorDirRef.current.set(prevActiveIdx, travelDirRef.current);
        imageAnchorDirRef.current.set(activeIdxRef.current, travelDirRef.current);
      }

      // 4. Openness targets: the active slide targets 1 and unfolds toward
      // fully open on its own spring (see SPRING_OMEGA), unless the strip
      // is fast (see OPEN_SPEED), when it targets 0 like the rest; the slides
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
      for (let absIndex = frameLo; absIndex <= frameHi; absIndex++) {
        let target = absIndex === activeIdxRef.current && !isFastRef.current ? 1 : 0;
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
      for (const key of opennessRef.current.keys()) {
        if (key < frameLo - 2 || key > frameHi + 2) {
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

      // 5. restOffsetPx eases toward exactly 0 on the SAME spring as
      // openness — one shared timeline, so position, width, and the grain
      // panel all resolve together. The target is a true constant now (not
      // derived from the active album's width, unlike the old centring
      // rule) — see the fixed X_RIGHT/X_LEFT anchor-line comment on
      // computeFrame. A commit that continues the same travelDir never
      // touches restOffsetPx at all (step 3), so once it has settled to 0
      // it STAYS at 0 through every subsequent same-direction commit — the
      // anchored edge is then already exactly on its fixed line the
      // instant the commit fires, with nothing left to ease.
      if (restOffsetPxRef.current !== 0 || restOffsetVelocityRef.current !== 0) {
        let [rest, restVelocity] = springStep(restOffsetPxRef.current, restOffsetVelocityRef.current, 0, dt);
        if (Math.abs(rest) < 0.01 && Math.abs(restVelocity) < 0.1) {
          rest = 0;
          restVelocity = 0;
        }
        restOffsetPxRef.current = rest;
        restOffsetVelocityRef.current = restVelocity;
      }

      // 6. Compute this frame's geometry and write it straight to the DOM:
      // slides in row coordinates, the render offset on the row alone (see
      // rowRef). computeFrame's x is linear in renderOffsetPx, so the sum is
      // exactly the old per-slide position.
      const travelDir = travelDirRef.current;
      const renderOffsetPx = restOffsetPxRef.current + offsetPxRef.current;
      const rowTransform = `translateX(${-renderOffsetPx}px)`;
      if (rowRef.current && rowTransform !== rowTransformRef.current) {
        rowRef.current.style.transform = rowTransform;
        rowTransformRef.current = rowTransform;
      }
      const frame = computeFrame(
        activeIdxRef.current,
        0,
        (absIndex) => opennessRef.current.get(absIndex) ?? 0,
        frameLo,
        frameHi,
        albums,
        vw,
        travelDir,
        anchorRestOffsetPx
      );
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
  }, [albums, anchorRestOffsetPx]);

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

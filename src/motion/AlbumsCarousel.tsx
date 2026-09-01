"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Album, Photo } from "@/data/photos";

// SLIDE_HEIGHT is the one dimension that is NEVER conditional on distance,
// openness, or animation state — every frame in the strip, and every
// image inside it, is exactly this tall, always.
const SLIDE_HEIGHT = 500;
const GAP = 32;
// Every FOLDED slide is exactly this wide — no distance-based compression.
// Uniform width is what lets every slide other than the (at most two)
// actively opening/closing ones behave as one rigid, non-deforming block:
// its on-screen position only ever changes because something ELSE
// changed size, never because it recomputed its own width.
const S = 110;

// Distance from the settled (rounded) index -> blur(px) / veil opacity.
// These are the only two visual properties still keyed to a rounded,
// occasionally-updated value with a CSS transition — position and width
// are driven continuously every frame instead (see the physics effect).
const BLUR_BY_DISTANCE: Record<number, number> = { 1: 6, 2: 12, 3: 18 };
const MAX_BLUR = 18;
const VEIL_ALPHA_BY_DISTANCE: Record<number, number> = { 1: 0.15, 2: 0.22, 3: 0.28 };
const MAX_VEIL_ALPHA = 0.28;
const IMAGE_FILTER_TRANSITION = "filter 300ms ease-out";
const VEIL_TRANSITION = "opacity 300ms ease-out";

// Inner drift: the image's rendered size is CONSTANT (SLIDE_HEIGHT x its
// own natural ratio), never resized — the frame is a clipping window over
// it. Driven continuously by the same physics loop as position/width (see
// below), so no CSS transition on its transform either.
const DRIFT_TARGET_PX_AT_MAX_DISTANCE = 14;
const DRIFT_MAX_DISTANCE = 3;

const CLICK_DRAG_TOLERANCE_PX = 5;

// Continuous-drive physics constants. Wheel deltas and drag movement both
// feed the SAME t (a float; album i is fully open at t === i) — wheel via
// velocity (so a flick keeps gliding), drag by following the pointer 1:1.
// Once input stops, velocity decays (coast) until it's small enough to
// switch to a spring-like chase toward the nearest integer (snap). There
// is no discrete step anywhere in this file — t is the only state that
// "moves the carousel," and it always moves continuously.
const WHEEL_TO_T = 1 / 3000; // t-units per combined wheel-delta px
const DRAG_TO_T = 1 / 400; // t-units per px of pointer movement
const KEY_VELOCITY_KICK = 0.08; // arrow keys reuse the same coast+snap physics as a firm flick
const MAX_VELOCITY = 0.12; // per-frame t-units, clamps pathological flings
const COAST_FRICTION = 0.92; // per-frame velocity decay once input stops
const COAST_VELOCITY_EPSILON = 0.0006; // below this, switch from coasting to snapping
const SNAP_STRENGTH = 0.2; // per-frame chase-fraction toward the nearest integer
const SNAP_DONE_EPSILON = 0.0008; // close enough to hard-set t to the integer

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

function naturalWidthFor(cover: Photo) {
  return Math.round(SLIDE_HEIGHT * (cover.width / cover.height));
}

function opennessFor(i: number, t: number) {
  return Math.max(0, 1 - Math.abs(i - t));
}

function widthFor(naturalWidth: number, openness: number) {
  return S + (naturalWidth - S) * openness;
}

// Every folded slide is exactly S wide, so — unlike the old
// distance-compressed slivers — the slot count needed to overflow both
// viewport edges on every side is a closed form, independent of which
// album is open.
function computeSlotsPerSide(viewportWidth: number) {
  return Math.ceil((viewportWidth + 2 * S) / (S + GAP)) + 2;
}

type AlbumWithCover = Omit<Album, "cover"> & { cover: Photo };
type SlideFrame = { width: number; x: number };

// The exact stripTranslateX that centers slide `i` when t === i — true by
// construction, since at any integer t every slide OTHER than i is
// closed at S, so i's position is the simple closed form below. Between
// two integers, the strip's translateX is the LINEAR interpolation of
// this value at the two surrounding integers (see computeFrame) — a
// deliberately different, simpler quantity than "recompute the anchor
// from the live, currently-interpolating widths," which turns out to
// make stripTranslateX quadratic in t and briefly send the two halves of
// the strip in opposite directions around the midpoint of a transition.
// The linear version keeps any such coupling to a few px total, spread
// across an entire transition — sub-pixel per frame, not visible.
function stripTranslateXAtInteger(
  i: number,
  lo: number,
  albums: AlbumWithCover[],
  viewportWidth: number
) {
  const posAtRest = (i - lo) * (S + GAP);
  const naturalWidth = naturalWidthFor(albums[mod(i, albums.length)].cover);
  return viewportWidth / 2 - posAtRest - naturalWidth / 2;
}

// Pure function of (t, window, albums, viewport) — called both by the
// physics loop every frame (writing results straight to DOM refs) and by
// render (for a newly-mounted slide's first-paint style, before the loop
// corrects it on the next frame).
function computeFrame(
  t: number,
  lo: number,
  hi: number,
  albums: AlbumWithCover[],
  viewportWidth: number
): Map<number, SlideFrame> {
  const n = hi - lo + 1;
  const widths = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    const absIndex = lo + k;
    const album = albums[mod(absIndex, albums.length)];
    widths[k] = widthFor(naturalWidthFor(album.cover), opennessFor(absIndex, t));
  }
  const pos = new Array<number>(n);
  pos[0] = 0;
  for (let k = 1; k < n; k++) pos[k] = pos[k - 1] + widths[k - 1] + GAP;

  const i0 = Math.floor(t);
  const frac = t - i0;
  const strip0 = stripTranslateXAtInteger(i0, lo, albums, viewportWidth);
  const strip1 = stripTranslateXAtInteger(i0 + 1, lo, albums, viewportWidth);
  const stripTranslateX = strip0 + frac * (strip1 - strip0);

  const result = new Map<number, SlideFrame>();
  for (let k = 0; k < n; k++) {
    result.set(lo + k, { width: widths[k], x: pos[k] + stripTranslateX });
  }
  return result;
}

function driftPxFor(absIndex: number, t: number, naturalWidth: number, frameWidth: number) {
  const distance = clamp(absIndex - t, -DRIFT_MAX_DISTANCE, DRIFT_MAX_DISTANCE);
  const raw = (distance / DRIFT_MAX_DISTANCE) * DRIFT_TARGET_PX_AT_MAX_DISTANCE;
  const maxSafe = Math.max(0, (naturalWidth - frameWidth) / 2);
  return clamp(raw, -maxSafe, maxSafe);
}

export default function AlbumsCarousel({ albums }: { albums: AlbumWithCover[] }) {
  // 1440 is a reasonable first-paint guess, corrected to the real window
  // size in the mount/resize effect below.
  const [viewportWidth, setViewportWidth] = useState(1440);
  // Math.floor(t) — the only thing that decides which abs indices are
  // MOUNTED. Updated (rarely — once per integer crossing) by the physics
  // loop; everything smooth in between happens via direct ref writes, not
  // re-renders.
  const [windowFloor, setWindowFloor] = useState(0);
  // Math.round(t) — drives blur/veil (and the info block / counter) only.
  const [roundedT, setRoundedT] = useState(0);
  // A recent snapshot of the continuous t, refreshed whenever windowFloor
  // or roundedT changes (i.e. at least as often as new slides mount) —
  // exists only so render has a non-ref value to compute a newly-mounted
  // slide's first-paint geometry from (reading tRef.current directly
  // during render trips react-hooks/refs; the physics loop corrects any
  // few-ms staleness here on the very next frame regardless).
  const [tSnapshot, setTSnapshot] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const tRef = useRef(0);
  const velocityRef = useRef(0);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragCurrentXRef = useRef(0);
  const dragLastXRef = useRef(0);
  const dragDistanceRef = useRef(0);
  const viewportWidthRef = useRef(viewportWidth);
  const windowFloorRef = useRef(windowFloor);
  const roundedTRef = useRef(roundedT);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frameRefs = useRef(new Map<number, HTMLAnchorElement>());
  const imageRefs = useRef(new Map<number, HTMLImageElement>());
  // The absolute index open on mount — the ONLY slide ever marked
  // priority (a lazy-initialized state, since reading a ref's `.current`
  // during render is disallowed — see the equivalent note this replaced).
  const [initialActiveIndex] = useState(0);

  const slotsPerSide = computeSlotsPerSide(viewportWidth);
  const lo = windowFloor - slotsPerSide;
  const hi = windowFloor + slotsPerSide;
  const initialFrame = computeFrame(tSnapshot, lo, hi, albums, viewportWidth);
  const activeAlbum = albums[mod(roundedT, albums.length)];

  // Mount + resize: just refresh the viewport width. Unlike the old
  // discrete/anchored model, there is no persisted position to
  // reconcile — stripTranslateX is a pure function of (t, viewportWidth),
  // so a resize simply recomputes correctly on the very next frame.
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

  // The single rAF loop that owns all motion: advances t (drag / coast /
  // snap), then writes width + transform directly to each visible
  // slide's frame and image elements. Deliberately NOT React state per
  // frame — only the rare, integer-crossing changes to windowFloor/
  // roundedT go through setState, so a frame here only ever touches the
  // handful of DOM nodes that actually moved or resized.
  useEffect(() => {
    let rafId: number;

    function tick() {
      rafId = requestAnimationFrame(tick);

      if (isDraggingRef.current) {
        const dx = dragCurrentXRef.current - dragLastXRef.current;
        const dt = -dx * DRAG_TO_T;
        tRef.current += dt;
        velocityRef.current = clamp(dt, -MAX_VELOCITY, MAX_VELOCITY);
        dragLastXRef.current = dragCurrentXRef.current;
      } else if (Math.abs(velocityRef.current) > COAST_VELOCITY_EPSILON) {
        tRef.current += velocityRef.current;
        velocityRef.current *= COAST_FRICTION;
      } else {
        velocityRef.current = 0;
        const target = Math.round(tRef.current);
        const diff = target - tRef.current;
        tRef.current += Math.abs(diff) < SNAP_DONE_EPSILON ? diff : diff * SNAP_STRENGTH;
      }

      const t = tRef.current;

      let needsSnapshot = false;
      const newWindowFloor = Math.floor(t);
      if (newWindowFloor !== windowFloorRef.current) {
        windowFloorRef.current = newWindowFloor;
        setWindowFloor(newWindowFloor);
        needsSnapshot = true;
      }
      const newRoundedT = Math.round(t);
      if (newRoundedT !== roundedTRef.current) {
        roundedTRef.current = newRoundedT;
        setRoundedT(newRoundedT);
        needsSnapshot = true;
      }
      if (needsSnapshot) setTSnapshot(t);

      const vw = viewportWidthRef.current;
      const sps = computeSlotsPerSide(vw);
      const frameLo = windowFloorRef.current - sps;
      const frameHi = windowFloorRef.current + sps;
      const frame = computeFrame(t, frameLo, frameHi, albums, vw);

      frame.forEach(({ width, x }, absIndex) => {
        const frameEl = frameRefs.current.get(absIndex);
        if (frameEl) {
          frameEl.style.width = `${width}px`;
          frameEl.style.transform = `translateX(${x}px)`;
        }
        const imageEl = imageRefs.current.get(absIndex);
        if (imageEl) {
          const naturalWidth = naturalWidthFor(albums[mod(absIndex, albums.length)].cover);
          const drift = driftPxFor(absIndex, t, naturalWidth, width);
          imageEl.style.transform = `translateX(calc(-50% + ${drift}px))`;
        }
      });
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [albums]);

  // Keyboard: arrow keys give the same coast+snap physics a firm push in
  // one direction, rather than special-casing a discrete jump.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") velocityRef.current = clamp(velocityRef.current + KEY_VELOCITY_KICK, -MAX_VELOCITY, MAX_VELOCITY);
      else if (e.key === "ArrowLeft") velocityRef.current = clamp(velocityRef.current - KEY_VELOCITY_KICK, -MAX_VELOCITY, MAX_VELOCITY);
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
      // velocity (not t directly) so a flick keeps gliding via the same
      // coast phase as a drag release.
      const injected = (e.deltaX + e.deltaY) * WHEEL_TO_T;
      velocityRef.current = clamp(velocityRef.current + injected, -MAX_VELOCITY, MAX_VELOCITY);
    }

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  function onPointerDown(e: React.PointerEvent) {
    dragStartXRef.current = e.clientX;
    dragCurrentXRef.current = e.clientX;
    dragLastXRef.current = e.clientX;
    dragDistanceRef.current = 0;
    velocityRef.current = 0; // drag takes over motion immediately, no leftover coast/snap
    isDraggingRef.current = true;
    setIsDragging(true);
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
    // velocityRef.current already holds the last frame's per-frame drag
    // delta — releasing naturally continues that as momentum into the
    // coast phase, no separate "fling" calculation needed.
  }

  // A drag that moved more than a few px shouldn't also fire the slot's
  // link navigation — only a genuine click/tap should.
  function onSlotClick(e: React.MouseEvent) {
    if (dragDistanceRef.current > CLICK_DRAG_TOLERANCE_PX) e.preventDefault();
  }

  const slideIndices = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);

  return (
    <div
      ref={rootRef}
      className="flex h-full w-full flex-col items-center justify-center gap-10 overflow-hidden"
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
          const distanceFromRounded = Math.abs(absIndex - roundedT);
          const isSettledCenter = distanceFromRounded === 0;
          const blur = isSettledCenter ? 0 : BLUR_BY_DISTANCE[distanceFromRounded] ?? MAX_BLUR;
          const veilAlpha = isSettledCenter ? 0 : VEIL_ALPHA_BY_DISTANCE[distanceFromRounded] ?? MAX_VEIL_ALPHA;
          const initDrift = driftPxFor(absIndex, tSnapshot, naturalWidth, init.width);

          return (
            <Link
              key={absIndex}
              ref={(el) => {
                if (el) frameRefs.current.set(absIndex, el);
                else frameRefs.current.delete(absIndex);
              }}
              href={`/album/${album.slug}`}
              onClick={onSlotClick}
              className="absolute isolate block select-none overflow-hidden"
              style={{
                top: 0,
                left: 0,
                width: init.width,
                height: SLIDE_HEIGHT,
                maxWidth: "none",
                transform: `translateX(${init.x}px)`,
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "pan-y",
              }}
              draggable={false}
            >
              {/* The frame (this Link) is purely a clipping window: its
                  WIDTH is the only thing that ever animates its own size,
                  revealing more or less of the image below as a slide
                  approaches or leaves openness=1 — a curtain opening, not
                  a zoom. The image itself never changes size (no
                  scale/zoom transform anywhere in this file). Width and
                  position (transform) are written directly by the
                  physics loop every frame — no CSS transition on either,
                  it would only fight the loop's own writes. */}
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
                  left: "50%",
                  top: 0,
                  width: naturalWidth,
                  height: SLIDE_HEIGHT,
                  maxWidth: "none",
                  objectFit: "cover",
                  filter: blur ? `blur(${blur}px)` : "none",
                  transform: `translateX(calc(-50% + ${initDrift}px))`,
                  transition: IMAGE_FILTER_TRANSITION,
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
            </Link>
          );
        })}
      </div>

      <div className="w-full max-w-4xl px-8 text-[#666]">
        <p className="font-serif text-[30px] text-[#111]">{activeAlbum.title}</p>
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
          <span>{String(mod(roundedT, albums.length) + 1).padStart(2, "0")}</span>
          <span className="h-px w-16 bg-[#CCC]" />
          <span>{String(albums.length).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
}

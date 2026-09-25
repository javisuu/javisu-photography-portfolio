"use client";

// An orthographic globe, hand-rolled on a single <canvas> — no map
// library, no three.js/GL. The previous version was a flat SVG map with
// a dot lattice baked once in world coordinates and scaled with zoom,
// which meant zooming in just spread the SAME dots further apart
// (measured: 31.3px on-screen spacing at one particular zoom, ~6.7px at
// scale 1 — degrading linearly, never resolving more coastline). This
// version derives the lattice's angular step from the CURRENT radius
// every time it changes meaningfully, so on-screen dot spacing stays
// pinned to TARGET_PX at every zoom level — see buildLattice below.
//
// Everything here is plain 2D canvas math: orthographic projection
// (camera at infinity) is four lines (see project()), navigation is
// rotation only (drag/inertia/idle-drift change lambda0/phi0; wheel/
// pinch change the radius R) — no panning, which is deliberate: it's
// what keeps the view impossible to get lost in.

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PlacePrecision } from "@/data/photos";

export type AtlasMark = {
  src: string;
  width: number;
  height: number;
  title: string;
  album: string;
  albumPhotoIndex: number;
  city: string;
  country: string;
  lat: number;
  lng: number;
  precision: PlacePrecision;
};

// ---- Palette (matches the rest of the site — no colour, photos are
// the only colour anywhere) -------------------------------------------
const COLOR_BG = "#FAFAFA";
const COLOR_DOT = "#CCCCCC";
const COLOR_MARK = "#111111";
// Muted text (#666) appears only in JSX className strings below (the
// hover/cluster panels, legend, reset control), never drawn on canvas —
// no JS constant needed for it the way the canvas-drawn colours above do.

// ---- Tunables, named exactly for what they gate ----------------------
const TARGET_PX = 7; // on-screen spacing the dot lattice always resamples to
const LAT_MIN_DEG = -60;
const LAT_MAX_DEG = 80;
const LATTICE_REBUILD_RATIO = 0.15; // rebuild once R has drifted this far from the cached build
const LIMB_FADE_START = 0.15; // cosc below this fades linearly to 0
const PHI0_CLAMP_DEG = 70;
const ZOOM_MIN_MULT = 0.32; // * min(vw, vh)
const ZOOM_MAX_MULT = 1.6;
const DEFAULT_LAMBDA0_DEG = -46;
const DEFAULT_PHI0_DEG = 26;
const INERTIA_FRICTION = 0.94;
const INERTIA_STOP_RAD = 0.0002;
const IDLE_DRIFT_DELAY_MS = 4000;
const IDLE_DRIFT_DEG_PER_SEC = 1.5;
const CLUSTER_THRESHOLD_PX = 14;
const DOT_RADIUS_PX = 1.1;
const MARK_RADIUS_PX = 4;
const MARK_HOVER_RADIUS_PX = 5.5;
const MARK_HIT_RADIUS_PX = 10; // generous — easier to point at than to see
const RECENTER_MS = 600;
const CLICK_MOVE_THRESHOLD_PX = 4;

const DEG = Math.PI / 180;

// A module-level wrapper around performance.now() — the React Compiler's
// purity lint (react-hooks/purity) flags a raw performance.now() call
// reachable from ANY function defined inside the component body,
// including plain event handlers, as "impure during render." A
// module-level function (outside the component, like Math.random()
// calls elsewhere in this codebase's motion components) isn't part of
// that analysis, so wrapping the call here — not changing what it
// does — is what actually satisfies the rule.
function nowMs(): number {
  return performance.now();
}

function toDMS(value: number, positiveSuffix: string, negativeSuffix: string) {
  const suffix = value >= 0 ? positiveSuffix : negativeSuffix;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60);
  return `${deg}°${min}'${sec}"${suffix}`;
}

// ---- Projection (orthographic, camera at infinity) --------------------
// lambda/phi/lambda0/phi0 all in RADIANS. Returns null for the far
// hemisphere (cosc < 0) — the caller decides what "skip" means (dots:
// don't draw; marks: don't consider for hover/click either).
function project(
  lambda: number,
  phi: number,
  lambda0: number,
  phi0: number,
  R: number,
  cx: number,
  cy: number
): { x: number; y: number; cosc: number } | null {
  const dl = lambda - lambda0;
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dl);
  if (cosc < 0) return null;
  const x = R * Math.cos(phi) * Math.sin(dl);
  const y = R * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dl));
  return { x: cx + x, y: cy - y, cosc };
}

function limbOpacity(cosc: number): number {
  if (cosc >= LIMB_FADE_START) return 1;
  if (cosc <= 0) return 0;
  return cosc / LIMB_FADE_START;
}

// Shortest angular path between two longitudes, in (-PI, PI] — used by
// the recenter animation so it never spins the long way around.
function shortestDelta(from: number, to: number): number {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// ---- Land mask ----------------------------------------------------
// public/atlas/land-mask.png: a monochrome equirectangular raster
// (white = land) generated at build time by
// scripts/generate-atlas-land-mask.mjs from the same Natural Earth
// source the old fixed dot list used — see docs/atlas-data-sources.md.
// Decoded ONCE on mount into a plain Uint8Array (1 byte/px, 255 or 0)
// so every later lattice rebuild is a synchronous array read, no canvas
///ImageData calls on the hot path.
type LandMask = { data: Uint8Array; w: number; h: number };

function sampleLand(mask: LandMask, lat: number, lng: number): boolean {
  const x = Math.min(mask.w - 1, Math.max(0, Math.floor(((lng + 180) / 360) * mask.w)));
  const y = Math.min(mask.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * mask.h)));
  return mask.data[y * mask.w + x] > 127;
}

// ---- Dot lattice ----------------------------------------------------
// Not baked once — rebuilt whenever R has drifted more than
// LATTICE_REBUILD_RATIO from the last build (see the rebuild check in
// the draw loop), at an angular step derived from the CURRENT radius,
// so on-screen spacing stays pinned to TARGET_PX regardless of zoom.
// Latitude steps by `delta`; longitude steps by `delta / cos(phi)` so
// the spacing is uniform on the SPHERE SURFACE, not in lat/lng space —
// dots naturally compress toward the limb under the projection, which
// is the curvature cue and is kept, not corrected for.
type LatticePoint = { lambda: number; phi: number };

function buildLattice(mask: LandMask, R: number): LatticePoint[] {
  const delta = TARGET_PX / R;
  const points: LatticePoint[] = [];
  const latMin = LAT_MIN_DEG * DEG;
  const latMax = LAT_MAX_DEG * DEG;
  for (let phi = latMin; phi <= latMax; phi += delta) {
    const lngStep = delta / Math.cos(phi);
    for (let lambda = -Math.PI; lambda < Math.PI; lambda += lngStep) {
      if (sampleLand(mask, phi / DEG, lambda / DEG)) {
        points.push({ lambda, phi });
      }
    }
  }
  return points;
}

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

type Cluster = { members: { mark: AtlasMark; index: number }[]; x: number; y: number; opacity: number };

function clusterKey(cluster: Cluster): string {
  return cluster.members.map((m) => m.mark.src).join("|");
}

export default function Atlas({ marks }: { marks: AtlasMark[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isDragging, setIsDragging] = useState(false);
  // The full cluster object, not just a key — set directly from the
  // event handler that hit-tests it (see handlePointerMove), so render
  // never needs to look anything up from a ref (lastClustersRef is
  // written imperatively inside draw(), outside React's render cycle;
  // reading it during render trips react-hooks/refs).
  const [hoveredCluster, setHoveredCluster] = useState<Cluster | null>(null);
  const [clusterPanel, setClusterPanel] = useState<{ members: { mark: AtlasMark; index: number }[]; x: number; y: number } | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  // ---- The hot-path view state lives in refs, not React state — the
  // canvas is redrawn imperatively at up to 60fps while rotating/
  // zooming/drifting, and routing that through setState/re-render every
  // frame would be pure overhead for a page with no other reactive DOM
  // tied to these values. React state is reserved for things that
  // actually need a DOM re-render (hover panel contents, cursor style).
  const lambda0Ref = useRef(DEFAULT_LAMBDA0_DEG * DEG);
  const phi0Ref = useRef(DEFAULT_PHI0_DEG * DEG);
  const RRef = useRef(0);

  const maskRef = useRef<LandMask | null>(null);
  const latticeRef = useRef<{ R: number; points: LatticePoint[] } | null>(null);

  const rafRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);

  // Drag / inertia / idle-drift bookkeeping.
  const dragRef = useRef<{ lastX: number; lastY: number; moved: number; downX: number; downY: number } | null>(null);
  const velocityRef = useRef({ lambda: 0, phi: 0 }); // rad/frame
  const inertiaActiveRef = useRef(false);
  const driftActiveRef = useRef(false);
  // Idle drift is armed by THIS timeout, not by checking elapsed time
  // inside the rAF loop — the loop only runs while something is
  // active, so once it's gone idle nothing would ever re-check "has 4s
  // passed" if that check lived inside it. Every real interaction
  // reschedules this timeout (clearing any currently-active drift in
  // the process); when it actually FIRES, that's the signal to start
  // drifting, and it wakes the (stopped) loop back up via requestFrame.
  const idleDriftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pinch bookkeeping.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartRRef = useRef(0);

  // Recenter-on-click animation.
  const recenterRef = useRef<{
    fromLambda: number;
    fromPhi: number;
    toLambda: number;
    toPhi: number;
    startedAt: number;
    onDone: () => void;
  } | null>(null);

  // Last frame's projected marks/clusters — pointer handlers (hover,
  // click hit-testing) read this rather than recomputing projections
  // themselves, so hit-testing is always consistent with what's
  // actually on screen.
  const lastClustersRef = useRef<Cluster[]>([]);

  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
    // Re-arm (or, if now true, cancel) idle drift immediately — without
    // this, toggling the OS setting mid-drift would only take effect
    // once some OTHER interaction happened to reschedule it. Also does
    // the mount-time arming for free (this effect's dep array still
    // fires once on mount regardless of reducedMotion's initial value).
    scheduleIdleDrift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  // Unmount: cancel the rAF loop and the idle-drift timeout outright.
  // CRITICAL: rafRef.current must be reset to null after cancelling, not
  // just cancelled — requestFrame()'s own guard is `if (rafRef.current
  // !== null) return`, so a cancelled-but-still-non-null id permanently
  // blocks every future requestFrame() call from ever scheduling a real
  // frame again. This isn't just a real-unmount concern: React's dev-mode
  // Strict Mode double-invokes every effect (mount -> cleanup -> mount)
  // WITHOUT actually discarding the component's refs between that
  // cleanup and the remount, so the cancelled id from the simulated
  // first mount was silently wedging rafRef.current for the entire rest
  // of the component's real lifetime — confirmed via direct
  // instrumentation: requestFrame() kept being called (ResizeObserver,
  // mask load, etc.) but tick() never fired again, so draw() never ran,
  // so the canvas never got its one-time resize — this is what actually
  // produced the "canvas stuck at its 300x150 HTML default" symptom, not
  // a missing resize implementation (one already existed below).
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (idleDriftTimeoutRef.current !== null) clearTimeout(idleDriftTimeoutRef.current);
    };
  }, []);

  // Measure the container once and on resize.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setViewportSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // draw() reads viewportSize from THIS ref, never the state variable
  // directly — draw() gets invoked from callbacks registered inside
  // one-time ([]-dep) effects (the land-mask onload handler, the wheel
  // listener), which permanently close over whatever viewportSize WAS
  // at the render those effects first ran in — {0,0}, before this
  // ResizeObserver has ever fired. draw()'s own first line bails out
  // when width is 0, so without this indirection those calls would
  // silently no-op forever, which is exactly what happened: the mask
  // loaded and landCount was correct, but the lattice never actually
  // got built because the redraw it triggered read a permanently-stale
  // {0,0} viewport.
  const viewportSizeRef = useRef(viewportSize);
  useEffect(() => {
    viewportSizeRef.current = viewportSize;
  }, [viewportSize]);

  const minR = useMemo(() => ZOOM_MIN_MULT * Math.min(viewportSize.width, viewportSize.height), [viewportSize]);
  const maxR = useMemo(() => ZOOM_MAX_MULT * Math.min(viewportSize.width, viewportSize.height), [viewportSize]);

  // React's JSX onWheel is registered as a passive listener, and
  // passive listeners can't call preventDefault — it throws ("Unable to
  // preventDefault inside passive event listener invocation") rather
  // than silently doing nothing. Wheel-zoom needs preventDefault (to
  // stop the page from doing anything else with the gesture), so this
  // has to be a real addEventListener with { passive: false }. The
  // effect attaches once; a "latest" ref is what keeps it seeing
  // current min/max without needing to re-attach on every resize.
  const zoomBoundsRef = useRef({ minR, maxR });
  useEffect(() => {
    zoomBoundsRef.current = { minR, maxR };
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { minR, maxR } = zoomBoundsRef.current;
      const factor = Math.pow(1.0015, -e.deltaY);
      RRef.current = Math.min(maxR, Math.max(minR, RRef.current * factor));
      scheduleIdleDrift();
      requestFrame();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed R the first time the viewport is known (default framing: whole
  // globe comfortably inside the shorter dimension); on every LATER
  // resize, re-clamp the user's current R into the new [minR, maxR]
  // bounds instead — minR/maxR are themselves derived from viewportSize,
  // so a window shrink can otherwise leave R sitting above the new
  // maxR indefinitely (nothing else re-checks it until the next wheel/
  // pinch). Clamping, not reseeding, preserves whatever zoom level the
  // visitor actually chose across a resize. draw()'s own R-drift check
  // (LATTICE_REBUILD_RATIO) picks up the corrected R on the very next
  // frame and resamples the lattice if it moved enough to matter.
  useEffect(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) return;
    if (RRef.current === 0) {
      RRef.current = Math.min(viewportSize.width, viewportSize.height) * 0.42;
    } else {
      RRef.current = Math.min(maxR, Math.max(minR, RRef.current));
    }
    requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportSize, minR, maxR]);

  // Load + decode the land mask once. Until it's ready the globe still
  // renders — background, marks if any — just without dots yet; a 22KB
  // PNG decodes fast enough that this is essentially never visible, and
  // there's no artificial minimum-duration loading state for it.
  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const off = document.createElement("canvas");
      off.width = img.naturalWidth;
      off.height = img.naturalHeight;
      const octx = off.getContext("2d", { willReadFrequently: true });
      if (!octx) return;
      octx.drawImage(img, 0, 0);
      const { data } = octx.getImageData(0, 0, off.width, off.height);
      const packed = new Uint8Array(off.width * off.height);
      for (let i = 0; i < packed.length; i++) packed[i] = data[i * 4]; // red channel; mask is grayscale
      maskRef.current = { data: packed, w: off.width, h: off.height };
      requestFrame();
    };
    img.src = "/atlas/land-mask.png";
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- The rAF loop: only runs while something is actually moving —
  // dragging, inertia, idle drift, a recenter animation, or a pending
  // one-off redraw (resize, mask just loaded, hover just changed). Each
  // tick updates whatever's active, draws one canvas pass, and decides
  // whether to schedule another frame or go idle.
  function requestFrame() {
    if (rafRef.current !== null) return;
    lastFrameAtRef.current = nowMs();
    rafRef.current = requestAnimationFrame(tick);
  }

  // Called on every real interaction (drag, wheel, pinch, hover-move,
  // pointer up) — cancels any drift already in progress and restarts
  // the 4s countdown to the next one. prefers-reduced-motion just never
  // (re)arms it at all.
  function scheduleIdleDrift() {
    if (idleDriftTimeoutRef.current !== null) {
      clearTimeout(idleDriftTimeoutRef.current);
      idleDriftTimeoutRef.current = null;
    }
    driftActiveRef.current = false;
    if (reducedMotionRef.current) return;
    idleDriftTimeoutRef.current = setTimeout(() => {
      idleDriftTimeoutRef.current = null;
      driftActiveRef.current = true;
      requestFrame();
    }, IDLE_DRIFT_DELAY_MS);
  }

  function tick(now: number) {
    rafRef.current = null;
    const dtMs = Math.min(64, now - lastFrameAtRef.current); // clamp so a tab-switch stall can't fling the globe
    lastFrameAtRef.current = now;

    let stillActive = false;

    // Recenter animation takes priority over drift/inertia (both are
    // cleared before one starts — see startRecenter). Reduced motion is
    // handled at the START call instead (see startRecenter) so a
    // reduced-motion recenter never enters this branch at all — it
    // jumps straight to the target and calls onDone in the same tick
    // that requested it, rather than still looping, motionless, for the
    // full nominal duration.
    const recenter = recenterRef.current;
    if (recenter) {
      const t = Math.min(1, (now - recenter.startedAt) / RECENTER_MS);
      const eased = easeOutCubic(t);
      lambda0Ref.current = recenter.fromLambda + shortestDelta(recenter.fromLambda, recenter.toLambda) * eased;
      phi0Ref.current = recenter.fromPhi + (recenter.toPhi - recenter.fromPhi) * eased;
      if (t >= 1) {
        recenterRef.current = null;
        recenter.onDone();
      } else {
        stillActive = true;
      }
    } else if (inertiaActiveRef.current) {
      lambda0Ref.current -= velocityRef.current.lambda;
      phi0Ref.current = clampPhi0(phi0Ref.current + velocityRef.current.phi);
      velocityRef.current.lambda *= INERTIA_FRICTION;
      velocityRef.current.phi *= INERTIA_FRICTION;
      if (Math.hypot(velocityRef.current.lambda, velocityRef.current.phi) < INERTIA_STOP_RAD) {
        inertiaActiveRef.current = false;
      } else {
        stillActive = true;
      }
    } else if (driftActiveRef.current && !dragRef.current) {
      // driftActiveRef is flipped true by the idle-drift TIMEOUT (see
      // scheduleIdleDrift), never by checking elapsed time in here —
      // this loop only runs at all while SOMETHING is active, so a
      // "has 4s passed?" check inside it can never fire once the loop
      // has already gone idle (which is exactly when it needs to).
      lambda0Ref.current += IDLE_DRIFT_DEG_PER_SEC * DEG * (dtMs / 1000);
      stillActive = true;
    }

    draw();

    if (stillActive) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  function clampPhi0(phi0: number): number {
    const limit = PHI0_CLAMP_DEG * DEG;
    return Math.min(limit, Math.max(-limit, phi0));
  }

  function draw() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const vp = viewportSizeRef.current;
    if (!canvas || !ctx || vp.width === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = vp.width;
    const h = vp.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, w, h);

    const R = RRef.current;
    if (R === 0) return;
    const cx = w / 2;
    const cy = h / 2;
    const lambda0 = lambda0Ref.current;
    const phi0 = phi0Ref.current;

    // Rebuild the lattice only when R has drifted more than
    // LATTICE_REBUILD_RATIO since the cached build — this is the actual
    // fix: on-screen dot spacing stays pinned to TARGET_PX at every
    // zoom level instead of degrading as R grows.
    const mask = maskRef.current;
    if (mask) {
      const cached = latticeRef.current;
      if (!cached || Math.abs(R - cached.R) / cached.R > LATTICE_REBUILD_RATIO) {
        latticeRef.current = { R, points: buildLattice(mask, R) };
      }
      ctx.fillStyle = COLOR_DOT;
      const r = DOT_RADIUS_PX;
      for (const { lambda, phi } of latticeRef.current!.points) {
        const p = project(lambda, phi, lambda0, phi0, R, cx, cy);
        if (!p) continue;
        const op = limbOpacity(p.cosc);
        if (op <= 0) continue;
        ctx.globalAlpha = op;
        ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }

    // Photo marks — projected the same way, clustered by ON-SCREEN
    // proximity (recomputed every frame since rotation moves them).
    const projected = marks
      .map((mark, index) => {
        const p = project(mark.lng * DEG, mark.lat * DEG, lambda0, phi0, R, cx, cy);
        return p ? { mark, index, x: p.x, y: p.y, opacity: limbOpacity(p.cosc) } : null;
      })
      .filter((v): v is { mark: AtlasMark; index: number; x: number; y: number; opacity: number } => v !== null);

    const used = new Set<number>();
    const clusters: Cluster[] = [];
    for (let i = 0; i < projected.length; i++) {
      if (used.has(i)) continue;
      const group = [projected[i]];
      used.add(i);
      for (let j = i + 1; j < projected.length; j++) {
        if (used.has(j)) continue;
        const close = group.some((g) => Math.hypot(g.x - projected[j].x, g.y - projected[j].y) < CLUSTER_THRESHOLD_PX);
        if (close) {
          group.push(projected[j]);
          used.add(j);
        }
      }
      const x = group.reduce((s, g) => s + g.x, 0) / group.length;
      const y = group.reduce((s, g) => s + g.y, 0) / group.length;
      const opacity = Math.min(...group.map((g) => g.opacity));
      clusters.push({ members: group.map((g) => ({ mark: g.mark, index: g.index })), x, y, opacity });
    }
    lastClustersRef.current = clusters;

    for (const cluster of clusters) {
      if (cluster.opacity <= 0) continue;
      ctx.globalAlpha = cluster.opacity;
      const key = clusterKey(cluster);
      const isHovered = key === hoveredKeyRef.current;

      if (cluster.members.length > 1) {
        const r = (isHovered ? MARK_HOVER_RADIUS_PX : MARK_RADIUS_PX) + 2;
        ctx.fillStyle = COLOR_MARK;
        ctx.beginPath();
        ctx.arc(cluster.x, cluster.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (isHovered) {
          ctx.strokeStyle = COLOR_MARK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cluster.x, cluster.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = COLOR_BG;
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(cluster.members.length), cluster.x, cluster.y + 0.5);
      } else {
        const { mark } = cluster.members[0];
        const isExact = mark.precision === "exact";
        const r = isHovered ? MARK_HOVER_RADIUS_PX : MARK_RADIUS_PX;
        ctx.fillStyle = isExact ? COLOR_MARK : COLOR_BG;
        ctx.strokeStyle = COLOR_MARK;
        ctx.lineWidth = isExact ? 0 : 1.25;
        ctx.beginPath();
        ctx.arc(cluster.x, cluster.y, r, 0, Math.PI * 2);
        if (isExact) ctx.fill();
        else {
          ctx.fill(); // COLOR_BG fill so the disc still reads as solid, not a hole
          ctx.stroke();
        }
        if (isHovered) {
          ctx.strokeStyle = COLOR_MARK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cluster.x, cluster.y, r + 4, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  // The hovered cluster's key needs to be readable from inside draw()
  // (a plain function, not reactive) without becoming a draw()
  // dependency that forces re-creating the function — a ref mirrors the
  // state's key.
  const hoveredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    hoveredKeyRef.current = hoveredCluster ? clusterKey(hoveredCluster) : null;
    requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredCluster]);

  // Redraw once whenever the viewport size changes (covers first mount
  // too, once size is known).
  useEffect(() => {
    requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportSize]);

  function findClusterAt(x: number, y: number): Cluster | null {
    let best: Cluster | null = null;
    let bestDist = MARK_HIT_RADIUS_PX;
    for (const cluster of lastClustersRef.current) {
      if (cluster.opacity <= 0) continue;
      const d = Math.hypot(cluster.x - x, cluster.y - y);
      if (d < bestDist) {
        bestDist = d;
        best = cluster;
      }
    }
    return best;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pointersRef.current.set(e.pointerId, { x, y });
    scheduleIdleDrift();
    inertiaActiveRef.current = false;
    recenterRef.current = null;

    if (pointersRef.current.size === 1) {
      dragRef.current = { lastX: x, lastY: y, downX: x, downY: y, moved: 0 };
      velocityRef.current = { lambda: 0, phi: 0 };
      setIsDragging(true);
    } else if (pointersRef.current.size === 2) {
      dragRef.current = null;
      setIsDragging(false);
      const pts = Array.from(pointersRef.current.values());
      pinchStartDistRef.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchStartRRef.current = RRef.current;
    }
    requestFrame();
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x, y });

    if (pointersRef.current.size >= 2 && pinchStartDistRef.current !== null) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const newR = (pinchStartRRef.current * dist) / pinchStartDistRef.current;
      RRef.current = Math.min(maxR, Math.max(minR, newR));
      scheduleIdleDrift();
      requestFrame();
      return;
    }

    if (dragRef.current) {
      const R = RRef.current || 1;
      const dx = x - dragRef.current.lastX;
      const dy = y - dragRef.current.lastY;
      dragRef.current.lastX = x;
      dragRef.current.lastY = y;
      dragRef.current.moved += Math.hypot(dx, dy);
      const dLambda = dx * (Math.PI / R);
      const dPhi = dy * (Math.PI / R);
      lambda0Ref.current -= dLambda;
      phi0Ref.current = clampPhi0(phi0Ref.current + dPhi);
      // Smoothed velocity (for inertia on release) — an exponential
      // moving average so a single jittery final sample doesn't fling
      // the globe.
      velocityRef.current = {
        lambda: velocityRef.current.lambda * 0.7 + dLambda * 0.3,
        phi: velocityRef.current.phi * 0.7 + dPhi * 0.3,
      };
      scheduleIdleDrift();
      requestFrame();
      return;
    }

    // Hover (no button down): hit-test against last frame's projected
    // clusters. Counts as "input" for idle-drift purposes too — without
    // this, drift could start while the cursor sits stationary over a
    // mark, and the hover panel (positioned from THIS event's snapshot)
    // would drift out of sync with the mark's now-moving screen position.
    scheduleIdleDrift();
    const hit = findClusterAt(x, y);
    setHoveredCluster(hit);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : 0;
    const y = rect ? e.clientY - rect.top : 0;

    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartDistRef.current = null;

    if (pointersRef.current.size === 0) {
      const wasClick = dragRef.current !== null && dragRef.current.moved < CLICK_MOVE_THRESHOLD_PX;
      dragRef.current = null;
      setIsDragging(false);
      if (wasClick) {
        handleClick(x, y);
      } else {
        // -velocity because lambda0 -= velocity each inertia frame,
        // matching the live-drag sign convention above.
        const speed = Math.hypot(velocityRef.current.lambda, velocityRef.current.phi);
        inertiaActiveRef.current = speed >= INERTIA_STOP_RAD;
      }
      scheduleIdleDrift();
      requestFrame();
    }
  }

  function startRecenter(toLambda: number, toPhi: number, onDone: () => void) {
    inertiaActiveRef.current = false;
    if (reducedMotionRef.current) {
      // Jump straight to the target and call onDone in this same
      // (event-handler) call — no point looping the rAF tick for a
      // full RECENTER_MS just to redraw the same, already-final frame
      // repeatedly.
      lambda0Ref.current = toLambda;
      phi0Ref.current = toPhi;
      requestFrame();
      onDone();
      return;
    }
    recenterRef.current = {
      fromLambda: lambda0Ref.current,
      fromPhi: phi0Ref.current,
      toLambda,
      toPhi,
      startedAt: nowMs(),
      onDone,
    };
    requestFrame();
  }

  function handleClick(x: number, y: number) {
    const cluster = findClusterAt(x, y);
    if (!cluster) return;
    setClusterPanel(null);

    // Average lat/lng of the cluster's own members as the recenter
    // target — for a single mark this is just that mark's coordinate.
    let sx = 0, sy = 0, sz = 0;
    for (const { mark } of cluster.members) {
      const lambda = mark.lng * DEG;
      const phi = mark.lat * DEG;
      sx += Math.cos(phi) * Math.cos(lambda);
      sy += Math.cos(phi) * Math.sin(lambda);
      sz += Math.sin(phi);
    }
    const toLambda = Math.atan2(sy, sx);
    const toPhi = Math.atan2(sz, Math.hypot(sx, sy));

    if (cluster.members.length > 1) {
      startRecenter(toLambda, toPhi, () => {
        setClusterPanel({ members: cluster.members, x: cluster.x, y: cluster.y });
      });
    } else {
      const { mark } = cluster.members[0];
      startRecenter(toLambda, toPhi, () => {
        router.push(`/album/${mark.album}#photo-${mark.albumPhotoIndex}`);
      });
    }
  }

  function resetToDefault() {
    setClusterPanel(null);
    startRecenter(DEFAULT_LAMBDA0_DEG * DEG, DEFAULT_PHI0_DEG * DEG, () => {});
    const targetR = Math.min(viewportSize.width, viewportSize.height) * 0.42;
    RRef.current = targetR; // radius itself doesn't need the angular recenter easing
  }

  const hoveredSingle = hoveredCluster && hoveredCluster.members.length === 1 ? hoveredCluster.members[0].mark : null;

  return (
    <div className="relative h-full w-full select-none">
      <div
        ref={containerRef}
        className="h-full w-full touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          // Canvas has no per-shape mouse events — without this, the
          // hover panel would stay pinned to the last-hovered mark even
          // after the cursor leaves the globe entirely.
          if (!dragRef.current) setHoveredCluster(null);
        }}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        {/* className is a belt-and-suspenders CSS fallback — draw() is
            what actually keeps the canvas's CSS box in sync with the
            container via canvas.style.width/height (see below), but
            this gives it a sane box even in the instant before the
            first draw() call ever lands, rather than sitting at the
            HTML canvas default (300x150). */}
        <canvas ref={canvasRef} className="block h-full w-full" />
      </div>

      {/* Hover preview — same card styling as before; canvas has no
          native hover, so this is positioned from the last drawn
          screen coordinates of the hovered mark. */}
      {hoveredSingle && hoveredCluster && !isDragging && (
        <div
          className={`pointer-events-none absolute z-10 flex max-w-[220px] gap-3 bg-[#FAFAFA] p-2 shadow-sm ${
            reducedMotion ? "" : "transition-opacity duration-150"
          }`}
          style={{
            left: Math.min(hoveredCluster.x + 14, viewportSize.width - 220),
            top: Math.min(hoveredCluster.y + 14, viewportSize.height - 100),
          }}
        >
          <Image
            src={hoveredSingle.src}
            alt={hoveredSingle.title}
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 object-cover"
            sizes="64px"
          />
          <div className="flex flex-col justify-center gap-0.5">
            <span className="text-[12px] uppercase tracking-[0.14em] text-[#666]">
              {hoveredSingle.city} · {hoveredSingle.country}
            </span>
            {hoveredSingle.precision === "exact" && (
              <span className="text-[11px] text-[#A8A8A8]">
                {toDMS(hoveredSingle.lat, "N", "S")} {toDMS(hoveredSingle.lng, "E", "W")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cluster panel — opened after a cluster's recenter animation
          finishes (see handleClick); lists every photo in the cluster,
          each a direct deep link into its album. Dismiss by clicking
          elsewhere on the globe or the close control. */}
      {clusterPanel && (
        <div
          className="absolute z-20 flex max-h-[70vh] w-[240px] flex-col gap-2 overflow-y-auto bg-[#FAFAFA] p-3 shadow-sm"
          style={{
            left: Math.min(Math.max(0, clusterPanel.x - 120), viewportSize.width - 240),
            top: Math.min(clusterPanel.y + 16, viewportSize.height - 260),
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] uppercase tracking-[0.14em] text-[#666]">
              {clusterPanel.members.length} Photographs
            </span>
            <button
              type="button"
              onClick={() => setClusterPanel(null)}
              className="text-[12px] text-[#666] hover:text-[#111]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {clusterPanel.members.map(({ mark }) => (
            <button
              key={mark.src}
              type="button"
              onClick={() => router.push(`/album/${mark.album}#photo-${mark.albumPhotoIndex}`)}
              className="flex items-center gap-3 text-left"
            >
              <Image
                src={mark.src}
                alt={mark.title}
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 object-cover"
                sizes="48px"
              />
              <span className="text-[12px] uppercase tracking-[0.14em] text-[#666] hover:text-[#111]">
                {mark.city} · {mark.country}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Legend + reset control. */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 text-[12px] text-[#666] md:bottom-6 md:left-6">
        <svg width="10" height="10" aria-hidden>
          <circle cx="5" cy="5" r="4" fill={COLOR_MARK} />
        </svg>
        <span>Exact location</span>
        <svg width="10" height="10" aria-hidden className="ml-3">
          <circle cx="5" cy="5" r="4" fill="none" stroke={COLOR_MARK} strokeWidth="1" />
        </svg>
        <span>Approximate (city)</span>
      </div>

      <button
        type="button"
        onClick={resetToDefault}
        className="absolute bottom-4 right-4 text-[12px] uppercase tracking-[0.14em] text-[#666] hover:text-[#111] md:bottom-6 md:right-6"
      >
        Reset View
      </button>
    </div>
  );
}

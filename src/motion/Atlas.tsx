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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CaptureData, PlacePrecision } from "@/data/photos";
import atlasZones from "@/data/atlas-zones.json";
import AtlasViewer, { atlasViewerWidth, toDMS } from "@/components/AtlasViewer";

export type AtlasMark = {
  src: string;
  width: number;
  height: number;
  title: string;
  album: string;
  albumTitle: string;
  albumPhotoIndex: number;
  order: number; // the photo's order inside its album
  capture: CaptureData;
  city: string;
  country: string;
  lat: number;
  lng: number;
  precision: PlacePrecision;
  stop: number; // index of its place along the tour (src/lib/atlasTour.ts)
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
// The zoom ceiling is no longer a viewport multiple (spec 016): it is
// where the land mask under the CENTRE of the view stops resolving — see
// currentMaxR(). WORLD_MAX_R is the world mask's own limit (2048 px at 14
// screen px per mask pixel, scripts/generate-atlas-local-masks.mjs).
const WORLD_MAX_R = atlasZones.worldMaxR;
const LOCAL_PRELOAD_RATIO = 0.5; // a zone's masks load once R passes this share of WORLD_MAX_R with the centre in it
const LOCAL_BLEND_RATIO = 0.1; // ...and blend in over the next 10 % of WORLD_MAX_R, so crossing that R never pops
const MASK_FADE_MS = 200; // a local mask that just arrived fades in over this
const DEFAULT_LAMBDA0_DEG = -46;
const DEFAULT_PHI0_DEG = 26;
const INERTIA_FRICTION = 0.94;
const INERTIA_STOP_RAD = 0.0002;
const IDLE_DRIFT_DELAY_MS = 4000;
const IDLE_DRIFT_DEG_PER_SEC = 1.5;
// Drift and the inertia stop threshold are ANGULAR, so on screen they
// grow with R: at the deep zooms of spec 016 (R in the millions) 1.5°/s
// would be tens of thousands of px/s. Both scale by min(1, REF / R),
// REF being the largest R the atlas reached before spec 016 (1.6 x 609,
// the canvas height at 1440x900): up to there nothing changes, past it
// the on-screen speed stays what it was at that zoom.
const NAV_SCALE_REF_R = 974;
function navScale(R: number): number {
  return R > NAV_SCALE_REF_R ? NAV_SCALE_REF_R / R : 1;
}
const CLUSTER_THRESHOLD_PX = 14;
const DOT_RADIUS_PX = 1.1;
const MARK_RADIUS_PX = 4;
const MARK_HOVER_RADIUS_PX = 5.5;
const MARK_HIT_RADIUS_PX = 10; // generous — easier to point at than to see
const RECENTER_MS = 600;
const ZOOM_BACK_MS = RECENTER_MS; // R easing back to the ceiling after the centre leaves a zone
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

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

// The viewer's tour and the clicks that open it (spec 016, amendment 3)
// FLY the globe to a photo along van Wijk & Nuij's optimal zoom-and-pan
// path ("Smooth and efficient zooming and panning", 2003), the one web
// maps use: perceived speed stays constant, and it pulls out only as far
// as the trip needs. A first version dipped through a fixed half-way zoom
// in a fixed time; Javi found it "un tanto agresiva" (2026-11-02).
//   u: distance travelled (radians of arc), w: width of view (radians of
//   arc across the canvas's shorter side, span / R). FLY_RHO trades zoom
//   for pan: lower pulls out less (van Wijk's own suggestion is 1.42).
//   The path length S sets the duration, eased in and out.
const FLY_RHO = 1.0;
const FLY_MS_PER_S = 420;
const FLY_MIN_MS = 600;
const FLY_MAX_MS = 1800;

function flyPath(u1: number, w0: number, w1: number): { S: number; at: (s: number) => { u: number; w: number } } {
  const rho = FLY_RHO;
  const rho2 = rho * rho;
  if (u1 < 1e-12) {
    // Zoom only.
    const k = w1 < w0 ? -1 : 1;
    return { S: Math.abs(Math.log(w1 / w0)) / rho, at: (s) => ({ u: 0, w: w0 * Math.exp(k * rho * s) }) };
  }
  const b = (wi: number, sign: number) => (w1 * w1 - w0 * w0 + sign * rho2 * rho2 * u1 * u1) / (2 * wi * rho2 * u1);
  const r = (bi: number) => Math.log(-bi + Math.sqrt(bi * bi + 1));
  const r0 = r(b(w0, 1));
  const r1 = r(b(w1, -1));
  return {
    S: (r1 - r0) / rho,
    at: (s) => ({
      u: (w0 / rho2) * (Math.cosh(r0) * Math.tanh(rho * s + r0) - Math.sinh(r0)),
      w: (w0 * Math.cosh(r0)) / Math.cosh(rho * s + r0),
    }),
  };
}

// Clicking a group zooms until it splits (spec 016, amendment 2). Marks
// cluster by single linkage at CLUSTER_THRESHOLD_PX on screen, and near
// the centre of the view on-screen distance is R x angular distance, so
// a group splits once R x (its largest minimum-spanning-tree edge) passes
// the threshold. The target is CLICK_SPLIT_MARGIN times that, so the
// split is clear rather than borderline. Infinity when every member sits
// on the same point: no zoom ever splits it.
const CLICK_SPLIT_MARGIN = 1.5;
const SAME_POINT_RAD = 1e-7;
const CONTEXT_SHARE = 0.35; // see photoR
// A group that can't split still zooms in before it opens, to a regional
// view: this many km across the shorter side of the canvas — about
// Central America (Javi, 2026-11-02, after trying San Blas and Puerto
// Escondido, whose photos share one point and got no zoom at all).
const CLICK_REGION_KM = 2500;
const EARTH_KM = 6371;
function splitR(points: { lat: number; lng: number }[]): number {
  const n = points.length;
  const v = points.map(({ lat, lng }) => [Math.cos(lat * DEG) * Math.cos(lng * DEG), Math.cos(lat * DEG) * Math.sin(lng * DEG), Math.sin(lat * DEG)]);
  const ang = (a: number, b: number) =>
    Math.acos(Math.min(1, Math.max(-1, v[a][0] * v[b][0] + v[a][1] * v[b][1] + v[a][2] * v[b][2])));
  // Prim's algorithm; n is a handful of photos.
  const inTree = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  best[0] = 0;
  let maxEdge = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u === -1 || best[i] < best[u])) u = i;
    inTree[u] = true;
    maxEdge = Math.max(maxEdge, best[u]);
    for (let i = 0; i < n; i++) if (!inTree[i]) best[i] = Math.min(best[i], ang(u, i));
  }
  // Points closer than ~0.6 m are the same point: acos near 1 rounds to
  // ~1e-8 rad rather than 0, so an exact zero test would miss them.
  return maxEdge > SAME_POINT_RAD ? (CLUSTER_THRESHOLD_PX * CLICK_SPLIT_MARGIN) / maxEdge : Infinity;
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

// Grayscale image -> LandMask (red channel; the masks are monochrome).
function packMask(source: CanvasImageSource, w: number, h: number): LandMask | null {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d", { willReadFrequently: true });
  if (!octx) return null;
  octx.drawImage(source, 0, 0);
  const { data } = octx.getImageData(0, 0, w, h);
  const packed = new Uint8Array(w * h);
  for (let i = 0; i < packed.length; i++) packed[i] = data[i * 4];
  return { data: packed, w, h };
}

// ---- Local masks (spec 016) -------------------------------------------
// src/data/atlas-zones.json, written by scripts/generate-atlas-local-masks.mjs
// from OpenStreetMap's coastline: for each ZONE (exact-located photos too
// close together to separate on the world mask) a small pyramid of square
// equirectangular masks, finer and smaller level after level. Flattened
// here, finest first, so "the finest mask that covers a point" is the
// first one in the list that contains it.
type LocalLevel = {
  file: string;
  s: number;
  w: number;
  n: number;
  e: number;
  capR: number; // the zoom ceiling with the centre in this level: its resolution limit, capped at the zone's need
};
const LOCAL_LEVELS: LocalLevel[] = atlasZones.zones
  .flatMap((z) =>
    z.levels.map((l) => ({
      file: l.file,
      s: l.bbox[0],
      w: l.bbox[1],
      n: l.bbox[2],
      e: l.bbox[3],
      capR: Math.min(l.maxR, z.needR),
    }))
  )
  .sort((a, b) => a.e - a.w - (b.e - b.w));

type LoadedMask = LandMask & { loadedAt: number };

function inLevel(l: LocalLevel, lat: number, lng: number): boolean {
  return lat >= l.s && lat < l.n && lng >= l.w && lng < l.e;
}

function sampleLocal(mask: LandMask, l: LocalLevel, lat: number, lng: number): boolean {
  const x = Math.min(mask.w - 1, Math.max(0, Math.floor(((lng - l.w) / (l.e - l.w)) * mask.w)));
  const y = Math.min(mask.h - 1, Math.max(0, Math.floor(((l.n - lat) / (l.n - l.s)) * mask.h)));
  return mask.data[y * mask.w + x] > 127;
}

// Longitude in degrees, wrapped to [-180, 180) — lambda0 itself is never
// wrapped (drag and drift just keep adding to it).
function lngDeg(lambda: number): number {
  let d = (lambda / DEG) % 360;
  if (d >= 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

// fetch + createImageBitmap rather than an <img>: the PNG decode happens
// off the main thread, so a level arriving mid-zoom costs one getImageData
// and nothing else.
async function decodeMask(src: string): Promise<LandMask | null> {
  const res = await fetch(src);
  if (!res.ok) return null;
  const bitmap = await createImageBitmap(await res.blob());
  const mask = packMask(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return mask;
}

// ---- Dot lattice ----------------------------------------------------
// The angular step `delta` is derived from the radius and only changes
// once R has drifted more than LATTICE_REBUILD_RATIO from the last one
// (see draw()), so on-screen spacing stays pinned to TARGET_PX
// regardless of zoom. Latitude steps by `delta`; longitude steps by
// `delta / cos(phi)` so the spacing is uniform on the SPHERE SURFACE,
// not in lat/lng space — dots naturally compress toward the limb under
// the projection, which is the curvature cue and is kept, not corrected
// for.
//
// The lattice is never materialised for the whole globe (spec 016): at
// a deep zoom that would be millions of points per rebuild. Every
// point is addressed by integer indices anchored to the sphere —
// row k at phi = LAT_MIN + k·delta, column j at lambda = -PI + j·lngStep
// — so draw() can walk only the rows and columns inside the visible
// range (visibleRange below) and still land on exactly the same points
// as a full walk would, frame after frame: nothing swims when rotating.

// Inverse orthographic projection: screen -> (lambda, phi), or null off
// the disc. Same conventions as project().
function unproject(
  x: number,
  y: number,
  lambda0: number,
  phi0: number,
  R: number,
  cx: number,
  cy: number
): { lambda: number; phi: number } | null {
  const px = x - cx;
  const py = cy - y;
  const rho = Math.hypot(px, py);
  if (rho > R) return null;
  if (rho < 1e-9) return { lambda: lambda0, phi: phi0 };
  const c = Math.asin(rho / R);
  const sinC = Math.sin(c);
  const cosC = Math.cos(c);
  const phi = Math.asin(Math.min(1, Math.max(-1, cosC * Math.sin(phi0) + (py * sinC * Math.cos(phi0)) / rho)));
  const lambda = lambda0 + Math.atan2(px * sinC, rho * cosC * Math.cos(phi0) - py * sinC * Math.sin(phi0));
  return { lambda, phi };
}

const VISIBLE_EDGE_SAMPLES = 48; // per viewport edge
const VISIBLE_LIMB_SAMPLES = 192; // around the whole limb circle

// The lat range and the longitude range (relative to lambda0) of the
// part of the front hemisphere that falls inside the w×h viewport.
// phi and lambda have no critical points inside that region except at
// the poles, so their extremes lie on its boundary: the stretches of the
// viewport edges that are on the disc, plus the stretches of the limb
// that are inside the viewport. Those are sampled; a visible pole means
// every longitude is visible. Callers widen the result by one step.
function visibleRange(
  lambda0: number,
  phi0: number,
  R: number,
  cx: number,
  cy: number,
  w: number,
  h: number
): { phiLo: number; phiHi: number; dlLo: number; dlHi: number; allLongitudes: boolean } {
  let phiLo = phi0;
  let phiHi = phi0;
  let dlLo = 0;
  let dlHi = 0;
  const add = (x: number, y: number) => {
    const p = unproject(x, y, lambda0, phi0, R, cx, cy);
    if (!p) return;
    if (p.phi < phiLo) phiLo = p.phi;
    if (p.phi > phiHi) phiHi = p.phi;
    const dl = shortestDelta(lambda0, p.lambda);
    if (dl < dlLo) dlLo = dl;
    if (dl > dlHi) dlHi = dl;
  };
  for (let i = 0; i <= VISIBLE_EDGE_SAMPLES; i++) {
    const t = i / VISIBLE_EDGE_SAMPLES;
    add(t * w, 0);
    add(t * w, h);
    add(0, t * h);
    add(w, t * h);
  }
  const limbR = R * 0.999999; // just inside, so unproject never rejects it
  for (let i = 0; i < VISIBLE_LIMB_SAMPLES; i++) {
    const a = (i / VISIBLE_LIMB_SAMPLES) * Math.PI * 2;
    const x = cx + limbR * Math.cos(a);
    const y = cy + limbR * Math.sin(a);
    if (x >= 0 && x <= w && y >= 0 && y <= h) add(x, y);
  }
  let allLongitudes = false;
  for (const pole of [Math.PI / 2, -Math.PI / 2]) {
    const p = project(0, pole, lambda0, phi0, R, cx, cy);
    if (p && p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h) {
      allLongitudes = true;
      if (pole > phiHi) phiHi = pole;
      if (pole < phiLo) phiLo = pole;
    }
  }
  return { phiLo, phiHi, dlLo, dlHi, allLongitudes };
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

// Read-only probe for scripts/diagnostico.mjs (spec 016): the globe is one
// canvas with no DOM to measure, so the diagnostic reads the view state and
// last frame's projected clusters from here. Nothing in it writes state.
// Cluster x/y are relative to the canvas box, exactly as hit-testing uses them.
type AtlasProbe = {
  state: () => { R: number; lambda0: number; phi0: number; minR: number; maxR: number; width: number; height: number };
  clusters: () => { x: number; y: number; opacity: number; srcs: string[] }[];
  latticeCount: () => { visited: number; drawn: number; ms: number }; // ms: time spent walking/painting the lattice
  localMasks: () => string[]; // files of the local masks loaded so far
  tour: () => string[]; // every mark's src, in tour order (spec 016, amendment 3)
};
declare global {
  interface Window {
    __atlas?: AtlasProbe;
  }
}

function clusterKey(cluster: Cluster): string {
  return cluster.members.map((m) => m.mark.src).join("|");
}

export default function Atlas({ marks }: { marks: AtlasMark[] }) {
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
  // The photo viewer (spec 016): which photos are open and which one shows.
  // Fixed once opened — if the group later splits under zoom, it stays.
  // The viewer walks the whole archive in tour order (`marks` arrives in
  // that order, spec 016 amendment 3); `index` is the photo showing.
  const [viewer, setViewer] = useState<{ index: number } | null>(null);
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
  // One slot per LOCAL_LEVELS entry, null until loaded; zones already asked for.
  const localMasksRef = useRef<(LoadedMask | null)[]>(LOCAL_LEVELS.map(() => null));
  const zonesRequestedRef = useRef(new Set<number>());
  const aliveRef = useRef(true);
  // R the current angular step was derived from, and that step.
  const latticeRef = useRef<{ R: number; delta: number } | null>(null);

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
  // R easing back down to the ceiling (see tick). Interpolated in log
  // space: zoom reads as a ratio, and a linear ease from millions of px
  // down to thousands would spend almost all of it invisibly.
  const zoomBackRef = useRef<{ from: number; to: number; startedAt: number } | null>(null);
  // How far left of the canvas centre the globe's centre sits: half the
  // viewer's width while it is open, so the globe centres in the space
  // left free; eased with the recenter's curve (at once, reduced motion).
  const centerShiftRef = useRef<{ value: number; from: number; to: number; startedAt: number | null }>({
    value: 0,
    from: 0,
    to: 0,
    startedAt: null,
  });

  const recenterRef = useRef<{
    fromLambda: number;
    fromPhi: number;
    toLambda: number;
    toPhi: number;
    startedAt: number;
    onDone: () => void;
    // Set by a click on a group: R eases from fromR to toR alongside the
    // rotation (in log space, like the zoom back to the ceiling).
    fromR?: number;
    toR?: number;
    // A flight (flyTo): share of the way travelled and R, for the eased
    // time; overrides the plain interpolation above.
    path?: (eased: number) => { f: number; R: number };
    duration?: number; // RECENTER_MS unless set
  } | null>(null);

  // Last frame's projected marks/clusters — pointer handlers (hover,
  // click hit-testing) read this rather than recomputing projections
  // themselves, so hit-testing is always consistent with what's
  // actually on screen.
  const lastClustersRef = useRef<Cluster[]>([]);
  // Lattice points walked and dots painted in the last pass, and its cost — probe only.
  const lastLatticeRef = useRef({ visited: 0, drawn: 0, ms: 0 });

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
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (idleDriftTimeoutRef.current !== null) clearTimeout(idleDriftTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const probe: AtlasProbe = {
      state: () => ({
        R: RRef.current,
        lambda0: lambda0Ref.current,
        phi0: phi0Ref.current,
        minR: zoomBoundsRef.current.minR,
        maxR: currentMaxR(),
        width: viewportSizeRef.current.width,
        height: viewportSizeRef.current.height,
      }),
      clusters: () =>
        lastClustersRef.current.map((c) => ({ x: c.x, y: c.y, opacity: c.opacity, srcs: c.members.map((m) => m.mark.src) })),
      latticeCount: () => ({ ...lastLatticeRef.current }),
      tour: () => marks.map((m) => m.src),
      localMasks: () => LOCAL_LEVELS.filter((_, i) => localMasksRef.current[i]).map((l) => l.file),
    };
    window.__atlas = probe;
    return () => {
      if (window.__atlas === probe) delete window.__atlas;
    };
  }, [marks]);

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

  // React's JSX onWheel is registered as a passive listener, and
  // passive listeners can't call preventDefault — it throws ("Unable to
  // preventDefault inside passive event listener invocation") rather
  // than silently doing nothing. Wheel-zoom needs preventDefault (to
  // stop the page from doing anything else with the gesture), so this
  // has to be a real addEventListener with { passive: false }. The
  // effect attaches once; a "latest" ref is what keeps it seeing
  // the current minimum without needing to re-attach on every resize
  // (the maximum is read live, from currentMaxR()).
  const zoomBoundsRef = useRef({ minR });
  useEffect(() => {
    zoomBoundsRef.current = { minR };
  });
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { minR } = zoomBoundsRef.current;
      const factor = Math.pow(1.0015, -e.deltaY);
      zoomBackRef.current = null;
      if (recenterRef.current?.toR !== undefined) recenterRef.current = null; // the wheel takes over the zoom
      RRef.current = Math.min(currentMaxR(), Math.max(minR, RRef.current * factor));
      scheduleIdleDrift();
      requestFrame();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed R the first time the viewport is known (default framing: whole
  // globe comfortably inside the shorter dimension); on every LATER
  // resize, re-clamp the user's current R into [minR, currentMaxR()]
  // instead — minR is derived from viewportSize, so a window change can
  // otherwise leave R outside it indefinitely (nothing else re-checks it
  // until the next wheel/pinch). Clamping, not reseeding, preserves whatever zoom level the
  // visitor actually chose across a resize. draw()'s own R-drift check
  // (LATTICE_REBUILD_RATIO) picks up the corrected R on the very next
  // frame and resamples the lattice if it moved enough to matter.
  useEffect(() => {
    if (viewportSize.width === 0 || viewportSize.height === 0) return;
    if (RRef.current === 0) {
      RRef.current = Math.min(viewportSize.width, viewportSize.height) * 0.42;
    } else {
      RRef.current = Math.min(currentMaxR(), Math.max(minR, RRef.current));
    }
    requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportSize, minR]);

  // Load + decode the land mask once. Until it's ready the globe still
  // renders — background, marks if any — just without dots yet; a 22KB
  // PNG decodes fast enough that this is essentially never visible, and
  // there's no artificial minimum-duration loading state for it.
  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const mask = packMask(img, img.naturalWidth, img.naturalHeight);
      if (!mask) return;
      maskRef.current = mask;
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

  // The zoom ceiling at the current centre: the resolution limit of the
  // finest LOADED local level containing it (capped at its zone's need),
  // or WORLD_MAX_R outside every zone. Only loaded levels count — zooming
  // past what is on hand would draw the world mask's 20 km steps.
  function currentMaxR(): number {
    const lat = phi0Ref.current / DEG;
    const lng = lngDeg(lambda0Ref.current);
    let limit = WORLD_MAX_R;
    LOCAL_LEVELS.forEach((l, i) => {
      if (l.capR > limit && localMasksRef.current[i] && inLevel(l, lat, lng)) limit = l.capR;
    });
    return limit;
  }

  // Lazy load: a zone's levels are fetched, coarsest first, the first time
  // R passes LOCAL_PRELOAD_RATIO x WORLD_MAX_R with the centre inside its
  // outermost level — early enough that the first level is normally in
  // before R reaches WORLD_MAX_R, where the ceiling would stop it.
  function maybeLoadLocal(R: number) {
    if (R < WORLD_MAX_R * LOCAL_PRELOAD_RATIO) return;
    requestZonesAt(phi0Ref.current / DEG, lngDeg(lambda0Ref.current));
  }

  // The highest ceiling this point can ever have: the finest level of any
  // zone that covers it, loaded or not; WORLD_MAX_R outside every zone.
  function possibleMaxR(lat: number, lng: number): number {
    let limit = WORLD_MAX_R;
    for (const l of LOCAL_LEVELS) if (l.capR > limit && inLevel(l, lat, lng)) limit = l.capR;
    return limit;
  }

  function requestZonesAt(lat: number, lng: number) {
    atlasZones.zones.forEach((z, zone) => {
      if (zonesRequestedRef.current.has(zone)) return;
      const [s, w, n, e] = z.levels[0].bbox;
      if (lat < s || lat >= n || lng < w || lng >= e) return;
      zonesRequestedRef.current.add(zone);
      void (async () => {
        for (const level of z.levels) {
          const i = LOCAL_LEVELS.findIndex((l) => l.file === level.file);
          const mask = await decodeMask(level.file).catch(() => null);
          if (!aliveRef.current) return;
          if (!mask) continue; // the world mask keeps drawing there, and the ceiling stays where it was
          localMasksRef.current[i] = { ...mask, loadedAt: nowMs() };
          requestFrame();
        }
      })();
    });
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
      const t = Math.min(1, (now - recenter.startedAt) / (recenter.duration ?? RECENTER_MS));
      const eased = recenter.path ? easeInOutSine(t) : easeOutCubic(t);
      const step = recenter.path ? recenter.path(eased) : null;
      const f = step ? step.f : eased;
      lambda0Ref.current = recenter.fromLambda + shortestDelta(recenter.fromLambda, recenter.toLambda) * f;
      phi0Ref.current = recenter.fromPhi + (recenter.toPhi - recenter.fromPhi) * f;
      if (step) {
        RRef.current = step.R;
      } else if (recenter.fromR !== undefined && recenter.toR !== undefined) {
        RRef.current = recenter.fromR * Math.pow(recenter.toR / recenter.fromR, eased);
      }
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
      if (Math.hypot(velocityRef.current.lambda, velocityRef.current.phi) < INERTIA_STOP_RAD * navScale(RRef.current)) {
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
      lambda0Ref.current += IDLE_DRIFT_DEG_PER_SEC * DEG * navScale(RRef.current) * (dtMs / 1000);
      stillActive = true;
    }

    // The centre may have just left a zone (or a finer level of one):
    // R eases back to the new ceiling with the recenter's curve, or jumps
    // there under reduced motion. Re-entering mid-way cancels it.
    // Not while a click is zooming in: its target was checked against the
    // ceiling the destination can have (possibleMaxR), and the masks that
    // raise it were requested at the click, possibly still arriving.
    const limit = recenterRef.current?.toR !== undefined ? Infinity : currentMaxR();
    let back = zoomBackRef.current;
    if (back && back.from <= limit) back = zoomBackRef.current = null;
    if (!back && RRef.current > limit) {
      if (reducedMotionRef.current) RRef.current = limit;
      else back = zoomBackRef.current = { from: RRef.current, to: limit, startedAt: now };
    }
    if (back) {
      back.to = limit;
      const t = Math.min(1, (now - back.startedAt) / ZOOM_BACK_MS);
      RRef.current = back.from * Math.pow(back.to / back.from, easeOutCubic(t));
      if (t >= 1) zoomBackRef.current = null;
      else stillActive = true;
    }

    const shift = centerShiftRef.current;
    if (shift.startedAt !== null) {
      const t = Math.min(1, (now - shift.startedAt) / RECENTER_MS);
      shift.value = shift.from + (shift.to - shift.from) * easeOutCubic(t);
      if (t >= 1) shift.startedAt = null;
      else stillActive = true;
    }

    if (draw()) stillActive = true;

    if (stillActive) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }

  function clampPhi0(phi0: number): number {
    const limit = PHI0_CLAMP_DEG * DEG;
    return Math.min(limit, Math.max(-limit, phi0));
  }

  // Returns true while a local mask is still fading in (the caller keeps
  // the loop running for it).
  function draw(): boolean {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const vp = viewportSizeRef.current;
    if (!canvas || !ctx || vp.width === 0) return false;

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
    if (R === 0) return false;
    const cx = w / 2 - centerShiftRef.current.value;
    const cy = h / 2;
    const lambda0 = lambda0Ref.current;
    const phi0 = phi0Ref.current;

    // Re-derive the angular step only when R has drifted more than
    // LATTICE_REBUILD_RATIO since the last one — on-screen dot spacing
    // stays pinned to TARGET_PX at every zoom level instead of degrading
    // as R grows, and between re-derivations the dots stay put.
    const mask = maskRef.current;
    let fading = false;
    const latticeStart = nowMs();
    if (mask) {
      const cached = latticeRef.current;
      if (!cached || Math.abs(R - cached.R) / cached.R > LATTICE_REBUILD_RATIO) {
        latticeRef.current = { R, delta: TARGET_PX / R };
      }
      const delta = latticeRef.current!.delta;
      const latMin = LAT_MIN_DEG * DEG;
      const latMax = LAT_MAX_DEG * DEG;
      const range = visibleRange(lambda0, phi0, R, cx, cy, w, h);

      // Local levels that are loaded and overlap the view, finest first,
      // each with its blend weight: 0 below LOCAL_PRELOAD_RATIO, ramping
      // to 1 over LOCAL_BLEND_RATIO, and also ramping in over
      // MASK_FADE_MS after it arrives (at once under reduced motion).
      maybeLoadLocal(R);
      const zoomWeight = Math.min(1, Math.max(0, (R / WORLD_MAX_R - LOCAL_PRELOAD_RATIO) / LOCAL_BLEND_RATIO));
      const active: { level: LocalLevel; mask: LoadedMask; weight: number }[] = [];
      if (zoomWeight > 0) {
        const now = nowMs();
        const pad = delta / DEG;
        const latLo = range.phiLo / DEG - pad;
        const latHi = range.phiHi / DEG + pad;
        const lngLo = lngDeg(lambda0 + range.dlLo) - pad;
        const lngHi = lngLo + (range.dlHi - range.dlLo) / DEG + 2 * pad;
        LOCAL_LEVELS.forEach((level, i) => {
          const local = localMasksRef.current[i];
          if (!local || level.n < latLo || level.s > latHi) return;
          const lngHit = range.allLongitudes || [0, 360, -360].some((k) => level.w + k <= lngHi && level.e + k >= lngLo);
          if (!lngHit) return;
          const fade = reducedMotionRef.current ? 1 : Math.min(1, (now - local.loadedAt) / MASK_FADE_MS);
          if (fade < 1) fading = true;
          active.push({ level, mask: local, weight: zoomWeight * fade });
        });
      }
      // 0..1: how much land is at (lat, lng) — the finest covering mask,
      // cross-faded with the next coarser one while its weight is < 1.
      // `row` is the subset of `active` whose latitudes contain the row.
      const landAt = (row: typeof active, lat: number, lng: number, from: number): number => {
        for (let a = from; a < row.length; a++) {
          const { level, mask: local, weight } = row[a];
          if (!inLevel(level, lat, lng)) continue;
          const cur = sampleLocal(local, level, lat, lng) ? 1 : 0;
          if (weight >= 1) return cur;
          const prev = landAt(row, lat, lng, a + 1);
          return prev + (cur - prev) * weight;
        }
        return sampleLand(mask, lat, lng) ? 1 : 0;
      };
      const kLo = Math.max(0, Math.ceil((range.phiLo - delta - latMin) / delta));
      const kHi = Math.floor((Math.min(latMax, range.phiHi + delta) - latMin) / delta);
      ctx.fillStyle = COLOR_DOT;
      const r = DOT_RADIUS_PX;
      let drawn = 0;
      let visited = 0;
      // project() inlined, with everything that is constant per frame or
      // per row hoisted out of the inner loop — same formulas, same
      // values. Painting was the real cost, not the maths: one fillRect
      // per dot is one draw call each (measured up to ~60 ms for ~15k
      // dots, on HEAD as much as here, 2026-11-02). Fully opaque dots now
      // go into ONE path filled once; only the limb band (alpha < 1) is
      // still painted dot by dot. Dots off the canvas are skipped.
      const sinPhi0 = Math.sin(phi0);
      const cosPhi0 = Math.cos(phi0);
      const limbDots: number[] = []; // x, y, alpha triples
      const cull = r + 2; // the buffer is rounded up from the CSS box (608.5 -> 609 px at 1440x900)
      ctx.beginPath();
      for (let k = kLo; k <= kHi; k++) {
        const phi = latMin + k * delta;
        if (phi > latMax) break;
        const latDeg = phi / DEG;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        const row = active.length ? active.filter((a) => latDeg >= a.level.s && latDeg < a.level.n) : active;
        const lngStep = delta / Math.cos(phi);
        // Columns in a row: lambda = -PI + j·lngStep while lambda < PI.
        const n = Math.ceil((Math.PI * 2) / lngStep - 1e-9);
        // The row's front-hemisphere half-width: cosc >= 0 exactly when
        // cos(dl) >= -tan(phi)·tan(phi0). Intersected with the view's
        // longitude range, it keeps the walk off the far side of the
        // globe, which the view's lat/lng box alone does not (measured:
        // 37k points walked at R ≈ 630 for ~18k that can show).
        const t = -Math.tan(phi) * Math.tan(phi0);
        if (t >= 1) continue;
        const half = t <= -1 ? Math.PI : Math.acos(t);
        const dlLo = range.allLongitudes ? -half : Math.max(range.dlLo, -half);
        const dlHi = range.allLongitudes ? half : Math.min(range.dlHi, half);
        let jLo = 0;
        let jHi = n - 1;
        if (dlHi - dlLo + 2 * lngStep < Math.PI * 2) {
          jLo = Math.ceil((lambda0 + dlLo - lngStep + Math.PI) / lngStep);
          jHi = Math.floor((lambda0 + dlHi + lngStep + Math.PI) / lngStep);
        }
        for (let j = jLo; j <= jHi; j++) {
          const jn = ((j % n) + n) % n;
          const lambda = -Math.PI + jn * lngStep;
          visited++;
          const land = row.length ? landAt(row, latDeg, lambda / DEG, 0) : sampleLand(mask, latDeg, lambda / DEG) ? 1 : 0;
          if (land <= 0) continue;
          const dl = lambda - lambda0;
          const cosDl = Math.cos(dl);
          const cosc = sinPhi0 * sinPhi + cosPhi0 * cosPhi * cosDl;
          if (cosc < 0) continue;
          const op = limbOpacity(cosc) * land;
          if (op <= 0) continue;
          const x = cx + R * cosPhi * Math.sin(dl);
          const y = cy - R * (cosPhi0 * sinPhi - sinPhi0 * cosPhi * cosDl);
          if (x < -cull || x > w + cull || y < -cull || y > h + cull) continue;
          if (op >= 1) ctx.rect(x - r, y - r, r * 2, r * 2);
          else limbDots.push(x, y, op);
          drawn++;
        }
      }
      ctx.fill();
      for (let i = 0; i < limbDots.length; i += 3) {
        ctx.globalAlpha = limbDots[i + 2];
        ctx.fillRect(limbDots[i] - r, limbDots[i + 1] - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      lastLatticeRef.current = { visited, drawn, ms: nowMs() - latticeStart };
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
    return fading;
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
    // A click's recenter cut short never opens its viewer: undo its shift.
    if (!viewer) setCenterShift(0);

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
      zoomBackRef.current = null;
      RRef.current = Math.min(currentMaxR(), Math.max(minR, newR));
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
        inertiaActiveRef.current = speed >= INERTIA_STOP_RAD * navScale(RRef.current);
      }
      scheduleIdleDrift();
      requestFrame();
    }
  }

  function startRecenter(
    toLambda: number,
    toPhi: number,
    onDone: () => void,
    toR?: number,
    flight?: { path: (eased: number) => { f: number; R: number }; duration: number }
  ) {
    inertiaActiveRef.current = false;
    zoomBackRef.current = null;
    if (reducedMotionRef.current) {
      if (toR !== undefined) RRef.current = toR;
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
      ...(toR !== undefined ? { fromR: RRef.current, toR } : {}),
      ...(flight ?? {}),
    };
    requestFrame();
  }

  function handleClick(x: number, y: number) {
    const cluster = findClusterAt(x, y);
    if (!cluster) return;

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
      // A group that can still split zooms in until it does (spec 016,
      // amendment 2); one that can't — every photo on one point, or the
      // split needing more zoom than this place can ever have — opens.
      const targetR = splitR(cluster.members.map(({ mark }) => mark));
      const lat = toPhi / DEG;
      const lng = lngDeg(toLambda);
      if (targetR <= possibleMaxR(lat, lng)) {
        requestZonesAt(lat, lng);
        startRecenter(toLambda, toPhi, () => {}, Math.max(RRef.current, targetR));
        return;
      }
    }
    // A group that can't split, or a single photo: zoom in to a regional
    // view (never out), then open the viewer on it — the single photo no
    // longer jumps to its album (spec 016, decision 2; amendment 2).
    const vp = viewportSizeRef.current;
    // Members come in tour order: the viewer opens on the first of them,
    // inside the whole tour (spec 016, amendment 3), at that photo's zoom.
    const first = Math.min(...cluster.members.map(({ index }) => index));
    // The globe moves into the space the viewer will leave free in the
    // same motion as the rotation, not as a second step once it opens.
    setCenterShift(atlasViewerWidth(vp.width) / 2);
    flyTo(toLambda, toPhi, photoR(first), () => setViewer({ index: first }));
  }

  // Rotate and zoom to (toLambda, toPhi) at toR along flyPath (see
  // FLY_RHO); the tour's steps and the clicks that open the viewer.
  function flyTo(toLambda: number, toPhi: number, toR: number, onDone: () => void) {
    const vp = viewportSizeRef.current;
    const span = Math.min(vp.width, vp.height);
    const R = RRef.current;
    const p0 = phi0Ref.current;
    const cosD =
      Math.sin(p0) * Math.sin(toPhi) + Math.cos(p0) * Math.cos(toPhi) * Math.cos(toLambda - lambda0Ref.current);
    const u1 = Math.acos(Math.min(1, Math.max(-1, cosD)));
    const w0 = span / R;
    const w1 = span / toR;
    const { S, at } = flyPath(u1, w0, w1);
    const duration = Math.min(FLY_MAX_MS, Math.max(FLY_MIN_MS, S * FLY_MS_PER_S));
    const minR = zoomBoundsRef.current.minR;
    startRecenter(toLambda, toPhi, onDone, toR, {
      duration,
      path: (eased) => {
        if (eased >= 1) return { f: 1, R: toR };
        const { u, w } = at(S * eased);
        return { f: u1 < 1e-12 ? 1 : Math.min(1, u / u1), R: Math.max(minR, span / w) };
      },
    });
  }

  // The zoom a photo is shown at, from the viewer (Javi, 2026-11-02: "en
  // ny el zoom tiene que llegar hasta la foto individual"): just enough
  // for its mark to stand alone, CLICK_SPLIT_MARGIN times the cluster
  // threshold from the nearest photo at a DIFFERENT point (photos sharing
  // its point never separate, so they don't count). Never above what that
  // place can reach (possibleMaxR: San Miguel stays at the world limit),
  // never below the regional view. Asks for the zone's masks if it needs them.
  function photoR(index: number): number {
    const mark = marks[index];
    const vp = viewportSizeRef.current;
    const regionR = Math.min(vp.width, vp.height) / (CLICK_REGION_KM / EARTH_KM);
    if (!mark) return regionR;
    const a = mark.lat * DEG;
    let nearest = Infinity;
    for (const o of marks) {
      // Same point, compared exactly: acos of a dot product near 1 rounds
      // to ~1e-8 rad, not 0 (measured on San Blas' two photos, 2026-11-02).
      if (o.lat === mark.lat && o.lng === mark.lng) continue;
      const b = o.lat * DEG;
      const c = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos((o.lng - mark.lng) * DEG);
      const d = Math.acos(Math.min(1, Math.max(-1, c)));
      if (d < nearest) nearest = d;
    }
    const lng = lngDeg(mark.lng * DEG);
    // A photo that shares its point with another can never stand alone;
    // it is shown in context instead, with the nearest other place
    // CONTEXT_SHARE of the canvas's shorter side away (Javi, 2026-11-02:
    // Villaquiran "apenas tiene zoom cuando se podria enfocar un poco la
    // peninsula").
    const twin = marks.some((o) => o !== mark && o.lat === mark.lat && o.lng === mark.lng);
    // Context never goes past the world mask's limit: deeper zoom, inside
    // a zone, is only ever for separating photos.
    const alone = (CLUSTER_THRESHOLD_PX * CLICK_SPLIT_MARGIN) / nearest;
    const separate = twin
      ? Math.max(alone, Math.min(WORLD_MAX_R, (CONTEXT_SHARE * Math.min(vp.width, vp.height)) / nearest))
      : alone;
    const target = Math.max(regionR, Math.min(possibleMaxR(mark.lat, lng), separate));
    if (target > WORLD_MAX_R * LOCAL_PRELOAD_RATIO) requestZonesAt(mark.lat, lng);
    return target;
  }

  // Takes the globe to the tour's photo `index`, at that photo's zoom.
  function goToTourPhoto(index: number) {
    const mark = marks[index];
    if (!mark) return;
    flyTo(mark.lng * DEG, mark.lat * DEG, photoR(index), () => {});
  }

  function showTourPhoto(index: number) {
    setViewer({ index });
    goToTourPhoto(index);
  }

  function openTour() {
    setCenterShift(atlasViewerWidth(viewportSizeRef.current.width) / 2);
    showTourPhoto(0);
  }

  function setCenterShift(to: number) {
    const shift = centerShiftRef.current;
    if (shift.to === to && shift.startedAt === null && shift.value === to) return;
    if (reducedMotionRef.current) {
      Object.assign(shift, { value: to, from: to, to, startedAt: null });
    } else {
      Object.assign(shift, { from: shift.value, to, startedAt: nowMs() });
    }
    requestFrame();
  }

  function resetToDefault() {
    setViewer(null);
    startRecenter(DEFAULT_LAMBDA0_DEG * DEG, DEFAULT_PHI0_DEG * DEG, () => {});
    const targetR = Math.min(viewportSize.width, viewportSize.height) * 0.42;
    RRef.current = targetR; // radius itself doesn't need the angular recenter easing
  }

  const viewerOpen = viewer !== null;
  const viewerW = atlasViewerWidth(viewportSize.width);
  useEffect(() => {
    setCenterShift(viewerOpen ? viewerW / 2 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerOpen, viewerW]);

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

      {/* Photo viewer (spec 016) — replaces the old cluster list panel
          and the single photo's jump to its album. */}
      {viewer && (
        <AtlasViewer marks={marks} index={viewer.index} width={viewerW} onIndex={showTourPhoto} onClose={() => setViewer(null)} />
      )}

      {/* Legend + reset control. The OpenStreetMap credit is required by
          the ODbL for the local coastline masks (spec 016); it lives here,
          with the legend, and only on the atlas (Javi, 2026-11-01). */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-col gap-1.5 md:bottom-6 md:left-6">
        <div className="flex items-center gap-2 text-[12px] text-[#666]">
          <svg width="10" height="10" aria-hidden>
            <circle cx="5" cy="5" r="4" fill={COLOR_MARK} />
          </svg>
          <span>Exact location</span>
          <svg width="10" height="10" aria-hidden className="ml-3">
            <circle cx="5" cy="5" r="4" fill="none" stroke={COLOR_MARK} strokeWidth="1" />
          </svg>
          <span>Approximate (city)</span>
        </div>
        <span className="text-[11px] text-[#A8A8A8]">
          Map data ©{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto hover:text-[#666]"
          >
            OpenStreetMap
          </a>{" "}
          contributors
        </span>
      </div>

      <div
        style={viewer ? { right: viewerW + 24 } : undefined}
        className="absolute bottom-4 right-4 flex items-center gap-6 text-[12px] uppercase tracking-[0.14em] text-[#666] md:bottom-6 md:right-6"
      >
        {/* The tour's entrance (spec 016, amendment 3): the viewer on the
            first photo of the whole archive, the globe flying to it. */}
        {!viewer && marks.length > 0 && (
          <button type="button" data-atlas-tour onClick={openTour} className="uppercase hover:text-[#111]">
            View All Photographs
          </button>
        )}
        <button type="button" onClick={resetToDefault} className="uppercase hover:text-[#111]">
          Reset View
        </button>
      </div>
    </div>
  );
}

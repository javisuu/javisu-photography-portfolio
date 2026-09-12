"use client";

// A schematic world map, hand-rolled — no map library, no GL tube
// renderer (this is a map, not a gallery). Equirectangular projection
// (x = (lng+180)/360 * W, y = (90-lat)/180 * H) needs no library to plot;
// pan/zoom is one scale+translate transform on a single <g>, driven
// directly by wheel/drag/pinch (see the pointer handlers below).
//
// Landmass is a static, pre-computed dot grid (src/data/atlas-land-dots.json
// — see scripts/generate-atlas-dots.mjs and docs/atlas-data-sources.md for
// where it comes from and its license). No geometry processing happens
// here at all, just plotting fixed points.

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import landDots from "@/data/atlas-land-dots.json";
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

// World-space units — arbitrary but fixed; equirectangular preserves
// aspect ratio (360:180 = 2:1), which is why land-dots.json's spacing
// reads as uniform on screen at any zoom.
const MAP_WIDTH = 960;
const MAP_HEIGHT = 480;

// Roughly "a city fills the view" relative to the "world fits" scale — a
// city spans on the order of a few tenths of a degree, the world 360,
// so this needs to be a large multiplier, not a small one.
const MAX_ZOOM_MULTIPLIER = 1400;

// Marks within this many CSS px of each other (at the current zoom)
// merge into one cluster.
const CLUSTER_THRESHOLD_PX = 14;

const DOT_RADIUS = 2.2;
const EXACT_MARK_RADIUS = 5;
const CITY_MARK_RADIUS = 7;

function project(lat: number, lng: number) {
  return {
    x: ((lng + 180) / 360) * MAP_WIDTH,
    y: ((90 - lat) / 180) * MAP_HEIGHT,
  };
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

type View = { scale: number; offsetX: number; offsetY: number };

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

export default function Atlas({ marks }: { marks: AtlasMark[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState<View | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  // Dragging + pinch bookkeeping lives in refs, not state — it updates
  // every pointermove and doesn't need to trigger its own re-render logic
  // beyond the view state changes it produces.
  const dragRef = useRef<{ startX: number; startY: number; startView: View } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ startDist: number; startView: View; midWorld: { x: number; y: number } } | null>(null);

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

  const minScale = useMemo(() => {
    if (viewportSize.width === 0) return 1;
    return Math.min(viewportSize.width / MAP_WIDTH, viewportSize.height / MAP_HEIGHT);
  }, [viewportSize]);
  const maxScale = minScale * MAX_ZOOM_MULTIPLIER;

  const worldViewCentered = useCallback(
    (scale: number): View => ({
      scale,
      offsetX: (viewportSize.width - MAP_WIDTH * scale) / 2,
      offsetY: (viewportSize.height - MAP_HEIGHT * scale) / 2,
    }),
    [viewportSize]
  );

  // Initial framing: bounding box of the photos that actually have
  // coordinates, plus a generous margin — computed from the data, so it
  // reframes itself as more get filled in. Zooming out to the full world
  // stays available via the reset control.
  const initialView = useMemo((): View | null => {
    if (viewportSize.width === 0) return null;
    if (marks.length === 0) return worldViewCentered(minScale);

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const m of marks) {
      minLat = Math.min(minLat, m.lat);
      maxLat = Math.max(maxLat, m.lat);
      minLng = Math.min(minLng, m.lng);
      maxLng = Math.max(maxLng, m.lng);
    }
    const MARGIN_DEG = 8;
    minLat = Math.max(-90, minLat - MARGIN_DEG);
    maxLat = Math.min(90, maxLat + MARGIN_DEG);
    minLng = Math.max(-180, minLng - MARGIN_DEG);
    maxLng = Math.min(180, maxLng + MARGIN_DEG);

    const topLeft = project(maxLat, minLng);
    const bottomRight = project(minLat, maxLng);
    const bboxWidth = Math.max(1, bottomRight.x - topLeft.x);
    const bboxHeight = Math.max(1, bottomRight.y - topLeft.y);

    const fitScale = Math.min(viewportSize.width / bboxWidth, viewportSize.height / bboxHeight);
    const scale = Math.min(maxScale, Math.max(minScale, fitScale));

    const centerWorld = { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 };
    return {
      scale,
      offsetX: viewportSize.width / 2 - centerWorld.x * scale,
      offsetY: viewportSize.height / 2 - centerWorld.y * scale,
    };
  }, [marks, viewportSize, minScale, maxScale, worldViewCentered]);

  // `view` stays null until the user's first actual interaction (or a
  // reset-to-world click) sets it — rendering and interaction handlers
  // fall back to the computed initialView until then. This avoids ever
  // needing an effect to copy initialView into view state.
  const effectiveView = view ?? initialView;

  const clampView = useCallback(
    (v: View): View => {
      const scale = Math.min(maxScale, Math.max(minScale, v.scale));
      const mapPxWidth = MAP_WIDTH * scale;
      const mapPxHeight = MAP_HEIGHT * scale;

      let offsetX: number;
      if (mapPxWidth <= viewportSize.width) {
        offsetX = (viewportSize.width - mapPxWidth) / 2;
      } else {
        offsetX = Math.min(0, Math.max(viewportSize.width - mapPxWidth, v.offsetX));
      }

      let offsetY: number;
      if (mapPxHeight <= viewportSize.height) {
        offsetY = (viewportSize.height - mapPxHeight) / 2;
      } else {
        offsetY = Math.min(0, Math.max(viewportSize.height - mapPxHeight, v.offsetY));
      }

      return { scale, offsetX, offsetY };
    },
    [minScale, maxScale, viewportSize]
  );

  const zoomToward = useCallback(
    (cursorX: number, cursorY: number, newScale: number, base: View) => {
      const worldX = (cursorX - base.offsetX) / base.scale;
      const worldY = (cursorY - base.offsetY) / base.scale;
      return clampView({
        scale: newScale,
        offsetX: cursorX - worldX * newScale,
        offsetY: cursorY - worldY * newScale,
      });
    },
    [clampView]
  );

  // React's JSX onWheel is registered as a passive listener, and passive
  // listeners can't call preventDefault — it throws ("Unable to
  // preventDefault inside passive event listener invocation") rather
  // than silently doing nothing. Wheel-zoom needs preventDefault (to stop
  // the page/container from doing anything else with the gesture), so
  // this has to be a real addEventListener with { passive: false }. The
  // effect runs once; a "latest" ref (below) is what keeps it seeing
  // current state without needing to re-attach on every change.
  const latestRef = useRef({ effectiveView, minScale, maxScale, zoomToward });
  useEffect(() => {
    latestRef.current = { effectiveView, minScale, maxScale, zoomToward };
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      const { effectiveView, minScale, maxScale, zoomToward } = latestRef.current;
      if (!effectiveView) return;
      e.preventDefault();
      const rect = el!.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const factor = Math.pow(1.0015, -e.deltaY);
      const newScale = Math.min(maxScale, Math.max(minScale, effectiveView.scale * factor));
      setView(zoomToward(cursorX, cursorY, newScale, effectiveView));
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!effectiveView) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const rect = containerRef.current!.getBoundingClientRect();
    pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (pointersRef.current.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, startView: effectiveView };
      setIsDragging(true);
    } else if (pointersRef.current.size === 2) {
      dragRef.current = null;
      setIsDragging(false);
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      pinchRef.current = {
        startDist: dist,
        startView: effectiveView,
        midWorld: { x: (mid.x - effectiveView.offsetX) / effectiveView.scale, y: (mid.y - effectiveView.offsetY) / effectiveView.scale },
      };
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!effectiveView) return;
    const rect = containerRef.current!.getBoundingClientRect();

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const { startDist, startView, midWorld } = pinchRef.current;
      const newScale = Math.min(maxScale, Math.max(minScale, startView.scale * (dist / startDist)));
      setView(
        clampView({
          scale: newScale,
          offsetX: mid.x - midWorld.x * newScale,
          offsetY: mid.y - midWorld.y * newScale,
        })
      );
      return;
    }

    if (dragRef.current) {
      const { startX, startY, startView } = dragRef.current;
      setView(
        clampView({
          scale: startView.scale,
          offsetX: startView.offsetX + (e.clientX - startX),
          offsetY: startView.offsetY + (e.clientY - startY),
        })
      );
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
      setIsDragging(false);
    }
  }

  // Clustering only depends on scale (a uniform translate can't change
  // relative screen distances), so it's memoized off scale alone, not
  // recomputed on every pan frame.
  const clusters = useMemo(() => {
    const scale = effectiveView?.scale ?? minScale;
    const positioned = marks.map((mark, index) => {
      const w = project(mark.lat, mark.lng);
      return { index, mark, sx: w.x * scale, sy: w.y * scale };
    });
    const used = new Set<number>();
    const groups: { index: number; mark: AtlasMark; sx: number; sy: number }[][] = [];
    for (let i = 0; i < positioned.length; i++) {
      if (used.has(i)) continue;
      const group = [positioned[i]];
      used.add(i);
      for (let j = i + 1; j < positioned.length; j++) {
        if (used.has(j)) continue;
        const closeToGroup = group.some(
          (g) => Math.hypot(g.sx - positioned[j].sx, g.sy - positioned[j].sy) < CLUSTER_THRESHOLD_PX
        );
        if (closeToGroup) {
          group.push(positioned[j]);
          used.add(j);
        }
      }
      groups.push(group);
    }
    return groups;
  }, [marks, effectiveView?.scale, minScale]);

  function resetToWorld() {
    setView(worldViewCentered(minScale));
  }

  const hoveredMark = hoveredIndex !== null ? marks[hoveredIndex] : null;
  const hoveredScreen =
    hoveredMark && effectiveView
      ? (() => {
          const w = project(hoveredMark.lat, hoveredMark.lng);
          return { x: effectiveView.offsetX + w.x * effectiveView.scale, y: effectiveView.offsetY + w.y * effectiveView.scale };
        })()
      : null;

  return (
    <div className="relative h-full w-full select-none">
      <div
        ref={containerRef}
        className="h-full w-full touch-none overflow-hidden"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
      >
        {effectiveView && (
          <svg width={viewportSize.width} height={viewportSize.height}>
            <g transform={`translate(${effectiveView.offsetX}, ${effectiveView.offsetY}) scale(${effectiveView.scale})`}>
              {/* Landmass — static pre-computed dot grid, see file header. */}
              {(landDots as [number, number][]).map(([lat, lng], i) => {
                const p = project(lat, lng);
                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={DOT_RADIUS / effectiveView.scale}
                    fill="#E2E2E2"
                  />
                );
              })}

              {/* Photo marks, clustered where close together at this zoom. */}
              {clusters.map((group) => {
                const centerX = group.reduce((sum, g) => sum + g.sx, 0) / group.length / effectiveView.scale;
                const centerY = group.reduce((sum, g) => sum + g.sy, 0) / group.length / effectiveView.scale;

                if (group.length > 1) {
                  const r = (EXACT_MARK_RADIUS + 3) / effectiveView.scale;
                  return (
                    <g
                      key={`cluster-${group[0].index}`}
                      className="cursor-pointer"
                      onClick={() => {
                        const newScale = Math.min(maxScale, effectiveView.scale * 4);
                        setView(
                          zoomToward(
                            centerX * effectiveView.scale + effectiveView.offsetX,
                            centerY * effectiveView.scale + effectiveView.offsetY,
                            newScale,
                            effectiveView
                          )
                        );
                      }}
                    >
                      <circle cx={centerX} cy={centerY} r={r} fill="#111111" />
                      <text
                        x={centerX}
                        y={centerY}
                        fill="#FAFAFA"
                        fontSize={9 / effectiveView.scale}
                        textAnchor="middle"
                        dominantBaseline="central"
                        style={{ pointerEvents: "none", fontFamily: "sans-serif" }}
                      >
                        {group.length}
                      </text>
                    </g>
                  );
                }

                const { mark, index } = group[0];
                const isExact = mark.precision === "exact";
                const r = (isExact ? EXACT_MARK_RADIUS : CITY_MARK_RADIUS) / effectiveView.scale;
                return (
                  <circle
                    key={mark.src}
                    cx={centerX}
                    cy={centerY}
                    r={r}
                    // "transparent", not "none" — an SVG shape with
                    // fill="none" is only hit-testable along its stroke
                    // line, so the whole interior of an unfilled "city"
                    // ring would be un-hoverable/unclickable. Transparent
                    // paints (invisibly) so the full disc counts as the
                    // hit area, matching what a user actually expects to
                    // be able to point at.
                    fill={isExact ? "#111111" : "transparent"}
                    stroke="#111111"
                    strokeWidth={isExact ? 0 : 1 / effectiveView.scale}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex((current) => (current === index ? null : current))}
                    onClick={() => router.push(`/album/${mark.album}#photo-${mark.albumPhotoIndex}`)}
                  />
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* Hover preview — plain <Image>, no GL, this is a map not a
          gallery. prefers-reduced-motion: no transition, just appear. */}
      {hoveredMark && hoveredScreen && (
        <div
          className={`pointer-events-none absolute z-10 flex max-w-[220px] gap-3 bg-[#FAFAFA] p-2 shadow-sm ${
            reducedMotion ? "" : "transition-opacity duration-150"
          }`}
          style={{
            left: Math.min(hoveredScreen.x + 14, viewportSize.width - 220),
            top: Math.min(hoveredScreen.y + 14, viewportSize.height - 100),
          }}
        >
          <Image
            src={hoveredMark.src}
            alt={hoveredMark.title}
            width={64}
            height={64}
            className="h-16 w-16 shrink-0 object-cover"
            sizes="64px"
          />
          <div className="flex flex-col justify-center gap-0.5">
            <span className="text-[12px] uppercase tracking-[0.14em] text-[#666]">
              {hoveredMark.city} · {hoveredMark.country}
            </span>
            {hoveredMark.precision === "exact" && (
              <span className="text-[11px] text-[#A8A8A8]">
                {toDMS(hoveredMark.lat, "N", "S")} {toDMS(hoveredMark.lng, "E", "W")}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Legend + reset control. */}
      <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 text-[12px] text-[#666] md:bottom-6 md:left-6">
        <svg width="10" height="10" aria-hidden>
          <circle cx="5" cy="5" r="4" fill="#111111" />
        </svg>
        <span>Exact location</span>
        <svg width="10" height="10" aria-hidden className="ml-3">
          <circle cx="5" cy="5" r="4" fill="none" stroke="#111111" strokeWidth="1" />
        </svg>
        <span>Approximate (city)</span>
      </div>

      <button
        type="button"
        onClick={resetToWorld}
        className="absolute bottom-4 right-4 text-[12px] uppercase tracking-[0.14em] text-[#666] hover:text-[#111] md:bottom-6 md:right-6"
      >
        World View
      </button>
    </div>
  );
}

"use client";

// Reusable WebGL2 "tube" renderer, extracted from the /lab/tube spike.
// Architecture: the caller lays out and animates a set of normal DOM
// elements exactly as before; this component reads their live
// getBoundingClientRect() every frame and paints a textured, bent plane
// in their place on a single full-viewport canvas. It owns none of the
// layout, scroll, or parallax — only the painting.
//
// The caller is responsible for hiding the mirrored elements, and MUST
// only do so once onAvailabilityChange fires true — see that prop.
//
// A plane's visibility is NOT purely "whatever the DOM node's rect says"
// — getBoundingClientRect() is a layout property, and CSS opacity is a
// paint-time one, so a caller hiding a node via `opacity: 0` on its
// PARENT (not the mirrored node itself) gets that respected too: each
// frame reads `node.parentElement.style.opacity` as a per-plane alpha
// multiplier (see uOpacity below). A caller that needs a mirrored node
// invisible must set opacity on that node's own parent, inline — nothing
// else in the ancestor chain is consulted.

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { Renderer, Camera, Transform, Plane, Program, Mesh, Texture } from "ogl";
import type Lenis from "lenis";

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

const SEGMENTS = 20; // subdivisions per axis — a 2-triangle quad can't bend
const FOV = 45; // degrees — paired with a camera distance computed in resize() so a plane at z=0 renders at exactly its DOM size

const VERTEX = `#version 300 es
precision highp float;

in vec3 position;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uAmount;        // 0..1, direction-independent
uniform float uBendDepth;     // multiplies the raw sagitta below
uniform float uRadius;        // cylinder radius, world px (viewport-height based)

out vec2 vUv;

void main() {
  vUv = uv;
  // The cylinder belongs to the VIEWPORT, not the plane: every vertex
  // bends based on its own SCREEN position, not its position within its
  // own element. worldPos.y IS screen Y here because the camera below is
  // calibrated so world units equal CSS pixels with no rotation/offset.
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float y = worldPos.y; // CSS px, 0 = screen centre — deliberately NOT
                         // clamped to the viewport, so the roll continues
                         // past the edges instead of flattening there.
  // True circular arc (sagitta): dz = R - sqrt(R^2 - y^2). uRadius must
  // exceed the viewport height or this plateaus exactly at the edge,
  // which reads as flat there.
  float dz = uRadius - sqrt(max(uRadius * uRadius - y * y, 0.0));
  vec3 pos = position;
  pos.z += uBendDepth * uAmount * dz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D tMap;
uniform float uOpacity; // per-plane alpha multiplier — see uOpacity note below
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec4 texColor = texture(tMap, vUv);
  fragColor = vec4(texColor.rgb, texColor.a * uOpacity);
}
`;

type PlaneRef = { node: HTMLImageElement; mesh: Mesh };
type PendingUpload = { texture: Texture; bitmap: ImageBitmap; index: number };

// Uploading is the expensive part (a synchronous gl.texImage2D per
// texture) — decoding is offloaded to createImageBitmap() so it never
// touches the main thread, but the upload itself still has to. Pacing it
// to a couple of textures per frame keeps any single frame from blocking
// on all of them at once (see the persistent-scene rationale below).
const UPLOADS_PER_FRAME = 2;

export type GLSurfaceProps = {
  /** Elements this surface mirrors — read fresh via getBoundingClientRect()
   * every frame. Whatever already moves them (scroll, CSS transforms,
   * parallax effects) flows through automatically; this component owns
   * none of that, only the painting. */
  nodes: RefObject<(HTMLImageElement | null)[]>;
  /** The same Lenis instance the caller already scrolls with — read only,
   * never constructed here. */
  lenisRef: RefObject<Lenis | null>;
  /** Multiplies the raw sagitta (see uRadius). Tune per-instance: a
   * landing wants spectacle, an album page wants barely perceptible. */
  bendDepth?: number;
  /** Cylinder radius, as a multiple of viewport height. Must exceed 1 or
   * the arc's plateau lands exactly at the viewport edge and reads flat
   * there. Smaller = tighter tube, larger = gentler. */
  bendRadiusMultiplier?: number;
  /** Raw Lenis velocity (px/frame) that maps to a full-strength [0, 1]
   * bend amount. Anything faster saturates rather than growing further. */
  velocityNormalize?: number;
  className?: string;
  /** Whether the paint loop should be actively rendering. Defaults to
   * true. Setting this false PAUSES rendering (stops requesting frames)
   * without tearing down the renderer, scene, meshes, or textures — the
   * whole point is a caller that's been navigated away from (e.g. the
   * landing, hidden via CSS rather than unmounted) can flip this back to
   * true later and resume painting instantly, with nothing to rebuild or
   * re-upload. Has no effect on the one-time decode/upload pipeline,
   * which always runs to completion regardless — pausing only affects
   * whether completed frames get painted. */
  active?: boolean;
  /** Fires once availability is known: true once a WebGL2/WebGL context
   * was created and the render loop is running; false if context
   * creation or setup failed for any reason. The caller MUST NOT hide
   * its mirrored nodes until this fires true — with the nodes already
   * hidden, a missing/failed context leaves the page blank. */
  onAvailabilityChange?: (available: boolean) => void;
  /** Fires once the first `readyNodeCount` nodes (default: all of them)
   * have had their texture uploaded to the GPU at least once (or
   * immediately, if there's nothing to wait for). Meant for callers that
   * want to gate a reveal/entrance on "nothing will pop in blank after
   * appearing." Defaulting to "all" is wrong for a caller mirroring any
   * lazy-loaded (`loading="lazy"`, the next/image default) or off-screen
   * node — that node's <img> may never even start fetching until the
   * user scrolls near it, so waiting on it here would simply never
   * resolve. Pass a smaller count to wait only on a leading, eagerly-
   * loaded subset instead (see LandingComposition, which restricts this
   * to its "above the fold at arrival" set). */
  onTexturesReady?: () => void;
  /** How many of `nodes` (from the front) must be texture-ready before
   * `onTexturesReady` fires. Defaults to all of them. */
  readyNodeCount?: number;
};

export default function GLSurface({
  nodes,
  lenisRef,
  bendDepth = 1,
  bendRadiusMultiplier = 1.2,
  velocityNormalize = 40,
  className,
  active = true,
  onAvailabilityChange,
  onTexturesReady,
  readyNodeCount,
}: GLSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // prefers-reduced-motion pins the bend to 0 (flat) — it does NOT fall
  // back to CSS. GL keeps painting either way; only the amount differs.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  // Read via refs inside the persistent effect below rather than taken as
  // dependencies, so toggling `active` or the OS reduced-motion setting
  // pauses/adjusts the existing loop instead of tearing down and
  // rebuilding the whole scene (destroying every texture) just to change
  // a flag mid-flight — exactly the rebuild this component exists to
  // avoid.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const reducedMotionRef = useRef(reducedMotion);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  // Lets the [active]-watching effect below restart a paint loop that
  // paused itself (see `update`'s early return) without needing access
  // to the closure that created it.
  const resumeRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (active) resumeRef.current?.();
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let raf = 0;
    let detachResize: (() => void) | undefined;

    try {
      const renderer = new Renderer({
        canvas,
        dpr: Math.min(window.devicePixelRatio, 2),
        alpha: true,
        // No depth buffer needed — overlaps are resolved by painter's
        // order (renderOrder below), not the depth test.
        depth: false,
      });
      const gl = renderer.gl;
      if (!gl) throw new Error("WebGL context unavailable");

      const camera = new Camera(gl);
      const scene = new Transform();

      function resize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setSize(width, height);
        // Standard DOM-to-WebGL calibration: place the camera at the exact
        // distance where this fov's frustum height equals the viewport
        // height in px, so a plane scaled to rect.width/rect.height and
        // positioned at z=0 renders pixel-for-pixel over its source
        // element. Perspective (not orthographic) is required —
        // orthographic has no perspective divide, so pos.z would never
        // move a single screen pixel.
        const distance = height / (2 * Math.tan((FOV * Math.PI) / 360));
        camera.position.z = distance;
        camera.perspective({ aspect: width / height, fov: FOV, near: distance / 100, far: distance * 10 });
      }
      resize();
      window.addEventListener("resize", resize);
      detachResize = () => window.removeEventListener("resize", resize);

      // Decode off the main thread (createImageBitmap), then queue the
      // result for a paced GPU upload in `update()` below — assigning
      // `texture.image` only flags the upload for the *next* draw, it
      // doesn't itself touch the GPU, so queuing is just deferring that
      // assignment. Decoding all of them in parallel is fine (the
      // browser's own image-decode pool handles that off-thread); it's
      // the synchronous texImage2D calls that need spreading across
      // frames.
      const uploadQueue: PendingUpload[] = [];
      // Only nodes within readyNodeCount count toward onTexturesReady —
      // see that prop's doc: anything beyond it may be lazy-loaded and
      // off-screen, and waiting on a node that hasn't even started
      // fetching would simply never resolve.
      const effectiveReadyNodeCount = readyNodeCount ?? nodes.current.length;
      const criticalTotal = nodes.current
        .slice(0, effectiveReadyNodeCount)
        .filter((n) => n !== null).length;
      let readyCount = 0;
      let allTexturesReady = false;
      function markReady(index: number) {
        if (index >= effectiveReadyNodeCount) return;
        readyCount += 1;
        if (readyCount === criticalTotal && !allTexturesReady) {
          allTexturesReady = true;
          onTexturesReady?.();
        }
      }

      const planes: PlaneRef[] = nodes.current
        .map((node, i) => {
          if (!node) return null;
          const texture = new Texture(gl, { generateMipmaps: false });
          function decode() {
            // imageOrientation: "flipY" — ogl's Texture always sets
            // UNPACK_FLIP_Y_WEBGL true (correct for an <img> source, the
            // previous texture.image value here). An ImageBitmap source
            // doesn't get that same implicit flip from the browser, so
            // without this every photo rendered upside down once
            // decoding moved off the <img> path.
            createImageBitmap(node!, { imageOrientation: "flipY" })
              .then((bitmap) => uploadQueue.push({ texture, bitmap, index: i }))
              .catch((err) => {
                console.error("[GLSurface] createImageBitmap failed:", err);
                markReady(i); // don't block the reveal forever on one bad image
              });
          }
          if (node.complete) decode();
          else node.addEventListener("load", decode, { once: true });

          const geometry = new Plane(gl, {
            width: 1,
            height: 1,
            widthSegments: SEGMENTS,
            heightSegments: SEGMENTS,
          });
          const program = new Program(gl, {
            vertex: VERTEX,
            fragment: FRAGMENT,
            transparent: true,
            // Planes have real depth extent (the bend), so they intersect
            // in 3D where two elements cross on screen — the depth test
            // would resolve that per-pixel and tear into stripes.
            // Overlaps are instead resolved deterministically by
            // painter's order (renderOrder below), matching DOM stacking
            // regardless of the bend.
            depthTest: false,
            depthWrite: false,
            // At full fold depth a triangle near the edge can locally
            // tilt enough to flip its apparent winding. Flat plane, fine
            // to see from both sides — skip culling rather than lose
            // triangles.
            cullFace: false,
            uniforms: {
              tMap: { value: texture },
              uAmount: { value: 0 },
              uBendDepth: { value: bendDepth },
              uRadius: { value: window.innerHeight * bendRadiusMultiplier },
              // Read from the node's own parent each frame below — see
              // that read site for why DOM opacity otherwise does
              // nothing to what this canvas paints.
              uOpacity: { value: 1 },
            },
          });
          const mesh = new Mesh(gl, { geometry, program });
          // Ascending, matching the order nodes were passed in — same
          // rule CSS uses for same-stacking-context absolutely-positioned
          // siblings with no z-index: later in DOM order paints on top.
          mesh.renderOrder = i;
          mesh.setParent(scene);
          return { node, mesh };
        })
        .filter((p): p is PlaneRef => p !== null);

      // Nothing to wait for — fire immediately rather than never.
      if (criticalTotal === 0) {
        allTexturesReady = true;
        onTexturesReady?.();
      }

      let smoothedVelocity = 0;

      function update() {
        // Paused (caller navigated away, e.g. the landing hidden behind
        // another route): stop scheduling frames entirely rather than
        // spending an empty rAF 60x/sec on a canvas nobody sees. The
        // renderer/scene/textures are untouched — [active] flipping back
        // true just calls resumeRef.current() to restart this chain,
        // nothing to rebuild.
        if (!activeRef.current) {
          raf = 0;
          return;
        }

        // Paced texture uploads: assigning `texture.image` only flags the
        // upload for the next draw below, it doesn't itself touch the
        // GPU — so draining a couple of these before rendering spreads
        // the actual gl.texImage2D calls (the expensive part) across
        // frames instead of all firing in the same one.
        for (let n = 0; n < UPLOADS_PER_FRAME && uploadQueue.length > 0; n++) {
          const pending = uploadQueue.shift()!;
          // ogl's TS types predate ImageBitmap support in its own
          // Texture.image setter, but WebGL2's texImage2D (what
          // Texture.update() calls under the hood) accepts it directly —
          // this is a type-defs gap, not a runtime restriction.
          pending.texture.image = pending.bitmap as unknown as HTMLImageElement;
          markReady(pending.index);
        }

        try {
          let amount: number;
          if (reducedMotionRef.current) {
            amount = 0; // flat, but still GL-rendered
          } else {
            const rawVelocity = lenisRef.current?.velocity ?? 0;
            const normalizedVelocity = Math.max(-1, Math.min(1, rawVelocity / velocityNormalize));
            smoothedVelocity += (normalizedVelocity - smoothedVelocity) * 0.08;
            // Direction-independent: scrolling up and down bend the same way.
            amount = Math.min(1, Math.abs(smoothedVelocity));
          }

          // Rects are read fresh every frame, inside this same rAF —
          // never cached — which is also what carries an infinite-scroll
          // wrap or any other DOM-driven motion automatically: there's no
          // special-case wrap logic here, the rect already reflects it.
          const radius = window.innerHeight * bendRadiusMultiplier;
          for (const { node, mesh } of planes) {
            const rect = node.getBoundingClientRect();
            mesh.scale.set(rect.width, rect.height, 1);
            // Camera space is centered on the viewport with +Y up; CSS
            // rects are top-left origin with +Y down — recenter and flip.
            mesh.position.set(
              rect.left + rect.width / 2 - window.innerWidth / 2,
              -(rect.top + rect.height / 2 - window.innerHeight / 2),
              0
            );
            mesh.program.uniforms.uAmount.value = amount;
            mesh.program.uniforms.uRadius.value = radius;
            // getBoundingClientRect() reflects a hidden (display: none)
            // ancestor fine (rect just collapses), but NOT an opacity: 0
            // one — opacity is a paint-time compositing property, not a
            // layout one, so nothing about the rect changes and this
            // canvas would otherwise paint the plane fully visible
            // regardless of any DOM opacity the caller set to hide it.
            // Read the node's own parent's inline opacity (the caller's
            // documented hiding mechanism — see LandingComposition's
            // entrance wrapper, which is exactly node.parentElement) and
            // multiply it into the fragment shader's alpha instead.
            const parentOpacity = node.parentElement?.style.opacity;
            const opacity = parentOpacity ? parseFloat(parentOpacity) : 1;
            mesh.program.uniforms.uOpacity.value = Number.isFinite(opacity) ? opacity : 1;
          }

          renderer.render({ scene, camera, sort: true });
        } catch (err) {
          // Caught here (not the outer catch) so a bad frame doesn't
          // silently end the rAF chain — log and keep looping.
          console.error("[GLSurface] render loop error:", err);
        }
        raf = requestAnimationFrame(update);
      }
      // Lets the [active]-watching effect restart this chain later
      // without reaching into this closure any other way.
      resumeRef.current = () => {
        if (raf === 0) raf = requestAnimationFrame(update);
      };
      raf = requestAnimationFrame(update);

      onAvailabilityChange?.(true);
    } catch (err) {
      console.error("[GLSurface] WebGL unavailable, staying on CSS:", err);
      onAvailabilityChange?.(false);
    }

    return () => {
      resumeRef.current = null;
      cancelAnimationFrame(raf);
      detachResize?.();
    };
    // Deliberately NOT depending on `active`/`reducedMotion` (read via
    // refs above instead) or `onTexturesReady` (read via closure, fires
    // at most once per mount) — this effect exists once per mount and
    // must never re-run just because one of those changed, or it would
    // tear down and rebuild the whole scene (destroying every texture)
    // to change what amounts to a flag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, lenisRef, bendDepth, bendRadiusMultiplier, velocityNormalize, onAvailabilityChange, readyNodeCount]);

  return <canvas ref={canvasRef} className={className ?? "pointer-events-none fixed inset-0"} />;
}

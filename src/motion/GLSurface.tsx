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
  pos.z -= uBendDepth * uAmount * dz; // recedes away from the camera, never toward it
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D tMap;
in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = texture(tMap, vUv);
}
`;

type PlaneRef = { node: HTMLImageElement; mesh: Mesh };

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
  /** Fires once availability is known: true once a WebGL2/WebGL context
   * was created and the render loop is running; false if context
   * creation or setup failed for any reason. The caller MUST NOT hide
   * its mirrored nodes until this fires true — with the nodes already
   * hidden, a missing/failed context leaves the page blank. */
  onAvailabilityChange?: (available: boolean) => void;
};

export default function GLSurface({
  nodes,
  lenisRef,
  bendDepth = 1,
  bendRadiusMultiplier = 1.2,
  velocityNormalize = 40,
  className,
  onAvailabilityChange,
}: GLSurfaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // prefers-reduced-motion pins the bend to 0 (flat) — it does NOT fall
  // back to CSS. GL keeps painting either way; only the amount differs.
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

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

      const planes: PlaneRef[] = nodes.current
        .map((node, i) => {
          if (!node) return null;
          const texture = new Texture(gl, { generateMipmaps: false });
          const upload = () => {
            texture.image = node;
          };
          if (node.complete) upload();
          else node.addEventListener("load", upload, { once: true });

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

      let smoothedVelocity = 0;

      function update() {
        try {
          let amount: number;
          if (reducedMotion) {
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
          }

          renderer.render({ scene, camera, sort: true });
        } catch (err) {
          // Caught here (not the outer catch) so a bad frame doesn't
          // silently end the rAF chain — log and keep looping.
          console.error("[GLSurface] render loop error:", err);
        }
        raf = requestAnimationFrame(update);
      }
      raf = requestAnimationFrame(update);

      onAvailabilityChange?.(true);
    } catch (err) {
      console.error("[GLSurface] WebGL unavailable, staying on CSS:", err);
      onAvailabilityChange?.(false);
    }

    return () => {
      cancelAnimationFrame(raf);
      detachResize?.();
    };
  }, [nodes, lenisRef, bendDepth, bendRadiusMultiplier, velocityNormalize, reducedMotion, onAvailabilityChange]);

  return <canvas ref={canvasRef} className={className ?? "pointer-events-none fixed inset-0"} />;
}

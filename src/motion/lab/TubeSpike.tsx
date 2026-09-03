"use client";

// PLACEHOLDER — throwaway spike, not wired into any real page. Proves the
// vvisual.biz architecture: hidden <img> elements as CSS-laid-out texture
// sources, a single full-viewport WebGL2 canvas doing all the painting.
// Do not import this outside /lab/tube.
//
// Layout is a copy of the real landing composition (see
// landingLayoutReplica.ts) so the tube has real grid density/scale to
// judge against, not 3 photos in a column. Infinite scroll reuses the
// landing's exact mechanism (Lenis infinite + the cycleHeight+100vh
// height invariant) rather than inventing a second one — see COPIES below.
//
// Debug hooks (query params):
//   ?debug=1          position-tracking check: bend forced to 0, source
//                     <img>s revealed under a dimmed canvas so any drift
//                     between the DOM rect and the GL plane shows up as
//                     visible ghosting/double edges.
//   ?forceAmount=1    bend-visibility check: locks uAmount to this value
//                     (skips smoothing) so the fold can be screenshotted
//                     at full strength without scrolling.
//   Both can be combined, e.g. ?debug=1&forceAmount=0.5.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Renderer, Camera, Transform, Plane, Program, Mesh, Texture } from "ogl";
import type { Photo } from "@/data/photos";
import { useLenis } from "@/motion/useLenis";
import { buildLayout, PARALLAX_STRENGTH, SEQUENCE_HEIGHT_VH } from "./landingLayoutReplica";

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

// Same trick as the landing, same reason: two copies rendered, but the
// scroll container's own height is capped at cycleHeight + 100vh (NOT
// cycleHeight*COPIES), which is what makes scrollHeight-clientHeight
// collapse to exactly cycleHeight for any viewport size — the invariant
// Lenis's infinite wrap needs to land on identical content. See the
// assertion in resize() below and LandingComposition.tsx's own comment
// for the full derivation.
const COPIES = 2;

// Multiplies the raw sagitta (see uRadius below) — leave at 1 to trust the
// circle geometry as-is, raise for a more exaggerated recession.
const BEND_DEPTH = 1;

// The cylinder's radius, as a multiple of viewport height. Must exceed 1
// (the cylinder has to be bigger than the viewport) or the (1-cos)-style
// plateau lands exactly at the viewport edge and everything there reads
// as flat. Smaller = tighter tube (more curve), larger = gentler.
const BEND_RADIUS_MULTIPLIER = 1.2;

// Raw Lenis velocity (px/frame) that maps to a full-strength [0, 1] amount.
// Anything faster than this saturates rather than growing further.
const VELOCITY_NORMALIZE = 40;

const SEGMENTS = 20; // subdivisions per axis — a 2-triangle quad can't bend

// Degrees. Paired with a camera distance computed in resize() so a plane
// at z=0 always renders at exactly its DOM size regardless of fov.
const FOV = 45;

const VERTEX = `#version 300 es
precision highp float;

in vec3 position;
in vec2 uv;

uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform float uAmount;        // 0..1, direction-independent (abs of velocity)
uniform float uBendDepth;     // multiplies the raw sagitta below
uniform float uRadius;        // cylinder radius, world px (viewport-height based)

out vec2 vUv;

void main() {
  vUv = uv;
  // The cylinder belongs to the VIEWPORT, not the plane: every vertex
  // bends based on its own SCREEN position, not its position within its
  // own photo. worldPos.y IS screen Y here because the camera below is
  // calibrated so world units equal CSS pixels with no rotation/offset.
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  float y = worldPos.y; // CSS px, 0 = screen centre — deliberately NOT
                         // clamped to the viewport: vertices above/below
                         // the screen keep curving, so the roll continues
                         // past the edges instead of flattening there.
  // True circular arc (sagitta), not the (1-cos) approximation: that
  // plateaus exactly at the viewport edge, which is precisely why photos
  // touching the edge were reading as flat. uRadius > viewport height
  // keeps the visible band a section of the arc, short of the plateau.
  float dz = uRadius - sqrt(max(uRadius * uRadius - y * y, 0.0));
  vec3 pos = position;
  // Measured both signs directly (gl.readPixels bbox area, forceAmount=0
  // vs 1): += grew the edge photo (391392px^2 -> 443625px^2, i.e. moved
  // toward the camera — wrong); -= shrank it to 364908px^2, which is the
  // receding direction this camera setup (at +Z, looking toward -Z)
  // actually needs. Keep this as -=; do not flip without re-measuring.
  pos.z -= uBendDepth * uAmount * dz;
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

type PlaneRef = { img: HTMLImageElement; mesh: Mesh; depth: number };

export default function TubeSpike({ photos }: { photos: Photo[] }) {
  const lenisRef = useLenis({ infinite: true });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const [fps, setFps] = useState(0);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";
  const forceAmountParam = searchParams.get("forceAmount");
  const forceAmount =
    forceAmountParam !== null ? Number(forceAmountParam) : debug ? 0 : null;

  const layout = useMemo(() => buildLayout(photos), [photos]);

  useEffect(() => {
    if (reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new Renderer({
      canvas,
      dpr: Math.min(window.devicePixelRatio, 2),
      alpha: true,
      // No depth buffer needed — overlaps are resolved by painter's order
      // (renderOrder below), not the depth test.
      depth: false,
      // Cheap at this photo count, and keeps the drawing buffer readable
      // for gl.readPixels-based verification instead of only screenshots.
      preserveDrawingBuffer: true,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const camera = new Camera(gl);

    const scene = new Transform();

    function resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      renderer.setSize(width, height);
      // Standard DOM-to-WebGL calibration: place the camera at the exact
      // distance where this fov's frustum height equals the viewport
      // height in px, so a plane scaled to rect.width/rect.height and
      // positioned at z=0 renders pixel-for-pixel over its source <img>.
      // Perspective (not orthographic) is required: orthographic has no
      // perspective divide, so a pure pos.z push would never move a
      // single screen pixel — the fold needs real foreshortening.
      const distance = height / (2 * Math.tan((FOV * Math.PI) / 360));
      camera.position.z = distance;
      camera.perspective({ aspect: width / height, fov: FOV, near: distance / 100, far: distance * 10 });

      // Same invariant proved on the landing: with the scroll container's
      // height pinned to cycleHeight + 100vh (see the JSX below), this
      // must always land on exactly cycleHeight, for any viewport size —
      // that's what lets Lenis's infinite wrap land on identical content
      // instead of jumping. Assert it rather than trust it silently.
      const cycleHeightPx = (SEQUENCE_HEIGHT_VH / 100) * height;
      const scrollRange = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const remainder = ((scrollRange % cycleHeightPx) + cycleHeightPx) % cycleHeightPx;
      const onInvariant = remainder < 1 || cycleHeightPx - remainder < 1; // vh->px rounding slack
      console.assert(
        onInvariant,
        `[lab/tube] infinite-scroll height invariant violated: scrollRange=${scrollRange}px, cycleHeight=${cycleHeightPx}px, remainder=${remainder}px`
      );
    }
    resize();
    window.addEventListener("resize", resize);

    const planes: PlaneRef[] = imgRefs.current
      .map((img, i) => {
        if (!img) return null;
        const texture = new Texture(gl, { generateMipmaps: false });
        const upload = () => {
          texture.image = img;
        };
        if (img.complete) upload();
        else img.addEventListener("load", upload, { once: true });

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
          // Planes now have real depth extent (the bend), so they
          // intersect in 3D where two photos cross on screen — the depth
          // test would resolve that per-pixel and tear into stripes.
          // Overlaps are instead resolved deterministically by painter's
          // order (renderOrder below, ascending = drawn first = ends up
          // underneath), matching DOM stacking regardless of the bend.
          depthTest: false,
          depthWrite: false,
          // At full fold depth a triangle near the edge can locally tilt
          // enough to flip its apparent winding. Flat plane, fine to see
          // from both sides — skip culling rather than lose triangles.
          cullFace: false,
          uniforms: {
            tMap: { value: texture },
            uAmount: { value: 0 },
            uBendDepth: { value: BEND_DEPTH },
            uRadius: { value: window.innerHeight * BEND_RADIUS_MULTIPLIER },
          },
        });
        const mesh = new Mesh(gl, { geometry, program });
        // Ascending, matching DOM order (i = copy*layout.length + item
        // index, see the JSX below) — same rule CSS uses for same-
        // stacking-context absolutely-positioned siblings with no
        // z-index: later in DOM order paints on top.
        mesh.renderOrder = i;
        mesh.setParent(scene);
        return { img, mesh, depth: layout[i % layout.length]?.placement.depth ?? 0 };
      })
      .filter((p): p is PlaneRef => p !== null);

    let smoothedVelocity = 0;
    let raf = 0;
    let frameCount = 0;
    let lastFpsSample = performance.now();

    function update() {
      try {
        // Same per-photo parallax as the real landing (translateY based on
        // distance from viewport center), applied before rects are read
        // this frame so the GL planes track the post-parallax position.
        const viewportCenter = window.innerHeight / 2;
        for (const { img, depth } of planes) {
          if (depth === 0) continue; // pinned — landing never touches these either
          const rect = img.getBoundingClientRect();
          const elementCenter = rect.top + rect.height / 2;
          const distance = viewportCenter - elementCenter;
          img.style.transform = `translateY(${distance * PARALLAX_STRENGTH * depth}px)`;
        }

        let amount: number;
        if (forceAmount !== null) {
          amount = forceAmount;
        } else {
          const rawVelocity = lenisRef.current?.velocity ?? 0;
          const normalizedVelocity = Math.max(-1, Math.min(1, rawVelocity / VELOCITY_NORMALIZE));
          smoothedVelocity += (normalizedVelocity - smoothedVelocity) * 0.08;
          // Direction-independent: scrolling up and down bend the tube the
          // same way. At rest (amount 0) every vertex's push is exactly 0.
          amount = Math.min(1, Math.abs(smoothedVelocity));
        }

        // Rects are read fresh every frame, inside this same rAF, after
        // both Lenis and the parallax transform above have been applied
        // for the frame — never cached. The GL planes automatically
        // follow the infinite-scroll wrap this way too: there's no
        // special-case wrap logic here, the DOM rect already reflects it.
        const radius = window.innerHeight * BEND_RADIUS_MULTIPLIER;
        for (const { img, mesh } of planes) {
          const rect = img.getBoundingClientRect();
          mesh.scale.set(rect.width, rect.height, 1);
          // Camera space is centered on the viewport with +Y up; CSS rects
          // are top-left origin with +Y down — recenter and flip to match.
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
        // A thrown error here would otherwise silently end the rAF chain
        // (the HUD would read a frozen fps forever with no clue why).
        console.error("[lab/tube] render loop error:", err);
      }

      frameCount++;
      const now = performance.now();
      if (now - lastFpsSample >= 300) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsSample)));
        frameCount = 0;
        lastFpsSample = now;
      }

      raf = requestAnimationFrame(update);
    }
    raf = requestAnimationFrame(update);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reducedMotion, lenisRef, forceAmount, layout]);

  const showImages = reducedMotion || debug;

  return (
    <main className="relative min-h-[calc(100vh)] bg-[#FAFAFA]">
      {/* Risk A rig: fixed full-viewport canvas, painted normally (no
          transform/filter/isolation) so a sibling's mix-blend-mode can
          composite against its pixels. Debug mode dims it (opacity only,
          on the canvas — never on the h1 below) so the revealed <img>
          elements underneath show through for the alignment check. */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none fixed inset-0 z-10"
        style={{
          visibility: reducedMotion ? "hidden" : "visible",
          opacity: debug ? 0.55 : 1,
        }}
      />

      {/* Same recipe as the landing wordmark: white + mix-blend-difference,
          no transform/opacity/filter on it or any ancestor. */}
      <h1
        className="pointer-events-none fixed inset-0 z-20 flex select-none items-center justify-center text-center font-medium leading-none text-white mix-blend-difference"
        style={{ fontSize: "clamp(64px, 16vw, 158px)" }}
      >
        SUQUIA
      </h1>

      <div className="pointer-events-none fixed left-4 top-4 z-30 max-w-[70vw] font-mono text-[12px] leading-relaxed text-[#666]">
        /lab/tube spike —{" "}
        {reducedMotion
          ? "prefers-reduced-motion: WebGL off, plain images shown"
          : `${fps} fps, ${photos.length * COPIES} planes, ${SEGMENTS}×${SEGMENTS} segments each${
              forceAmount !== null ? ` — DEBUG: amount forced to ${forceAmount}` : ""
            }`}
      </div>

      {/* Real landing composition, copied — see landingLayoutReplica.ts.
          Same COPIES + cycleHeight-capped-container trick as the landing
          (see the invariant comment in resize() above): rendered twice,
          but the container's own height stops at SEQUENCE_HEIGHT_VH +
          100vh, so scrollHeight-clientHeight collapses to exactly the
          cycle height and Lenis's infinite wrap lands on identical
          content instead of jumping. overflowY clips the rest of the
          second copy so it never expands scrollHeight beyond that. */}
      <div
        className="relative z-0 w-screen"
        style={{
          height: `calc(${SEQUENCE_HEIGHT_VH}vh + 100vh)`,
          overflowX: "clip",
          overflowY: "clip",
        }}
      >
        {Array.from({ length: COPIES }).map((_, copy) =>
          layout.map((item, i) => (
            <div
              key={`${item.photo.src}-${copy}`}
              className="absolute"
              style={{
                top: `${item.placement.y + copy * SEQUENCE_HEIGHT_VH}vh`,
                left: `${item.placement.x}%`,
                width: `${item.placement.w}vw`,
                visibility: showImages ? "visible" : "hidden",
              }}
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
                priority={copy === 0 && i === 0}
              />
            </div>
          ))
        )}
      </div>
    </main>
  );
}

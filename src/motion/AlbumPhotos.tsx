"use client";

// Renders an album's vertical photo flow and mirrors it through the same
// GLSurface renderer as the landing, but tuned for restraint: the landing
// is spectacle, this is where the work is actually looked at. Layout,
// numbering, and per-photo info are untouched from the plain version —
// only the painting changes, exactly like the landing's own integration.

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Photo } from "@/data/photos";
import GLSurface from "./GLSurface";
import { useLenis } from "./useLenis";

// Much gentler than the landing (bendDepth: 1, bendRadiusMultiplier: 1.2):
// larger radius, lower depth — worked out to be roughly a 10x weaker
// push at the same screen position (checked via the sagitta formula at
// y=400px on a 900px-tall viewport: landing pushes ~77 world px at full
// velocity, this pushes ~8). Weaker than that starts to fall below what
// a real fling can move on screen at all, which overshoots "barely
// perceptible" into "not there." Exposed here (not hardcoded in
// GLSurface) precisely so instances can differ like this.
const ALBUM_BEND_DEPTH = 0.25;
const ALBUM_BEND_RADIUS_MULTIPLIER = 3;

// Alternating placement per the design spec's vertical top-down flow:
// centered / offset-left / offset-right, repeating every three photos.
function placementClass(index: number) {
  switch (index % 3) {
    case 1:
      return "items-start";
    case 2:
      return "items-end";
    default:
      return "items-center";
  }
}

export default function AlbumPhotos({ photos }: { photos: Photo[] }) {
  const lenisRef = useLenis();
  const imgRefs = useRef<(HTMLImageElement | null)[]>([]);
  const [glActive, setGlActive] = useState(false);

  // Each row's <Image> is w-auto/h-auto, constrained only by max-h-[85vh]
  // — its rendered height depends on the browser resolving that against
  // the decoded image's real aspect ratio, which can land after Lenis's
  // own (debounced, ResizeObserver-driven) recalculation. If the page
  // grows after Lenis has already cached a shorter scroll limit, the
  // bottom of the page becomes unreachable until something tells Lenis
  // to recompute — this is that: force a recompute the instant each
  // photo actually finishes loading, rather than trust the debounce to
  // always win the race.
  function handleImageLoad() {
    lenisRef.current?.resize();
  }

  // Fonts (EB Garamond) can also reflow text below the fold after first
  // paint, for the same reason — cheap enough to just always resize once
  // fonts are ready.
  useEffect(() => {
    document.fonts?.ready.then(() => lenisRef.current?.resize());
  }, [lenisRef]);

  return (
    <>
      {photos.map((photo, index) => (
        <div
          key={photo.src}
          data-photo-index={index}
          className={`flex flex-col gap-4 px-6 py-16 md:px-16 ${placementClass(index)}`}
        >
          <Image
            ref={(el) => {
              imgRefs.current[index] = el;
            }}
            src={photo.src}
            alt={photo.title}
            width={photo.width}
            height={photo.height}
            className="h-auto w-auto max-h-[85vh] max-w-full"
            sizes="(max-width: 768px) 90vw, 70vw"
            onLoad={handleImageLoad}
            // MANDATORY FALLBACK, same rule as the landing: only hidden
            // once GLSurface confirms a working WebGL context. If that
            // never fires, this stays visible and the page renders
            // exactly as the plain CSS album page always has.
            style={{ visibility: glActive ? "hidden" : "visible" }}
          />
          {/* Place outranks technical data: number/title/place share one
              baseline row, capture data drops to its own line below as
              the footnote. Caption always shows "City, Country" alone —
              never degree/minute/second coordinates, exact or otherwise;
              that level of precision is an atlas-hover thing only (see
              Place's precision field), not a caption thing. */}
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[14px] tabular-nums text-[#BBBBBB]">
                {String(photo.order).padStart(2, "0")}
              </span>
              <span className="font-serif text-[20px] italic text-[#111111]">
                {photo.title}
              </span>
              <span className="text-[14px] text-[#666666]" aria-hidden>
                ·
              </span>
              <span className="text-[14px] text-[#666666]">
                {photo.place.city}, {photo.place.country}
              </span>
            </div>
            <span className="text-[12px] uppercase tracking-[0.14em] text-[#A8A8A8]">
              {photo.capture.focalLength} — {photo.capture.aperture} — {photo.capture.iso}
            </span>
          </div>
        </div>
      ))}

      <GLSurface
        nodes={imgRefs}
        lenisRef={lenisRef}
        bendDepth={ALBUM_BEND_DEPTH}
        bendRadiusMultiplier={ALBUM_BEND_RADIUS_MULTIPLIER}
        onAvailabilityChange={setGlActive}
        className="pointer-events-none fixed inset-0 z-0"
      />
    </>
  );
}

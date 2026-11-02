"use client";

// The atlas's photo viewer (spec 016): opens beside the globe — from the
// "View All Photographs" control, or on a single photo or a group that
// can't split any further — and walks the WHOLE archive in tour order
// (amendment 3: places in geographic order, src/lib/atlasTour.ts). The
// globe stays visible and usable on the left and follows each step.
// Declarative: Atlas.tsx owns which photo is showing; this only renders.
//
// - The large photo is never cropped: natural aspect ratio, fit inside
//   whatever height the panel leaves free (CA4).
// - DMS coordinates only for `precision: "exact"` — a `city` photo's
//   lat/lng is a centroid, not a place (CLAUDE.md, `place`; CA7).
// - The strip shows every photo, in tour order, with a wider gap between
//   places; all at one height with their own widths; the current one grows
//   by `scale` (transform only) and is kept scrolled into view. ‹ › and
//   ← → step through it, wrapping; Esc closes.
// - Entrance: fade + 16 px slide in 200 ms (`.atlas-viewer` in
//   globals.css); under reduced motion it is simply there (CA8).

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type { AtlasMark } from "@/motion/Atlas";

const VIEWER_MAX_W = 520;
const VIEWER_SHARE_OF_VW = 0.4;
const VIEWER_MIN_W = 280; // phones: wider than 40 %, just so it doesn't break (spec 016, decision 3)
const THUMB_H = 56;
const THUMB_CURRENT_SCALE = 1.15;
const THUMB_GAP = 6; // between photos of one place
const PLACE_GAP = 20; // between places

// The viewer's width for a given viewport width. Atlas.tsx uses the same
// number to move the globe's centre into the space left free.
export function atlasViewerWidth(vw: number): number {
  return Math.min(VIEWER_MAX_W, Math.max(Math.min(VIEWER_MIN_W, vw), vw * VIEWER_SHARE_OF_VW));
}

export function toDMS(value: number, positiveSuffix: string, negativeSuffix: string) {
  const suffix = value >= 0 ? positiveSuffix : negativeSuffix;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = Math.round((minFloat - min) * 60);
  return `${deg}°${min}'${sec}"${suffix}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function AtlasViewer({
  marks,
  index,
  width,
  onIndex,
  onClose,
}: {
  marks: AtlasMark[];
  index: number;
  width: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const mark = marks[index];
  const many = marks.length > 1;
  const step = (d: number) => onIndex((index + d + marks.length) % marks.length);
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the current thumbnail centred in the strip (instantly the first
  // time and under reduced motion). Only the strip scrolls, never the page.
  const scrolledOnceRef = useRef(false);
  useEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!strip || !thumb) return;
    const left = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left, behavior: reduce || !scrolledOnceRef.current ? "auto" : "smooth" });
    scrolledOnceRef.current = true;
  }, [index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (many && e.key === "ArrowRight") onIndex((index + 1) % marks.length);
      else if (many && e.key === "ArrowLeft") onIndex((index - 1 + marks.length) % marks.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, many, marks.length, onIndex, onClose]);

  if (!mark) return null;

  return (
    <aside
      data-atlas-viewer
      aria-label="Photograph viewer"
      className="atlas-viewer fixed right-0 top-0 z-30 flex h-[100dvh] flex-col border-l border-[#E6E6E6] bg-[#FAFAFA] px-6 py-6 md:px-8 md:py-8"
      style={{ width }}
    >
      <div className="flex shrink-0 items-center justify-between">
        <span className="text-[14px] tabular-nums text-[#666]">
          {many ? `${pad2(index + 1)} / ${pad2(marks.length)}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-[12px] uppercase tracking-[0.14em] text-[#666] hover:text-[#111]"
        >
          Close
        </button>
      </div>

      <div className="mt-6 min-h-0 flex-1">
        <div
          data-atlas-viewer-photo
          data-src={mark.src}
          className="flex h-full w-full items-end justify-start"
        >
          <Image
            key={mark.src}
            src={mark.src}
            alt={mark.title}
            width={mark.width}
            height={mark.height}
            sizes={`${Math.round(width)}px`}
            style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%" }}
          />
        </div>
      </div>

      <div className="mt-6 flex shrink-0 flex-col gap-1">
        <span className="font-serif text-[20px] italic text-[#111111]">{mark.title}</span>
        <span className="text-[12px] uppercase tracking-[0.14em] text-[#666]">
          {mark.city} · {mark.country}
        </span>
        {mark.precision === "exact" && (
          <span className="text-[11px] text-[#A8A8A8]">
            {toDMS(mark.lat, "N", "S")} {toDMS(mark.lng, "E", "W")}
          </span>
        )}
        <span className="text-[12px] uppercase tracking-[0.14em] text-[#A8A8A8]">
          {mark.capture.focalLength} — {mark.capture.aperture} — {mark.capture.iso}
        </span>
        <Link
          href={`/album/${mark.album}#photo-${mark.albumPhotoIndex}`}
          className="mt-2 self-start text-[12px] uppercase tracking-[0.14em] text-[#666] hover:text-[#111]"
        >
          {mark.albumTitle} →
        </Link>
      </div>

      {many && (
        <div className="mt-6 flex shrink-0 items-end gap-3">
          <button
            type="button"
            data-atlas-viewer-prev
            onClick={() => step(-1)}
            aria-label="Previous photograph"
            className="pb-4 text-[20px] leading-none text-[#666] hover:text-[#111]"
          >
            ‹
          </button>
          <div ref={stripRef} className="relative flex min-w-0 flex-1 items-end overflow-x-auto px-2 pb-1 pt-3">
            {marks.map((m, i) => (
              <button
                key={m.src}
                type="button"
                data-atlas-viewer-thumb
                onClick={() => onIndex(i)}
                aria-label={m.title}
                aria-current={i === index ? "true" : undefined}
                className="shrink-0 origin-bottom transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none"
                style={{
                  marginLeft: i === 0 ? 0 : m.stop !== marks[i - 1].stop ? PLACE_GAP : THUMB_GAP,
                  width: (THUMB_H * m.width) / m.height,
                  height: THUMB_H,
                  transform: i === index ? `scale(${THUMB_CURRENT_SCALE})` : undefined,
                  opacity: i === index ? 1 : 0.55,
                }}
              >
                <Image
                  src={m.src}
                  alt=""
                  width={m.width}
                  height={m.height}
                  sizes={`${Math.ceil((THUMB_H * THUMB_CURRENT_SCALE * m.width) / m.height)}px`}
                  className="block h-full w-full"
                />
              </button>
            ))}
          </div>
          <button
            type="button"
            data-atlas-viewer-next
            onClick={() => step(1)}
            aria-label="Next photograph"
            className="pb-4 text-[20px] leading-none text-[#666] hover:text-[#111]"
          >
            ›
          </button>
        </div>
      )}
    </aside>
  );
}

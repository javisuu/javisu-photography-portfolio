"use client";

import { useEffect, useRef, useState } from "react";

// Tracks which photo row is nearest the viewport's vertical center via
// IntersectionObserver (rows are marked with data-photo-index by the album
// page) and exposes it as a plain "NN / total" counter with prev/next
// chevrons — no per-digit animation yet, that's the rolling-digit motion
// pass (see CLAUDE.md build order). Deliberately native scrollIntoView
// rather than Lenis/GSAP: this page has no smooth-scroll wiring yet
// (that's the separate "tube-roll scroll elsewhere on the site" item).
export default function AlbumPhotoNav({ total }: { total: number }) {
  const [current, setCurrent] = useState(0);
  // Persists each row's latest known intersecting state across callback
  // batches. A single IntersectionObserver callback only reports rows
  // whose ratio just crossed a threshold, not every row currently
  // intersecting — during a fast scroll several rows can cross a
  // threshold in the same batch while an already-intersecting row (the
  // one actually nearest center) reports nothing this time, so picking
  // the closest from `entries` alone was occasionally picking the wrong
  // row. Tracking full state here and recomputing "closest" over all of
  // it, every batch, fixes that regardless of scroll speed.
  const intersectingRef = useRef(new Map<Element, boolean>());

  useEffect(() => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-photo-index]"));
    if (rows.length === 0) return;

    const intersecting = intersectingRef.current;
    intersecting.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          intersecting.set(entry.target, entry.isIntersecting);
        }

        const centerY = window.innerHeight / 2;
        let closest: HTMLElement | null = null;
        let closestDistance = Infinity;
        for (const [target, isIntersecting] of intersecting) {
          if (!isIntersecting) continue;
          const rect = target.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - centerY);
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = target as HTMLElement;
          }
        }
        // If nothing is currently intersecting (every row scrolled past
        // between checks), keep the last known value rather than glitch.
        if (closest) setCurrent(Number(closest.dataset.photoIndex));
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [total]);

  function goTo(index: number) {
    const wrapped = ((index % total) + total) % total;
    const target = document.querySelector<HTMLElement>(`[data-photo-index="${wrapped}"]`);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "center" });
  }

  return (
    <div className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-4 text-[#666] md:right-8 md:flex">
      <button type="button" aria-label="Previous photo" onClick={() => goTo(current - 1)} className="cursor-pointer hover:text-[#111]">
        <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden>
          <path d="M1 8L7 1L13 8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <span className="text-[14px] tabular-nums">
        {String(current + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
      <button type="button" aria-label="Next photo" onClick={() => goTo(current + 1)} className="cursor-pointer hover:text-[#111]">
        <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden>
          <path d="M1 1L7 8L13 1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
    </div>
  );
}

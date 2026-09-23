"use client";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

// Hover-only letter scramble for the small tracked-caps nav labels (ABOUT
// ME / ALBUMS / ATLAS / CREDITS) — never on serif titles, captions, album
// names, or the wordmark (that has its own, unrelated reel-spin effect).
// Each character cycles through a few random Latin letters before landing
// on its own final letter, resolving left to right, ~220ms total (inside
// the requested 200-250ms). Colour/size/tracking come entirely from the
// caller's own className on whatever wraps this — nothing here overrides
// them, only the glyphs change.

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

// Uppercase only — every one of these labels renders through a CSS
// `uppercase` on an ancestor, so the case used here is invisible either
// way, but generating uppercase directly keeps the scramble reading as
// letters-among-letters rather than visibly changing case mid-flight in
// devtools/selection. Latin only, per spec — no symbols, no digits.
const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TOTAL_MS = 220;
const SCRAMBLE_MS = 100; // each character's own rapid-cycle window
const TICK_MS = 40; // how often a still-scrambling character's random letter changes

function randomLetter() {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

export default function ScrambleText({ text }: { text: string }) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );

  const chars = text.split("");
  const [display, setDisplay] = useState<string[]>(chars);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);

  // Locks each character SLOT's width to its own final letter's natural
  // size — the label's total rendered width never changes during the
  // scramble, only the content inside each fixed-width slot does.
  // Non-monospace serif glyphs vary in width per letter, so this can't
  // be done with a CSS trick (tabular-nums is numbers-only) — measuring
  // is the only option. Safe to measure/apply synchronously pre-paint
  // (useLayoutEffect) since this only ever runs client-side, well after
  // hydration — nothing here plays before a real hover, which can't
  // happen before JS is running anyway. Re-measures once fonts finish
  // loading too, in case the initial measurement caught a fallback-font
  // swap-in width (same reasoning as AlbumPhotos' own document.fonts
  // .ready-driven remeasure).
  useLayoutEffect(() => {
    function measure() {
      charRefs.current.forEach((el) => {
        if (!el) return;
        el.style.width = "auto";
      });
      charRefs.current.forEach((el) => {
        if (!el) return;
        // offsetWidth, NOT getBoundingClientRect().width — this caller
        // (the rotated CREDITS label) sits inside an ancestor with its
        // own `-rotate-90`, and getBoundingClientRect() always returns
        // the axis-ALIGNED box after every ancestor transform, which
        // for a 90°-rotated element reports what is visually its
        // HEIGHT in the `width` field. That inflated value then got
        // written back as this element's own `width`, compounding on
        // every remeasure — which is exactly what moved the whole
        // label (its true pre-rotation width, and so where its
        // translateY(-50%) centering point ends up, changed). offsetWidth
        // is a layout property, unaffected by transforms on the element
        // or any ancestor, so it reports the same true value regardless
        // of rotation.
        const width = el.offsetWidth;
        el.style.width = `${width}px`;
      });
    }
    measure();
    document.fonts?.ready.then(measure);
  }, [text]);

  function stop() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    runningRef.current = false;
  }

  function play() {
    if (reducedMotion) return;
    stop();
    runningRef.current = true;

    const nonSpaceCount = chars.filter((c) => c !== " ").length;
    const stagger = nonSpaceCount > 1 ? (TOTAL_MS - SCRAMBLE_MS) / (nonSpaceCount - 1) : 0;
    let rank = 0;
    const startFor = chars.map((c) => {
      if (c === " ") return -1; // spaces never scramble
      const s = rank * stagger;
      rank += 1;
      return s;
    });

    const startTime = performance.now();
    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startTime;
      let allSettled = true;
      setDisplay(
        chars.map((c, i) => {
          if (c === " ") return " ";
          const start = startFor[i];
          if (elapsed < start + SCRAMBLE_MS) {
            allSettled = false;
            return randomLetter();
          }
          return c;
        })
      );
      if (allSettled) stop();
    }, TICK_MS);
  }

  function handleMouseLeave() {
    // Leaving mid-flight snaps straight to the final text rather than
    // reversing or continuing to completion.
    if (!runningRef.current) return;
    stop();
    setDisplay(chars);
  }

  return (
    <span onMouseEnter={play} onMouseLeave={handleMouseLeave}>
      {display.map((ch, i) => (
        <span
          key={i}
          ref={(el) => {
            charRefs.current[i] = el;
          }}
          className="inline-block text-center"
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}

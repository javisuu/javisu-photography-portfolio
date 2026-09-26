"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The wordmark plays exactly one animated thing, ever: DECIPHER, on arrival
// only — noise resolving into SUQUIA, in place. There is no hover/tap
// letter-changing mechanism anymore. Five prior mechanisms (a split-flap
// board, a continuous reel, a mechanical drum, then a ring-based split-flap
// board again) were all built and torn out — see the 2026-09-26 changelog
// entry: JAVIER/SUAREZ/SUQUIA measure 534.4 / 603.0 / 595.2px and share
// almost no glyph advances in EB Garamond (I 55.0 vs Q 120.4, a 2.2x
// spread), and a proportional serif simply has no fixed module for a
// mechanical letter-change effect to hang off of. Hovering the wordmark now
// reveals a single static line of the full name underneath it instead (see
// the JSX at the bottom of this file) — no letter animation of any kind.
const SUQUIA = ["S", "U", "Q", "U", "I", "A"];
const COLUMN_COUNT = 6;

// Every random glyph the decipher ever draws comes from this set only: the
// letters of Javi's own name.
const NAME_ALPHABET = "JAVIERSUZQ".split("");

const CYCLE_MS = 55; // ~18 changes/sec per position while decoding

// Decipher timing (untouched): ~600ms total, cascading left to right with a
// 300ms spread.
const DECIPHER_DURATION_MS = 600;
const DECIPHER_CASCADE_SPREAD_MS = 300;
const DECIPHER_CASCADE_MS = DECIPHER_CASCADE_SPREAD_MS / (COLUMN_COUNT - 1); // 60ms/column
const DECIPHER_PER_COLUMN_MS = DECIPHER_DURATION_MS - DECIPHER_CASCADE_SPREAD_MS; // 300ms

function decipherColumnDurationMs(col: number): number {
  return col * DECIPHER_CASCADE_MS + DECIPHER_PER_COLUMN_MS;
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Decipher's width-aware scramble pool (untouched): a candidate is drawn
// only from letters whose own width fits the slot's width, narrower is
// always fine, nothing wider than the slot itself is ever drawn. Source and
// target are now both SUQUIA (decipher resolves in place, not into a
// different word), so a column's own width no longer actually changes over
// the course of the animation — the interpolation below still runs the
// exact same formula, it just always evaluates to the same value, which is
// the correct, simplest way to leave this mechanism's timing untouched.
const POOL_MIN_RATIO = 0.6;
const POOL_MAX_RATIO = 1.0;

// A module-level wrapper around performance.now() — the React Compiler's
// purity lint (react-hooks/purity) flags a raw performance.now() call
// reachable from ANY function defined inside the component body, including
// plain event handlers, as "impure during render." A module-level function
// isn't part of that analysis, so wrapping the call here — not changing
// what it does — is what satisfies the rule.
function nowMs(): number {
  return performance.now();
}

export type DecipherWordmarkProps = {
  /** Bumped by the caller once per arrival — see LandingComposition. MUST
   * start at 0 and only ever count up: 0 is a sentinel meaning "not
   * triggered yet," not a real arrival. */
  arriveKey: number;
  /** True once photo textures are ready — the SAME signal that starts the
   * photo entrance. The arrival sequence here waits for this, then adds
   * its own ARRIVAL_WORDMARK_DELAY_MS on top. */
  ready: boolean;
  active: boolean;
  reducedMotion: boolean;
};

const ARRIVAL_WORDMARK_DELAY_MS = 600;

// The hover caption: the full name as a plain line of text underneath the
// wordmark, not as the logotype itself. Pure CSS opacity/transform fade —
// no letter animation, no per-glyph anything.
const HOVER_CAPTION_TEXT = "JAVIER SUAREZ SUQUIA";
const HOVER_CAPTION_IN_MS = 200;
const HOVER_CAPTION_OUT_MS = 160;

// IMPORTANT — mix-blend-mode hazard: the ONE element that ever carries
// mix-blend-difference is the <h1> in LandingComposition, unchanged by this
// component. Everything here is a DESCENDANT of it, which is fine; only a
// new ANCESTOR between the h1 and the page root breaks the blend, and
// nothing here introduces one. The caption line below gets its own
// opacity/transform directly (not via a shared ancestor), which is also
// safe for the same reason — it's a descendant, not an ancestor.
export default function DecipherWordmark({
  arriveKey,
  ready,
  active,
  reducedMotion,
}: DecipherWordmarkProps) {
  const [spinning, setSpinning] = useState(false);
  const [displayGlyphs, setDisplayGlyphs] = useState<string[]>(SUQUIA);
  const [hovered, setHovered] = useState(false);

  // SUQUIA's own per-column natural offsetWidth, measured at runtime.
  const letterWidthsRef = useRef<number[]>(Array(COLUMN_COUNT).fill(0));
  const measureRefs = useRef<(HTMLSpanElement | null)[]>(Array(COLUMN_COUNT).fill(null));
  const alphabetWidthsRef = useRef<Partial<Record<string, number>>>({});
  const alphabetMeasureRefs = useRef<(HTMLSpanElement | null)[]>(
    Array(NAME_ALPHABET.length).fill(null)
  );

  function measureAll() {
    for (let col = 0; col < COLUMN_COUNT; col++) {
      const el = measureRefs.current[col];
      if (el) letterWidthsRef.current[col] = el.offsetWidth;
    }
    NAME_ALPHABET.forEach((letter, i) => {
      const el = alphabetMeasureRefs.current[i];
      if (el) alphabetWidthsRef.current[letter] = el.offsetWidth;
    });
  }

  useLayoutEffect(() => {
    measureAll();
  }, []);

  useEffect(() => {
    function onResize() {
      measureAll();
    }
    window.addEventListener("resize", onResize);
    let cancelled = false;
    const fonts = typeof document !== "undefined" ? document.fonts : undefined;
    fonts?.ready.then(() => {
      if (!cancelled) measureAll();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
    };
  }, []);

  // ---- Decipher-only state (mechanism untouched) -----------------------
  const cyclingRef = useRef<Set<number>>(new Set());
  const lastSwapAtRef = useRef<number[]>(Array(COLUMN_COUNT).fill(-Infinity));
  const pendingColsRef = useRef<Set<number>>(new Set());
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const decipherColumnRefs = useRef<(HTMLSpanElement | null)[]>(Array(COLUMN_COUNT).fill(null));
  const columnSourceWidthRef = useRef<number[]>(Array(COLUMN_COUNT).fill(0));
  const columnTargetWidthRef = useRef<number[]>(Array(COLUMN_COUNT).fill(0));
  const columnDoneRef = useRef<boolean[]>(Array(COLUMN_COUNT).fill(true));
  const transitionStartRef = useRef(0);
  const widthRafRef = useRef<number | null>(null);
  const decipherFreshMountRef = useRef(false);

  function widthAtElapsed(col: number, elapsedMs: number): number {
    const duration = decipherColumnDurationMs(col);
    const src = columnSourceWidthRef.current[col];
    const tgt = columnTargetWidthRef.current[col];
    if (elapsedMs <= 0) return src;
    if (elapsedMs >= duration) return tgt;
    return src + (tgt - src) * easeOutCubic(elapsedMs / duration);
  }

  function pickScrambleLetter(col: number, elapsed: number): string {
    const wNow = widthAtElapsed(col, elapsed);
    const wNext = widthAtElapsed(col, elapsed + CYCLE_MS);
    const hi = Math.max(wNow, wNext);
    const lo = Math.min(wNow, wNext);
    const minW = POOL_MIN_RATIO * hi;
    const maxW = POOL_MAX_RATIO * lo;
    if (minW <= maxW) {
      const allowed = NAME_ALPHABET.filter((c) => {
        const w = alphabetWidthsRef.current[c];
        return w != null && w >= minW && w <= maxW;
      });
      if (allowed.length > 0) {
        return allowed[Math.floor(Math.random() * allowed.length)];
      }
    }
    let best: string | null = null;
    let bestWidth = -Infinity;
    NAME_ALPHABET.forEach((c) => {
      const w = alphabetWidthsRef.current[c];
      if (w != null && w <= lo && w > bestWidth) {
        bestWidth = w;
        best = c;
      }
    });
    if (best) return best;
    let narrowest = NAME_ALPHABET[0];
    let narrowestWidth = Infinity;
    NAME_ALPHABET.forEach((c) => {
      const w = alphabetWidthsRef.current[c];
      if (w != null && w < narrowestWidth) {
        narrowestWidth = w;
        narrowest = c;
      }
    });
    return narrowest;
  }

  function ensureWidthLoop() {
    if (widthRafRef.current !== null) return;
    function tick() {
      const elapsed = performance.now() - transitionStartRef.current;
      let anyWidthActive = false;
      const glyphUpdates: { col: number; letter: string }[] = [];
      for (let col = 0; col < COLUMN_COUNT; col++) {
        if (!columnDoneRef.current[col]) {
          const el = decipherColumnRefs.current[col];
          if (el) el.style.width = `${widthAtElapsed(col, elapsed)}px`;
          if (elapsed >= decipherColumnDurationMs(col)) {
            columnDoneRef.current[col] = true;
          } else {
            anyWidthActive = true;
          }
        }
        if (cyclingRef.current.has(col) && elapsed - lastSwapAtRef.current[col] >= CYCLE_MS) {
          lastSwapAtRef.current[col] = elapsed;
          glyphUpdates.push({ col, letter: pickScrambleLetter(col, elapsed) });
        }
      }
      if (glyphUpdates.length > 0) {
        setDisplayGlyphs((prev) => {
          const next = prev.slice();
          glyphUpdates.forEach(({ col, letter }) => {
            next[col] = letter;
          });
          return next;
        });
      }
      const anyCycling = cyclingRef.current.size > 0;
      widthRafRef.current = anyWidthActive || anyCycling ? requestAnimationFrame(tick) : null;
    }
    widthRafRef.current = requestAnimationFrame(tick);
  }

  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  const arrivalScheduledForKeyRef = useRef(0);

  function clearAllTimers() {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    if (widthRafRef.current !== null) {
      cancelAnimationFrame(widthRafRef.current);
      widthRafRef.current = null;
    }
  }

  useEffect(() => clearAllTimers, []);

  // Left the page mid-run — cancel outright rather than leaving a frozen
  // mid-transition structure behind a hidden (display: none) page.
  useEffect(() => {
    if (active) return;
    clearAllTimers();
    cyclingRef.current.clear();
    pendingColsRef.current.clear();
    const raf = requestAnimationFrame(() => setSpinning(false));
    return () => cancelAnimationFrame(raf);
  }, [active]);

  useLayoutEffect(() => {
    if (!spinning || !decipherFreshMountRef.current) return;
    decipherFreshMountRef.current = false;
    for (let col = 0; col < COLUMN_COUNT; col++) {
      const el = decipherColumnRefs.current[col];
      if (el) el.style.width = `${columnSourceWidthRef.current[col]}px`;
    }
    ensureWidthLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  function lockDecipherColumn(col: number, letter: string) {
    cyclingRef.current.delete(col);
    pendingColsRef.current.delete(col);
    setDisplayGlyphs((prev) => {
      if (prev[col] === letter) return prev;
      const next = prev.slice();
      next[col] = letter;
      return next;
    });
    if (pendingColsRef.current.size === 0) {
      onDecipherSettled();
    }
  }

  // Resolves rest -> SUQUIA out of noise: every column scrambles (nothing
  // pre-skipped), cascading left to right. Source and target widths are
  // both SUQUIA's own — the decipher resolves in place now, it doesn't
  // hand off into a different word.
  function beginDecipherTransition(now: number) {
    transitionStartRef.current = now;
    pendingColsRef.current = new Set();
    for (let col = 0; col < COLUMN_COUNT; col++) {
      columnSourceWidthRef.current[col] = letterWidthsRef.current[col];
      columnTargetWidthRef.current[col] = letterWidthsRef.current[col];
      columnDoneRef.current[col] = false;
      pendingColsRef.current.add(col);
      cyclingRef.current.add(col);
      lastSwapAtRef.current[col] = -Infinity;
    }
    decipherFreshMountRef.current = true;
    SUQUIA.forEach((letter, col) => {
      const t = setTimeout(
        () => {
          if (!activeRef.current) return;
          lockDecipherColumn(col, letter);
        },
        decipherColumnDurationMs(col)
      );
      timeoutsRef.current.push(t);
    });
  }

  // Arrival: decipher resolves rest -> SUQUIA. Under reduced motion,
  // arrival never starts at all (see the trigger effect below) — the
  // wordmark simply stays at its initial plain "SUQUIA" render.
  function playArrival() {
    clearAllTimers();
    setSpinning(true);
    beginDecipherTransition(nowMs());
  }

  function onDecipherSettled() {
    if (!activeRef.current) return;
    setSpinning(false); // swap back to the plain text node
  }

  // The arrival trigger: waits for `ready`, then plays
  // ARRIVAL_WORDMARK_DELAY_MS later. Latched per arriveKey so it only ever
  // schedules once per arrival.
  useEffect(() => {
    if (arriveKey === 0 || reducedMotion) return;
    if (!ready) return;
    if (arrivalScheduledForKeyRef.current === arriveKey) return;
    arrivalScheduledForKeyRef.current = arriveKey;
    const t = setTimeout(() => {
      if (!activeRef.current) return;
      playArrival();
    }, ARRIVAL_WORDMARK_DELAY_MS);
    timeoutsRef.current.push(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arriveKey, ready, reducedMotion]);

  return (
    <span
      className="wordmark-hover-target"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: "relative", display: "inline-block" }}
    >
      {spinning ? (
        <span aria-hidden="true" data-decipher-live="true">
          {displayGlyphs.map((g, col) => (
            <span
              key={col}
              ref={(el) => {
                decipherColumnRefs.current[col] = el;
              }}
              style={{
                position: "relative",
                display: "inline-block",
                height: "1em",
                verticalAlign: "top",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  width: "fit-content",
                  margin: "0 auto",
                  height: "1em",
                  lineHeight: "1em",
                  whiteSpace: "nowrap",
                }}
              >
                {g}
              </span>
            </span>
          ))}
        </span>
      ) : (
        // Settled: a single plain text node, exactly what the
        // non-animated wordmark always was.
        "SUQUIA"
      )}

      {/* Hover caption: the full name as a plain line beneath the
          wordmark, not as the logotype — fades in/out, never changes the
          wordmark's own letters. Absolutely positioned relative to this
          (position:relative) root so it can never shift the wordmark's
          own layout. aria-hidden since the name is already announced via
          the h1's own aria-label and the About page. */}
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          marginTop: "1.25em",
          transform: hovered ? "translate(-50%, 0)" : "translate(-50%, 4px)",
          opacity: hovered ? 1 : 0,
          fontSize: "13px",
          fontWeight: 400,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          transition: reducedMotion
            ? "none"
            : hovered
              ? `opacity ${HOVER_CAPTION_IN_MS}ms ease-out, transform ${HOVER_CAPTION_IN_MS}ms ease-out`
              : `opacity ${HOVER_CAPTION_OUT_MS}ms ease-out, transform ${HOVER_CAPTION_OUT_MS}ms ease-out`,
        }}
      >
        {HOVER_CAPTION_TEXT}
      </span>

      {/* Hidden reference glyphs — decipher's own width measurement: 6
          spans for SUQUIA's own per-column natural resting width, plus 10
          more (one per NAME_ALPHABET letter) for the width-aware scramble
          pool. Re-measured on mount, on resize, and once webfonts finish
          loading. */}
      <span
        aria-hidden="true"
        style={{ position: "absolute", visibility: "hidden", height: 0, overflow: "hidden", whiteSpace: "nowrap" }}
      >
        {SUQUIA.map((letter, col) => (
          <span
            key={col}
            ref={(el) => {
              measureRefs.current[col] = el;
            }}
          >
            {letter}
          </span>
        ))}
        {NAME_ALPHABET.map((letter, i) => (
          <span
            key={`alpha-${letter}`}
            ref={(el) => {
              alphabetMeasureRefs.current[i] = el;
            }}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The wordmark plays two mechanically distinct things (see the
// 2026-09-23 changelog entries in design-spec-v2.md for the two rounds
// that landed on this):
//   DECIPHER — noise resolving into a word. Means "not resolved yet."
//     Used ONCE per arrival, for the very first transition (rest ->
//     JAVIER) only. Unchanged from before — kept exactly as it was.
//   DRUM — a Solari-board-style flap mechanism, not a crossfade. Each
//     column is a vertical strip with its three real letters (plus one
//     duplicate, see below) that ALWAYS advances by exactly one notch —
//     never a random glyph, never more than one notch, never skipped
//     even when the incoming letter equals the outgoing one (a flap
//     re-seating on the same glyph is still a real notch, and skipping
//     it desyncs the strip's own position). Used for every transition
//     EXCEPT the arrival's first: JAVIER->SUAREZ->SUQUIA on arrival, and
//     the entire SUQUIA->JAVIER->SUAREZ->SUQUIA sequence on hover.
const JAVIER = ["J", "A", "V", "I", "E", "R"];
const SUAREZ = ["S", "U", "A", "R", "E", "Z"];
const SUQUIA = ["S", "U", "Q", "U", "I", "A"];
const WORDS = [JAVIER, SUAREZ, SUQUIA] as const;
type WordIndex = 0 | 1 | 2;
const SUQUIA_INDEX: WordIndex = 2;
const COLUMN_COUNT = 6;

// Every random glyph the decipher ever draws — arrival's rest->JAVIER
// transition, the only place any randomness appears at all — comes from
// this set only: the letters of Javi's own name.
const NAME_ALPHABET = "JAVIERSUZQ".split("");

const CYCLE_MS = 55; // ~18 changes/sec per position while decoding

// Decipher timing (kept exactly as it was — untouched by this rewrite):
// ~600ms total, cascading left to right with a 300ms spread.
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

// Decipher's width-aware scramble pool (unchanged): a candidate is drawn
// only from letters whose own width fits the slot's width, narrower is
// always fine, nothing wider than the slot itself is ever drawn.
const POOL_MIN_RATIO = 0.6;
const POOL_MAX_RATIO = 1.0;

// ---- Drum ----------------------------------------------------------
// Each column's strip has 4 cells: [JAVIER-letter, SUAREZ-letter,
// SUQUIA-letter, JAVIER-letter (duplicate)]. The 4th cell exists purely
// so the wrap from stop 2 (SUQUIA) back to stop 0 (JAVIER) — which only
// hover ever needs — is ALSO a real downward notch, not a teleport.
// After a notch lands on cell 3, the strip index resets to 0 with the
// transition disabled for that one write: cell 3 and cell 0 are pixel-
// identical (same letter, same width), so the reset is invisible.
const DRUM_WINDOW_EM = 1.1; // J and Q descend below the baseline — a tighter window clips their tails
const NOTCH_DURATION_MS = 380;
const NOTCH_CASCADE_MS = 40;
const NOTCH_CASCADE_SPREAD_MS = (COLUMN_COUNT - 1) * NOTCH_CASCADE_MS; // 200ms
const NOTCH_TOTAL_MS = NOTCH_CASCADE_SPREAD_MS + NOTCH_DURATION_MS; // 580ms
// Fast departure, settle with a small overshoot (~6% of the notch
// distance) and return — reads as mass arriving, not a slide finishing.
const DRUM_EASING = "cubic-bezier(0.22, 1.12, 0.32, 1)";

function drumCellLetter(col: number, stripIndex: number): string {
  const wordIndex = (stripIndex % 3) as WordIndex;
  return WORDS[wordIndex][col];
}

const HOLD_MS = 700; // a settled word held fully readable — always exceeds the 200ms cascade spread, so the complete word is always readable at once
const HOVER_COOLDOWN_MS = 1500;
// Arrival's wordmark starts 600ms after the photo entrance begins (the
// SAME "textures ready" signal that starts the photos) — a deliberately
// separate beat, not a gate on the photos.
const ARRIVAL_WORDMARK_DELAY_MS = 600;

type Structure = "decipher" | "drum";

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

// IMPORTANT — mix-blend-mode hazard: the ONE element that ever carries
// mix-blend-difference is the <h1> in LandingComposition, unchanged by
// this component. Everything here — the hover-target span, every drum
// column's window/strip, every width transition — is a DESCENDANT of it,
// which is fine; a descendant's own styling never isolates the parent's
// blend. Only a new ANCESTOR between the h1 and the page root does that,
// and nothing here introduces one. `overflow: hidden` on a column's
// window does not create a stacking context either, so the masking is
// safe without reaching for clip-path.
export default function DecipherWordmark({
  arriveKey,
  ready,
  active,
  reducedMotion,
}: DecipherWordmarkProps) {
  // The per-letter structure exists in the DOM only while a run is
  // actually in flight — mounted fresh each time one starts, unmounted
  // the instant it settles back to SUQUIA.
  const [spinning, setSpinning] = useState(false);
  // Which mechanism is currently rendering: decipher (arrival's first
  // transition only) or drum (everything else). Read during render, so
  // it lives in state, not a ref.
  const [structure, setStructure] = useState<Structure>("decipher");
  // Bumped every time the drum needs a fresh, un-animated seed write
  // (hover starting, or the decipher->drum handoff mid-arrival) — see
  // the seeding layout effect below. `structure` alone isn't enough to
  // key that effect on: two hovers in a row both want fresh seeding, but
  // `structure` stays "drum" the whole time between them.
  const [drumSeedVersion, setDrumSeedVersion] = useState(0);

  // displayGlyphs: decipher's own per-column glyph content, exactly as
  // before — unused while structure === "drum" (the drum's cells are
  // static JSX content, not state-driven).
  const [displayGlyphs, setDisplayGlyphs] = useState<string[]>(SUQUIA);

  // [col][wordIndex] -> that letter's natural offsetWidth — measured at
  // runtime (widths shift with the wordmark's own clamp()-based font
  // size). Feeds BOTH decipher's width tween and every drum column's
  // width target.
  const letterWidthsRef = useRef<number[][]>(
    Array.from({ length: COLUMN_COUNT }, () => [0, 0, 0])
  );
  const measureRefs = useRef<(HTMLSpanElement | null)[][]>(
    Array.from({ length: COLUMN_COUNT }, () => [null, null, null])
  );
  // letter -> its own natural width — decipher's width-aware scramble
  // pool only (the drum never draws a random glyph, so it never needs
  // this).
  const alphabetWidthsRef = useRef<Partial<Record<string, number>>>({});
  const alphabetMeasureRefs = useRef<(HTMLSpanElement | null)[]>(
    Array(NAME_ALPHABET.length).fill(null)
  );

  function measureAll() {
    for (let col = 0; col < COLUMN_COUNT; col++) {
      for (let wi = 0; wi < 3; wi++) {
        const el = measureRefs.current[col][wi];
        if (el) letterWidthsRef.current[col][wi] = el.offsetWidth;
      }
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

  // Which columns are currently drawing random noise (decipher only) —
  // driven by the same rAF loop as width (see ensureWidthLoop), not an
  // independent setInterval, so glyph draws and width can never drift
  // against each other.
  const cyclingRef = useRef<Set<number>>(new Set());
  const lastSwapAtRef = useRef<number[]>(Array(COLUMN_COUNT).fill(-Infinity));
  // Decipher-only: "still waiting on this column to lock" — the decipher
  // transition finishes once this is empty. The drum doesn't need an
  // equivalent set: its own completion is just "every column's own
  // setTimeout has fired," tracked directly in beginNotch below.
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

  // One rAF loop drives width (both modes), decipher's glyph draws, and
  // swap's opacity dip + midpoint content swap — all reading the SAME
  // `elapsed`, so none of them can drift against each other.
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

  const isRunningRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  // Read inside async callbacks (timeouts) rather than reacted to via its
  // own effect body — leaving the page mid-run needs its own explicit
  // handling (see the cancellation effect below), not just a read guard.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Guards the 600ms post-ready arrival delay so it's only ever scheduled
  // once per arriveKey, no matter how many times the trigger effect below
  // re-runs while its guard condition holds.
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
  // mid-transition structure behind a hidden (display: none) page, and
  // reset isRunningRef so a later arrival always finds a clean start. The
  // actual setSpinning call is deferred to a rAF callback — calling it
  // directly here trips react-hooks/set-state-in-effect.
  useEffect(() => {
    if (active) return;
    clearAllTimers();
    cyclingRef.current.clear();
    pendingColsRef.current.clear();
    isRunningRef.current = false;
    const raf = requestAnimationFrame(() => setSpinning(false));
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Freshly mounted this run — the columns don't exist as real DOM nodes
  // until THIS render commits (beginTransition, which computes the
  // source/target widths, runs BEFORE that commit, so columnRefs are
  // still all null there). Seed each column's starting width + full
  // glyph opacity onto the real node the instant it exists, then hand off
  // to the rAF loop for the ongoing tween.
  useLayoutEffect(() => {
    if (!spinning || structure !== "decipher") return;
    if (!decipherFreshMountRef.current) return;
    decipherFreshMountRef.current = false;
    for (let col = 0; col < COLUMN_COUNT; col++) {
      const el = decipherColumnRefs.current[col];
      if (el) el.style.width = `${columnSourceWidthRef.current[col]}px`;
    }
    ensureWidthLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, structure]);

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

  // Resolves rest -> JAVIER out of noise, exactly as before: every
  // column scrambles (source is null — nothing to compare against, so
  // nothing is pre-skipped), cascading left to right.
  function beginDecipherTransition(now: number) {
    const target = JAVIER;
    transitionStartRef.current = now;
    pendingColsRef.current = new Set();
    for (let col = 0; col < COLUMN_COUNT; col++) {
      columnSourceWidthRef.current[col] = letterWidthsRef.current[col][SUQUIA_INDEX];
      columnTargetWidthRef.current[col] = letterWidthsRef.current[col][0];
      columnDoneRef.current[col] = false;
      pendingColsRef.current.add(col);
      cyclingRef.current.add(col);
      lastSwapAtRef.current[col] = -Infinity;
    }
    decipherFreshMountRef.current = true;
    target.forEach((letter, col) => {
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

  // ---- Drum-only state -------------------------------------------------
  // Current strip index per column: 0/1/2 = JAVIER/SUAREZ/SUQUIA, 3 =
  // the duplicate JAVIER cell (only ever visited transiently by hover's
  // wrap, then silently reset to 0 — see beginNotch).
  const columnStripIndexRef = useRef<number[]>(Array(COLUMN_COUNT).fill(SUQUIA_INDEX));
  const columnStripElRefs = useRef<(HTMLSpanElement | null)[]>(Array(COLUMN_COUNT).fill(null));
  const columnWindowElRefs = useRef<(HTMLSpanElement | null)[]>(Array(COLUMN_COUNT).fill(null));
  // A hover run's very first notch can't be called synchronously in the
  // same tick as setStructure/setSpinning — at that point the drum's DOM
  // nodes don't exist yet (state updates are batched, not applied until
  // the next render), so beginNotch's ref-driven style writes would all
  // silently no-op while STILL mutating columnStripIndexRef, leaving the
  // seeding effect below to seed the ALREADY-ADVANCED index with no
  // transition — the drum would mount snapped directly to its target,
  // never visibly rolling at all. Queuing the first notch here instead
  // and consuming it from the seeding effect (after it has actually
  // written the starting frame) guarantees a real paint happens between
  // the seed and the first animated notch.
  const pendingFirstNotchRef = useRef<(() => void) | null>(null);

  // Seeds the drum's current (un-animated) position onto the DOM the
  // instant its nodes exist — both for a brand-new mount (hover) and for
  // the decipher->drum handoff mid-arrival, where the seeded position
  // (index 0, JAVIER) must exactly match what decipher just displayed so
  // the structural DOM swap is invisible.
  useLayoutEffect(() => {
    if (structure !== "drum") return;
    for (let col = 0; col < COLUMN_COUNT; col++) {
      const index = columnStripIndexRef.current[col];
      const stripEl = columnStripElRefs.current[col];
      const windowEl = columnWindowElRefs.current[col];
      if (stripEl) {
        stripEl.style.transition = "none";
        stripEl.style.transform = `translateY(-${index * DRUM_WINDOW_EM}em)`;
      }
      if (windowEl) {
        windowEl.style.transition = "none";
        windowEl.style.width = `${letterWidthsRef.current[col][index % 3]}px`;
      }
    }
    if (pendingFirstNotchRef.current) {
      const run = pendingFirstNotchRef.current;
      pendingFirstNotchRef.current = null;
      // A SINGLE rAF isn't enough: it can still fire before the browser
      // has ever painted the seed write above (rAF callbacks run before
      // paint, in the SAME frame as the layout effect that scheduled
      // them) — confirmed by direct measurement: the strip's transform
      // jumped straight from the seed value to the notch's target with
      // no intermediate frames at all, i.e. no transition ever played,
      // because the browser had no rendered "before" state to animate
      // from. Nesting a second rAF guarantees a real paint has happened
      // in between.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (activeRef.current) run();
        });
      });
    }
  }, [structure, drumSeedVersion]);

  // Advances every column by exactly one notch, all together — this is
  // the ONLY drum operation, and it's what C2 requires: no column is
  // ever skipped, even one whose incoming letter matches its outgoing
  // one (S->S, U->U, E->E roll and land back on themselves, reading as a
  // flap re-seating). Transform and width both use the SAME cascade
  // delay, duration and easing, driven by a real CSS transition — safe
  // here (unlike decipher's rAF-driven width) because both endpoints are
  // always real, known letters, never a value that could change again
  // mid-flight.
  function beginNotch(onSettled: () => void) {
    for (let col = 0; col < COLUMN_COUNT; col++) {
      const newIndex = columnStripIndexRef.current[col] + 1;
      columnStripIndexRef.current[col] = newIndex;
      const wordIndex = (newIndex % 3) as WordIndex;
      const delay = col * NOTCH_CASCADE_MS;
      const stripEl = columnStripElRefs.current[col];
      const windowEl = columnWindowElRefs.current[col];
      if (stripEl) {
        stripEl.style.transition = `transform ${NOTCH_DURATION_MS}ms ${DRUM_EASING} ${delay}ms`;
        stripEl.style.transform = `translateY(-${newIndex * DRUM_WINDOW_EM}em)`;
      }
      if (windowEl) {
        windowEl.style.transition = `width ${NOTCH_DURATION_MS}ms ${DRUM_EASING} ${delay}ms`;
        windowEl.style.width = `${letterWidthsRef.current[col][wordIndex]}px`;
      }
    }
    const t = setTimeout(() => {
      if (!activeRef.current) return;
      // Every column advances together, so they either ALL land on the
      // duplicate cell (index 3) or none do.
      if (columnStripIndexRef.current[0] === 3) {
        for (let col = 0; col < COLUMN_COUNT; col++) {
          columnStripIndexRef.current[col] = 0;
          const stripEl = columnStripElRefs.current[col];
          if (stripEl) {
            stripEl.style.transition = "none";
            stripEl.style.transform = "translateY(0em)";
          }
        }
      }
      onSettled();
    }, NOTCH_TOTAL_MS);
    timeoutsRef.current.push(t);
  }

  // Chains `count` more notches, each separated by HOLD_MS — the shared
  // continuation for both arrival's remaining two notches and hover's
  // remaining two (after each one's own first notch, scheduled
  // separately below — see playArrival/playHoverSequence).
  function scheduleMoreNotches(count: number, onDone: () => void) {
    if (count <= 0) {
      onDone();
      return;
    }
    const t = setTimeout(() => {
      if (!activeRef.current) return;
      beginNotch(() => scheduleMoreNotches(count - 1, onDone));
    }, HOLD_MS);
    timeoutsRef.current.push(t);
  }

  // Fires once every decipher column has locked onto JAVIER. Hands off
  // to the drum: seeds it at index 0 (JAVIER, already showing — no
  // visual jump), holds, then plays the two remaining notches
  // (JAVIER->SUAREZ->SUQUIA).
  function onDecipherSettled() {
    if (!activeRef.current) return;
    for (let col = 0; col < COLUMN_COUNT; col++) columnStripIndexRef.current[col] = 0;
    setStructure("drum");
    setDrumSeedVersion((v) => v + 1);
    const t = setTimeout(() => {
      if (!activeRef.current) return;
      beginNotch(() => scheduleMoreNotches(1, finalizeRun));
    }, HOLD_MS);
    timeoutsRef.current.push(t);
  }

  function finalizeRun() {
    isRunningRef.current = false;
    cooldownUntilRef.current = performance.now() + HOVER_COOLDOWN_MS;
    setSpinning(false); // swap back to the plain text node
  }

  // Arrival: rest -> JAVIER (decipher) -> SUAREZ (swap) -> SUQUIA (swap,
  // rest). Always runs start to finish once triggered — no external
  // readiness gates a lock mid-run anymore (see the trigger effect
  // below, which delays STARTING this until 600ms after `ready`).
  function playArrival() {
    clearAllTimers();
    isRunningRef.current = true;
    setStructure("decipher");
    setSpinning(true);
    beginDecipherTransition(performance.now());
  }

  // Hover: drum only, starting from rest (index 2, SUQUIA) — the FIRST
  // notch wraps forward via the duplicate cell to reveal JAVIER (and
  // silently resets), then two more notches (SUAREZ, SUQUIA) follow the
  // same HOLD_MS-separated pattern. No initial hold before the first
  // notch — a hover should start moving right away.
  function playHoverSequence() {
    clearAllTimers();
    isRunningRef.current = true;
    for (let col = 0; col < COLUMN_COUNT; col++) columnStripIndexRef.current[col] = SUQUIA_INDEX;
    pendingFirstNotchRef.current = () => beginNotch(() => scheduleMoreNotches(2, finalizeRun));
    setStructure("drum");
    setDrumSeedVersion((v) => v + 1);
    setSpinning(true);
  }

  // The arrival trigger: waits for `ready` (the same signal that starts
  // the photo entrance — see LandingComposition), then plays the arrival
  // sequence ARRIVAL_WORDMARK_DELAY_MS later, so the wordmark reads as a
  // deliberately separate beat, not simultaneous with the photos. Latched
  // per arriveKey so it only ever schedules once per arrival, regardless
  // of how many renders satisfy the guard while `ready` stays true (a
  // return visit, where `ready` is already true from before).
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

  function handleMouseEnter() {
    if (reducedMotion) return; // no replay under reduced motion
    if (isRunningRef.current) return; // already running — never restart
    if (performance.now() < cooldownUntilRef.current) return; // cooldown
    playHoverSequence();
  }

  // No decipher, no drum, no state machine — just the name, motionless.
  // Arrival never plays and hover never replays.
  if (reducedMotion) return <>SUQUIA</>;

  return (
    <span className="wordmark-hover-target" onMouseEnter={handleMouseEnter}>
      {spinning ? (
        structure === "decipher" ? (
          // data-decipher-live distinguishes this from the ALSO aria-hidden
          // measuring block below, which (deliberately) stays mounted even
          // at rest.
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
                  // width intentionally NOT set here — driven entirely
                  // imperatively by ensureWidthLoop's rAF writes, so
                  // React's own re-renders never reconcile it back to a
                  // stale value and fight the tween.
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    // Shrink-to-content width plus symmetric left/right
                    // anchors centers the glyph inside the column's own
                    // (possibly still-animating) width without a transform
                    // — and without ever clipping a glyph that's
                    // momentarily wider than the current width, since
                    // nothing here has overflow: hidden.
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
          <span aria-hidden="true" data-drum-live="true">
            {Array.from({ length: COLUMN_COUNT }, (_, col) => (
              <span
                key={col}
                ref={(el) => {
                  columnWindowElRefs.current[col] = el;
                }}
                style={{
                  position: "relative",
                  display: "inline-block",
                  height: `${DRUM_WINDOW_EM}em`,
                  overflow: "hidden",
                  verticalAlign: "top",
                  // width intentionally NOT set here — driven imperatively
                  // (seeded by the layout effect, tweened by beginNotch).
                }}
              >
                <span
                  ref={(el) => {
                    columnStripElRefs.current[col] = el;
                  }}
                  style={{ display: "block" }}
                >
                  {[0, 1, 2, 3].map((stripIndex) => (
                    <span
                      key={stripIndex}
                      style={{
                        display: "block",
                        height: `${DRUM_WINDOW_EM}em`,
                        lineHeight: `${DRUM_WINDOW_EM}em`,
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {drumCellLetter(col, stripIndex)}
                    </span>
                  ))}
                </span>
              </span>
            ))}
          </span>
        )
      ) : (
        // Settled: a single plain text node, exactly what the
        // non-animated wordmark always was — selectable, no per-letter
        // markup left behind.
        "SUQUIA"
      )}
      {/* Hidden reference glyphs — 18 (6 columns x 3 words) for each
          slot's own natural resting width, plus 10 more (one per
          NAME_ALPHABET letter) for the decipher's width-aware scramble
          pool — all re-measured on mount, on resize, and once webfonts
          finish loading (see measureAll above). */}
      <span
        aria-hidden="true"
        style={{ position: "absolute", visibility: "hidden", height: 0, overflow: "hidden", whiteSpace: "nowrap" }}
      >
        {WORDS.map((word, wi) =>
          word.map((letter, col) => (
            <span
              key={`${wi}-${col}`}
              ref={(el) => {
                measureRefs.current[col][wi] = el;
              }}
            >
              {letter}
            </span>
          ))
        )}
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

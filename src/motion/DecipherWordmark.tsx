"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The wordmark's animation, used in two moments with the same language:
// on ARRIVAL, as the page's own loading indicator (no spinner — this IS
// the loading state, see LandingComposition), and on HOVER, reading the
// full name in order. Both are built on one primitive, a DECIPHER: a
// six-letter word resolving out of noise into a target word, one
// position at a time, left to right — a signal locking in, not a
// mechanical drum. No rotation, no clipping window, no crossfade layers.
const JAVIER = ["J", "A", "V", "I", "E", "R"];
const SUAREZ = ["S", "U", "A", "R", "E", "Z"];
const SUQUIA = ["S", "U", "Q", "U", "I", "A"];
const WORDS = [JAVIER, SUAREZ, SUQUIA] as const;
type WordIndex = 0 | 1 | 2;
const SUQUIA_INDEX: WordIndex = 2;
const COLUMN_COUNT = 6;

// Every random glyph that ever appears — arrival's indefinite scramble
// included — comes from this set only: the letters of Javi's own name,
// nothing else. Even the noise is his name. (Which of these a given
// tick actually draws from is further filtered by slot width — see
// pickScrambleLetter below; this is the full set before that filter.)
const NAME_ALPHABET = "JAVIERSUZQ".split("");

const CYCLE_MS = 55; // ~18 changes/sec per position — decoding, not flicker
const CASCADE_MS = 50; // a transition's own columns lock this far apart
const CASCADE_SPREAD_MS = (COLUMN_COUNT - 1) * CASCADE_MS; // 250ms, 6 columns
const TRANSITION_MS = 400; // one A->B decipher, start to every column locked
// How long a column spends actually cycling once it reaches its own
// cascade slot: the last column's own slot (250ms) plus its own
// cycle-then-lock duration must land on the transition's total (400ms).
const PER_COLUMN_CYCLE_MS = TRANSITION_MS - CASCADE_SPREAD_MS; // 150ms

// EB Garamond's capitals are proportional, not monospaced — at the
// wordmark's real size the widest letter (Q) is ~2.2x the narrowest
// (I), so a slot sized for one glyph can badly overflow into its
// neighbours when a random wide letter lands in it. Two things fix
// this together, not either alone:
//   1. a slot's own WIDTH tweens smoothly from its source letter's
//      width to its target's, on the SAME per-column clock as its
//      glyph lock (columnTweenDurationMs below) — never snapping to
//      match whatever random glyph is currently showing, which would
//      make the word jitter at the scramble rate instead of breathing
//      once per transition;
//   2. the RANDOM POOL a column draws from is filtered, every tick, to
//      letters whose own measured width roughly fits the slot's width
//      — not just at the instant of drawing, but across the WHOLE
//      upcoming tick interval (see pickScrambleLetter): the width
//      keeps moving continuously between ticks, so a letter valid only
//      at the instant it's drawn can already overflow by the time the
//      next tick would otherwise replace it. Both the tween and the
//      pool read from the SAME analytic function (widthAtElapsed) —
//      not one CSS-interpolated and the other DOM-sampled — so there's
//      no race between what the pool thinks the width is and what's
//      actually painted.
// A column's own tween duration: starts when the transition starts
// (T0, same instant for every column), ends exactly at that column's
// own lock moment (T0 + its cascade slot + its own cycle time) — so
// column 0 finishes easing at T0+150ms, column 5 at T0+400ms, matching
// how they actually lock, left to right.
function columnTweenDurationMs(col: number): number {
  return col * CASCADE_MS + PER_COLUMN_CYCLE_MS;
}
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
// A candidate letter is drawn only if its own width is within this
// band of the slot's width — wide enough to still read as "filling" a
// wide slot, narrow enough not to overflow a narrow one. The upper
// bound is 1.0, not the 1.12 an early draft used: 1.12 permits real
// overflow (12% of a 100+px slot is itself 12+px), and since slots sit
// edge-to-edge with no gap, that overflow lands directly as measured
// overlap with the neighbour — up to ~10px in practice, confirmed via
// the per-frame glyph-advance-box verification below. A 1.0 ceiling
// caps every column's own worst-case overflow at essentially zero,
// which is what actually guarantees adjacent glyphs never overlap by
// more than a rounding fraction of a pixel, at the cost of the
// occasional widest letter (e.g. Q) dropping out of a slot's pool
// slightly before that slot's own width has grown to meet it.
const POOL_MIN_RATIO = 0.6;
const POOL_MAX_RATIO = 1.0;

const HOLD_MS = 800; // JAVIER / SUAREZ held fully readable during hover
const HOVER_COOLDOWN_MS = 1500;
// Even when the scene is ready instantly, the arrival still plays a
// short decipher rather than jump-cutting to static text — this is the
// reveal, not an artificial wait. 300ms of scramble + the 400ms lock-in
// = ~700ms total, matching the brief.
const MIN_ARRIVAL_SCRAMBLE_MS = 300;

type Step = { word: WordIndex; holdMs: number };
// SUQUIA -(400)-> JAVIER (held 800) -(400)-> SUAREZ (held 800) -(400)->
// SUQUIA (rest). 400+800+400+800+400 = 2800ms, matching "total ~2.8s".
const HOVER_QUEUE: Step[] = [
  { word: 0, holdMs: HOLD_MS },
  { word: 1, holdMs: HOLD_MS },
  { word: SUQUIA_INDEX, holdMs: 0 },
];

export type DecipherWordmarkProps = {
  /** Bumped by the caller once per arrival — see LandingComposition. MUST
   * start at 0 and only ever count up: 0 is a sentinel meaning "not
   * triggered yet," not a real arrival (a plain useEffect fires once on
   * mount regardless of its dependencies' initial values). */
  arriveKey: number;
  /** True once photo textures are ready to be revealed. While false, the
   * arrival keeps scrambling indefinitely — that, plus the still-piled
   * photos, IS the loading state, no spinner needed. The moment this
   * flips true, the scramble plays its lock-in to SUQUIA and stops. */
  ready: boolean;
  /** Fired once the arrival's lock-in to SUQUIA finishes, carrying back
   * the arriveKey it was answering. LandingComposition compares this
   * against its own current arriveKey (equal = THIS arrival's name has
   * locked) instead of tracking a separately-reset boolean — so there's
   * no ordering hazard between "a new arrival started" and "the old
   * arrival's lock landed" arriving in the same commit. */
  onArrived: (arriveKey: number) => void;
  active: boolean;
  reducedMotion: boolean;
};

// IMPORTANT — mix-blend-mode hazard (this has broken the wordmark
// before, see LandingComposition's own note on the <h1>): the ONE
// element that ever carries mix-blend-difference is that <h1> itself,
// unchanged by this component. Everything here — the hover-target span,
// every column, every width tween — is a DESCENDANT of it, which is
// fine; a descendant's own styling never isolates the parent's blend.
// Only a new ANCESTOR between the h1 and the page root does that, and
// nothing here introduces one. Verified over a photo, mid-scramble,
// during every hold, and at rest.
export default function DecipherWordmark({
  arriveKey,
  ready,
  onArrived,
  active,
  reducedMotion,
}: DecipherWordmarkProps) {
  // The per-letter structure exists in the DOM only while a decipher run
  // is actually in flight — mounted fresh each time one starts, unmounted
  // the instant it settles back to SUQUIA. Settled (plain text, no
  // per-letter markup) is both the initial state and the resting state
  // after every run, so the DOM a screen reader or text-selection sees
  // is, for all but the run's own ~0.7-2.8s, just the word itself.
  const [spinning, setSpinning] = useState(false);
  const [displayGlyphs, setDisplayGlyphs] = useState<string[]>(SUQUIA);

  // [col][wordIndex] -> that letter's natural offsetWidth, AND (below)
  // letter -> that same letter's own width independent of column —
  // both measured at runtime from the actual rendered font, never
  // hardcoded (widths shift with the wordmark's own clamp()-based
  // font-size, so a value baked in at one viewport would be wrong at
  // another). offsetWidth, never getBoundingClientRect(), is the
  // convention for this kind of measurement everywhere in this codebase
  // (getBoundingClientRect() reports the axis-aligned box AFTER any
  // ancestor transform, which is what silently broke the rotated CREDITS
  // label elsewhere). Re-measured on mount, on resize (the clamp()
  // means actual pixel widths change with viewport width), and once
  // document.fonts.ready resolves (a measurement taken against a
  // fallback face, before EB Garamond has actually loaded, would be
  // wrong) — see measureAll and the effect below.
  const letterWidthsRef = useRef<number[][]>(
    Array.from({ length: COLUMN_COUNT }, () => [0, 0, 0])
  );
  const measureRefs = useRef<(HTMLSpanElement | null)[][]>(
    Array.from({ length: COLUMN_COUNT }, () => [null, null, null])
  );
  // letter -> its own natural width, independent of which column/word
  // it's measured through — what the width-aware scramble pool (see
  // pickScrambleLetter) filters candidates against.
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

  // Which columns are currently showing random noise rather than a
  // locked, final letter — driven by the SAME rAF loop as width (see
  // ensureWidthLoop below), not an independent setInterval. Glyph
  // cycling used to run on its own setInterval(CYCLE_MS): under real
  // load setInterval can fire meaningfully later than its nominal
  // delay, so a letter chosen as valid for "now plus one nominal tick"
  // could sit on screen, stale, well past the point its own width no
  // longer fit — confirmed by measurement (~20px overlaps) and only
  // fully resolved by computing glyph draws and width from the exact
  // same per-frame `elapsed`, with no independent clock to drift
  // against it.
  const cyclingRef = useRef<Set<number>>(new Set());
  // elapsed-ms-since-transition-start at which each column last drew a
  // new glyph — compared against CYCLE_MS every rAF frame to decide
  // whether it's time to draw again.
  const lastSwapAtRef = useRef<number[]>(Array(COLUMN_COUNT).fill(-Infinity));
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const columnRefs = useRef<(HTMLSpanElement | null)[]>(Array(COLUMN_COUNT).fill(null));
  // The word the CURRENT transition is resolving to — what a column
  // falls back to if the width-aware pool comes up empty for its
  // current width (see pickScrambleLetter).
  const currentTargetRef = useRef<string[]>(SUQUIA);

  // Width is driven entirely by this rAF loop, writing el.style.width
  // imperatively — deliberately NEVER part of the React style prop (see
  // the JSX below), so React's own re-renders (every glyph tick changes
  // displayGlyphs) never fight it, the same reason animated transform
  // values are handled this way elsewhere in this codebase's motion
  // components. A single analytic function (widthAtElapsed) is the ONE
  // source of truth both this loop and the scramble pool read from, so
  // the two can never disagree about what the slot's width actually is
  // at a given instant.
  const columnSourceWidthRef = useRef<number[]>(Array(COLUMN_COUNT).fill(0));
  const columnTargetWidthRef = useRef<number[]>(Array(COLUMN_COUNT).fill(0));
  const columnDoneRef = useRef<boolean[]>(Array(COLUMN_COUNT).fill(true));
  const transitionStartRef = useRef(0);
  const widthRafRef = useRef<number | null>(null);

  function widthAtElapsed(col: number, elapsedMs: number): number {
    const duration = columnTweenDurationMs(col);
    const src = columnSourceWidthRef.current[col];
    const tgt = columnTargetWidthRef.current[col];
    if (elapsedMs <= 0) return src;
    if (elapsedMs >= duration) return tgt;
    return src + (tgt - src) * easeOutCubic(elapsedMs / duration);
  }

  // A candidate is drawn only from letters whose own width fits the
  // slot's width across the WHOLE upcoming tick interval, not just the
  // instant it's drawn — the slot keeps tweening continuously between
  // ticks, so a letter valid only right now could already be badly
  // overflowing by the time the NEXT tick would otherwise replace it.
  // Both endpoints read the same analytic widthAtElapsed the rAF loop
  // uses, so this is never out of sync with what's actually painted.
  //
  // When the ratio band's intersection is empty (the slot is moving
  // fast relative to it), the fallback is NOT simply "the target
  // letter" — target[col] can itself be wider than the slot's current
  // width, since the slot hasn't finished tweening toward it yet
  // (confirmed: falling back to the target unconditionally produced
  // ~20px overlaps whenever a wide target letter got shown well before
  // its own slot had widened enough for it). Instead, fall back to the
  // WIDEST alphabet letter that still fits within the tick's tightest
  // width WITHOUT overflowing at all — guaranteed safe regardless of
  // what a neighbouring column independently draws, at the cost of
  // occasionally under-filling the slot rather than over-filling it.
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
    // Every letter (even the narrowest, "I") is wider than the slot —
    // shouldn't happen in practice (the slot always tweens between two
    // real letters' widths, both >= I's), but pick the least-wide
    // overflow available rather than crash.
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

  // One rAF loop drives both width AND glyph cycling, reading the SAME
  // `elapsed` for both every frame — see the cyclingRef comment above
  // for why that unification is load-bearing, not just tidiness.
  function ensureWidthLoop() {
    if (widthRafRef.current !== null) return;
    function tick() {
      const elapsed = performance.now() - transitionStartRef.current;
      let anyWidthActive = false;
      const glyphUpdates: { col: number; letter: string }[] = [];
      for (let col = 0; col < COLUMN_COUNT; col++) {
        if (!columnDoneRef.current[col]) {
          const el = columnRefs.current[col];
          if (el) el.style.width = `${widthAtElapsed(col, elapsed)}px`;
          if (elapsed >= columnTweenDurationMs(col)) {
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
  // Read inside async callbacks (timeouts/intervals) rather than reacted
  // to via its own effect body — see the cancellation effect below for
  // why leaving the page needs its own explicit handling, not just a
  // read guard.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // A run's own bookkeeping: remaining steps to play (hover only —
  // arrival is always a single step), the word we're currently at or
  // transitioning to (source for the NEXT step's comparison), which
  // arriveKey started the current run (only set for arrival runs, so
  // finalizeRun knows whether/what to report back), and the hold before
  // the next queued step begins.
  const queueRef = useRef<Step[]>([]);
  const currentWordRef = useRef<WordIndex>(SUQUIA_INDEX);
  const pendingHoldMsRef = useRef(0);
  const runArriveKeyRef = useRef<number | null>(null);
  const arrivalAwaitingReadyRef = useRef(false);
  const arrivalScrambleStartRef = useRef(0);
  const pendingLockRef = useRef<{ cols: number[]; target: string[] } | null>(null);
  // True only for a run's own FIRST transition, when the per-column
  // elements are being mounted for the first time this run (a moment
  // ago, this was plain static text) — see the layout effect below for
  // why that specific moment needs its own handling.
  const freshMountRef = useRef(false);

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
  // mid-decipher structure behind a hidden (display: none) page, and
  // reset isRunningRef so a later arrival always finds a clean start. All
  // the ref/timer bookkeeping happens immediately and synchronously; only
  // the actual setSpinning call is deferred to a rAF callback — calling
  // it directly here trips react-hooks/set-state-in-effect, the same fix
  // used throughout this codebase for this exact situation (a rAF
  // callback runs asynchronously, not as part of the effect's own
  // synchronous body). One frame's delay is imperceptible.
  useEffect(() => {
    if (active) return;
    clearAllTimers();
    cyclingRef.current.clear();
    pendingLockRef.current = null;
    arrivalAwaitingReadyRef.current = false;
    isRunningRef.current = false;
    runArriveKeyRef.current = null;
    const raf = requestAnimationFrame(() => setSpinning(false));
    return () => cancelAnimationFrame(raf);
  }, [active]);

  // Freshly mounted this run — the columns don't exist as real DOM
  // nodes until THIS render commits (beginTransition, which computes
  // columnSourceWidthRef/columnTargetWidthRef, runs BEFORE that commit,
  // so columnRefs are still all null there). Seed each column's
  // starting width onto the real node the instant it exists, before
  // this frame paints, then hand off to the rAF loop for the ongoing
  // tween — mirrors why the old CSS-transition version needed a
  // fresh-mount special case, just via an imperative write instead of
  // a double-rAF style flip.
  useLayoutEffect(() => {
    if (!spinning) return;
    for (let col = 0; col < COLUMN_COUNT; col++) {
      const el = columnRefs.current[col];
      if (el) el.style.width = `${columnSourceWidthRef.current[col]}px`;
    }
    ensureWidthLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning]);

  function lockColumn(col: number, letter: string) {
    cyclingRef.current.delete(col);
    setDisplayGlyphs((prev) => {
      if (prev[col] === letter) return prev;
      const next = prev.slice();
      next[col] = letter;
      return next;
    });
    if (cyclingRef.current.size === 0) {
      onStepLocked();
    }
  }

  function scheduleColumnLocks(cols: number[], target: string[]) {
    cols.forEach((col) => {
      const t = setTimeout(
        () => {
          if (!activeRef.current) return;
          lockColumn(col, target[col]);
        },
        columnTweenDurationMs(col)
      );
      timeoutsRef.current.push(t);
    });
  }

  // A position whose letter is unchanged between source and target is
  // already "locked" — it never joins the cycling set at all, which is
  // what keeps it visually still (e.g. the shared "SU" between SUAREZ
  // and SUQUIA, or the "E" JAVIER and SUAREZ share) rather than
  // animating into an identical copy of itself. Its width is a no-op
  // tween too (same letter, same natural width), so it never needs the
  // rAF loop's attention either.
  function beginTransition(
    wordIndex: WordIndex,
    sourceWordIndex: WordIndex | null,
    scheduleLocksNow: boolean,
    now: number
  ) {
    const target = WORDS[wordIndex];
    const source = sourceWordIndex === null ? null : WORDS[sourceWordIndex];
    currentWordRef.current = wordIndex;
    currentTargetRef.current = target;

    transitionStartRef.current = now;
    const changingCols: number[] = [];
    const sameLetterCols: number[] = [];
    for (let col = 0; col < COLUMN_COUNT; col++) {
      const sameLetter = !!source && source[col] === target[col];
      // Freshly mounting: there's no PREVIOUS transition's target width
      // to inherit, so the slot's starting width is whatever the just-
      // hidden static "SUQUIA" text showed. Otherwise, the previous
      // transition's target IS this transition's source — the column
      // is already sitting exactly there (its own tween finished
      // precisely at its own lock moment, which already happened).
      columnSourceWidthRef.current[col] = freshMountRef.current
        ? letterWidthsRef.current[col][SUQUIA_INDEX]
        : columnTargetWidthRef.current[col];
      columnTargetWidthRef.current[col] = letterWidthsRef.current[col][wordIndex];
      columnDoneRef.current[col] = sameLetter;
      if (sameLetter) {
        sameLetterCols.push(col);
      } else {
        changingCols.push(col);
        cyclingRef.current.add(col);
        // -Infinity so the rAF loop's very next frame draws this
        // column's first glyph immediately, rather than waiting a full
        // CYCLE_MS from some stale previous transition's timestamp.
        lastSwapAtRef.current[col] = -Infinity;
      }
    }

    if (freshMountRef.current) {
      // Columns don't exist as real DOM nodes yet — the layout effect
      // keyed on `spinning` does the actual first write and starts the
      // rAF loop once they do.
      freshMountRef.current = false;
    } else {
      // Already mounted from an earlier transition this run — seed and
      // resume the tween directly.
      for (let col = 0; col < COLUMN_COUNT; col++) {
        const el = columnRefs.current[col];
        if (el) el.style.width = `${columnSourceWidthRef.current[col]}px`;
      }
      ensureWidthLoop();
    }

    // Two passes, deliberately not one: lockColumn's "is everything
    // done" check reads cyclingRef.current.size, so EVERY column that's
    // actually going to cycle must already be registered there before
    // any same-letter column is locked synchronously below. A single
    // combined loop got this wrong whenever a same-letter column's
    // index came before a changing one's — e.g. SUAREZ->SUQUIA, where
    // columns 0-1 ("SU") are unchanged and columns 2-5 change: locking
    // column 0 first found cyclingRef still empty (columns 2-5 hadn't
    // been reached yet) and wrongly concluded the transition was
    // already complete, finalizing the run before the real scramble
    // ever played. JAVIER->SUAREZ never exposed this (its one
    // unchanged column, 4, sits after several changing ones), which is
    // exactly why it needed a targeted decipher-run trace to catch.
    sameLetterCols.forEach((col) => lockColumn(col, target[col]));

    if (scheduleLocksNow) {
      scheduleColumnLocks(changingCols, target);
    } else {
      pendingLockRef.current = { cols: changingCols, target };
    }
  }

  // Fires once every column of the CURRENT step has locked. Either
  // starts the next queued step (hover's chain) after that step's own
  // hold, or — an empty queue — ends the run.
  function onStepLocked() {
    if (!activeRef.current) return;
    const holdMs = pendingHoldMsRef.current;
    const t = setTimeout(() => {
      if (!activeRef.current) return;
      const next = queueRef.current.shift();
      if (!next) {
        finalizeRun();
        return;
      }
      pendingHoldMsRef.current = next.holdMs;
      beginTransition(next.word, currentWordRef.current, true, performance.now());
    }, holdMs);
    timeoutsRef.current.push(t);
  }

  function finalizeRun() {
    isRunningRef.current = false;
    cooldownUntilRef.current = performance.now() + HOVER_COOLDOWN_MS;
    setSpinning(false); // swap back to the plain text node
    const finishedArrival = runArriveKeyRef.current;
    runArriveKeyRef.current = null;
    if (finishedArrival !== null) onArrived(finishedArrival);
  }

  // Arrival: begins cycling toward SUQUIA immediately, but its lock-in
  // is deliberately DEFERRED (scheduleLocksNow: false) — see
  // releaseArrivalLockIfNeeded, called once `ready` flips true.
  function playArrival() {
    clearAllTimers();
    isRunningRef.current = true;
    runArriveKeyRef.current = arriveKey;
    queueRef.current = [];
    pendingHoldMsRef.current = 0;
    currentWordRef.current = SUQUIA_INDEX;
    freshMountRef.current = true;
    setSpinning(true);
    const now = performance.now();
    beginTransition(SUQUIA_INDEX, null, false, now);
    arrivalAwaitingReadyRef.current = true;
    arrivalScrambleStartRef.current = now;
  }

  function releaseArrivalLockIfNeeded() {
    if (!arrivalAwaitingReadyRef.current) return;
    arrivalAwaitingReadyRef.current = false;
    const elapsed = performance.now() - arrivalScrambleStartRef.current;
    const delay = Math.max(0, MIN_ARRIVAL_SCRAMBLE_MS - elapsed);
    const t = setTimeout(() => {
      if (!activeRef.current) return;
      const pending = pendingLockRef.current;
      pendingLockRef.current = null;
      if (pending) scheduleColumnLocks(pending.cols, pending.target);
    }, delay);
    timeoutsRef.current.push(t);
  }

  function playHoverSequence() {
    clearAllTimers();
    isRunningRef.current = true;
    runArriveKeyRef.current = null; // not an arrival run — nothing to report
    currentWordRef.current = SUQUIA_INDEX; // hover always starts from rest
    freshMountRef.current = true;
    queueRef.current = HOVER_QUEUE.slice(1);
    pendingHoldMsRef.current = HOVER_QUEUE[0].holdMs;
    setSpinning(true);
    beginTransition(HOVER_QUEUE[0].word, SUQUIA_INDEX, true, performance.now());
  }

  // The arrival trigger, and the ready-gate that releases its deferred
  // lock-in. One effect handles both: `ready` can already be true the
  // very first time this fires (a return visit, textures cached from
  // before), so the release check has to run in the SAME pass that
  // starts the run, not only on a LATER change of `ready`.
  useEffect(() => {
    if (arriveKey === 0 || reducedMotion) return;
    if (!isRunningRef.current) playArrival();
    if (ready) releaseArrivalLockIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arriveKey, ready, reducedMotion]);

  function handleMouseEnter() {
    if (reducedMotion) return; // no replay under reduced motion
    if (isRunningRef.current) return; // already running — never restart
    if (performance.now() < cooldownUntilRef.current) return; // cooldown
    playHoverSequence();
  }

  // No decipher, no state machine — just the name, motionless. Arrival
  // never scrambles and hover never replays; LandingComposition's own
  // reduced-motion path doesn't wait on onArrived at all (see its
  // comment), so this component simply has nothing left to report.
  if (reducedMotion) return <>SUQUIA</>;

  return (
    <span className="wordmark-hover-target" onMouseEnter={handleMouseEnter}>
      {spinning ? (
        // data-decipher-live distinguishes this from the ALSO
        // aria-hidden measuring block below, which (deliberately) stays
        // mounted even at rest — a plain aria-hidden selector alone
        // can't tell "a run is actually in flight" from "just the
        // permanent measuring spans," this attribute can.
        <span aria-hidden="true" data-decipher-live="true">
          {displayGlyphs.map((g, col) => (
            <span
              key={col}
              ref={(el) => {
                columnRefs.current[col] = el;
              }}
              style={{
                position: "relative",
                display: "inline-block",
                height: "1em",
                verticalAlign: "top",
                // width intentionally NOT set here — it's driven
                // entirely imperatively by ensureWidthLoop's rAF writes
                // (see the layout effect and beginTransition above), so
                // React's own re-renders (every glyph tick changes
                // displayGlyphs) never reconcile it back to a stale
                // value and fight the tween.
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
                  // — and without ever clipping a random glyph that's
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
        // Settled: a single plain text node, exactly what the
        // non-animated wordmark always was — selectable, no per-letter
        // markup left behind.
        "SUQUIA"
      )}
      {/* Hidden reference glyphs — 18 (6 columns x 3 words) for each
          slot's own natural resting width, plus 10 more (one per
          NAME_ALPHABET letter) for the width-aware scramble pool — all
          re-measured on mount, on resize, and once webfonts finish
          loading (see measureAll above). visibility:hidden +
          position:absolute: zero footprint, doesn't affect the
          wordmark's selectable text or its accessible name (pinned to
          "Suquia" via aria-label on the <h1>, regardless of what's
          rendered inside it). */}
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

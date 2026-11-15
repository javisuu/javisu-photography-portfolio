// Carousel→album transition state (spec 019). Module-level on purpose: it
// has to survive the client-side route change from /albums to
// /album/[slug] (and back), which unmounts both pages' trees — only the
// root layout's AlbumTransitionLayer and this module live across it.
//
// Plain external store (subscribe/get) so React reads it through
// useSyncExternalStore and non-React code (the GSAP timeline, the
// carousel's pointer handler) writes it directly.

export type TransitionPhase =
  // Nothing in flight. The default, and what every direct load starts in.
  | "reposo"
  // Carousel → album: clones are flying.
  | "ida"
  // Flight landed; real elements shown, clones gone. Lasts until the
  // album page unmounts or a new transition starts.
  | "asentado"
  // Album → carousel.
  | "vuelta";

export type SlideRole =
  // The one lámina that ends up in photo 1's slot.
  | "sube"
  // Right of the open slide (and the open slide itself when it isn't photo
  // 1): leaves through the bottom.
  | "baja"
  // Left of the open slide, except the one that rises: leaves through the top.
  | "arriba";

export type SlideSnapshot = {
  absIndex: number;
  role: SlideRole;
  /** The <img>'s currentSrc at click time — already decoded, so a clone
   * built from it paints on its first frame. */
  src: string;
  naturalWidth: number;
  /** Visible box at click time (getBoundingClientRect of the frame). */
  x: number;
  y: number;
  width: number;
  /** The counter-scaled child's transform-origin ("100% 0" or "0 0"). */
  pinnedOrigin: string;
  /** The <img>'s drift translateX, px. */
  driftPx: number;
  panelOpacity: number;
};

export type TextSnapshot = {
  text: string;
  /** Box of the text itself (a Range over its text node), not of its
   * element: it depends only on font and size, so source and target can
   * be matched by scale whatever their line-heights. */
  x: number;
  y: number;
  width: number;
  height: number;
  className: string;
};

export type FirstPhoto = { src: string; width: number; height: number; title: string };

export type OpenSnapshot = {
  slug: string;
  /** True when the album's cover is its photo 1 (norte, ny): the open
   * lámina itself rises. Otherwise the lámina left of it does (america, sol). */
  coverIsFirst: boolean;
  firstPhoto: FirstPhoto;
  slides: SlideSnapshot[];
  title: TextSnapshot;
  description: TextSnapshot;
  viewportHeight: number;
};

export type TargetName = "title" | "description" | "label" | "nav" | "photo1";

type Event = { t: number; name: string };

type State = {
  phase: TransitionPhase;
  /** How the album page currently mounting should arrive. Read once, at
   * mount, by AlbumPhotos and TransitionTarget. */
  arrival: "normal" | "transicion";
  snapshot: OpenSnapshot | null;
  /** Album the carousel opens on when it next mounts (respuesta 6). */
  savedSlug: string | null;
  /** Album opened from the carousel, so the history entry behind it is
   * /albums: "← ALBUMS" can go back instead of pushing a new entry. */
  fromCarousel: string | null;
  t0: number;
  events: Event[];
};

let state: State = {
  phase: "reposo",
  arrival: "normal",
  snapshot: null,
  savedSlug: null,
  fromCarousel: null,
  t0: 0,
  events: [],
};

const listeners = new Set<() => void>();
const targets = new Map<TargetName, HTMLElement>();
const targetListeners = new Set<() => void>();

export function getState(): State {
  return state;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function mark(name: string) {
  const t = performance.now();
  state.events.push({ t: Math.round(t - state.t0), name });
}

export function registerTarget(name: TargetName, el: HTMLElement | null) {
  if (el) targets.set(name, el);
  else targets.delete(name);
  for (const l of targetListeners) l();
}

export function getTarget(name: TargetName) {
  return targets.get(name) ?? null;
}

export function subscribeTargets(listener: () => void) {
  targetListeners.add(listener);
  return () => {
    targetListeners.delete(listener);
  };
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Read-only probe for scripts/diagnostico.mjs (section `transicion`), like
// window.__atlas. Never written by the diagnostic.
export type TransitionProbe = {
  readonly fase: TransitionPhase;
  readonly llegada: "normal" | "transicion";
  readonly slug: string | null;
  readonly guardado: string | null;
  /** performance.now() at the click. */
  readonly t0: number;
  /** ms since t0. */
  readonly eventos: readonly Event[];
};

declare global {
  interface Window {
    __transicion?: TransitionProbe;
  }
}

if (typeof window !== "undefined") {
  window.__transicion = {
    get fase() {
      return state.phase;
    },
    get llegada() {
      return state.arrival;
    },
    get slug() {
      return state.snapshot?.slug ?? null;
    },
    get guardado() {
      return state.savedSlug;
    },
    get t0() {
      return state.t0;
    },
    get eventos() {
      return state.events.slice();
    },
  };
}

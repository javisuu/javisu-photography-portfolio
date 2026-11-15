// The carousel→album flight itself (spec 019): clones of the carousel's own
// slide nodes, moved by GSAP inside AlbumTransitionLayer's fixed container.
//
// Imperative on purpose. The clones are `cloneNode(true)` copies of the
// carousel's real DOM — same markup, same <img> with the same srcset,
// already decoded — so the layer "reuses the components" (Javi's answer 1)
// literally, and every handover (carousel → clones at the click, clones →
// album page at landing) happens inside one task, with no React commit in
// between that could let a frame paint with neither side visible.
//
// Only transform and opacity are ever animated (spec CA7). Frame geometry
// follows carouselGeometry.ts: a frame laid out at its natural width,
// scaled to its visible width, with the inverse scale on its child.

import { gsap } from "gsap";
import { getImageProps } from "next/image";
import { SLIDE_HEIGHT, naturalWidthFor } from "../carouselGeometry";
import {
  getState,
  getTarget,
  mark,
  prefersReducedMotion,
  setState,
  subscribeTargets,
  type FirstPhoto,
  type OpenSnapshot,
  type SlideSnapshot,
  type TextSnapshot,
} from "./store";

// --- Choreography (plan.md, "Coreografia"; Javi tunes these in T10) -------
const RISE_S = 0.9; // the rising lámina and the title, click to landing
const RISE_MIN_S = 0.6; // if the album page mounts late, never faster than this
const EXIT_S = 0.6; // each lámina leaving through the top or bottom
const EXIT_STAGGER_S = 0.04; // between consecutive láminas in a cascade
const EXIT_TOTAL_MAX_S = 0.9; // the whole cascade, last lámina included
const EXIT_MARGIN_PX = 40; // how far past the viewport edge a lámina ends
const DESCRIPTION_DELAY_S = 0.06; // title and description never move as one block
const FADE_IN_S = 0.3; // label and photo nav
const FADE_IN_LEAD_S = 0.25; // they start this long before landing
const MOUNT_TIMEOUT_MS = 1500; // album page not ready by then: fade instead

// The album page's photo 1 <img> sizes (src/motion/AlbumPhotos.tsx): the
// rising lámina loads exactly the same candidate, so the album's own <img>
// finds it in the cache and the landing handover is the same pixels.
export const ALBUM_PHOTO_SIZES = "(max-width: 768px) 90vw, 70vw";

export function albumPhotoImgProps(photo: FirstPhoto) {
  return getImageProps({
    src: photo.src,
    alt: photo.title,
    width: photo.width,
    height: photo.height,
    sizes: ALBUM_PHOTO_SIZES,
  }).props;
}

// Warms the cache with an album's photo 1 at the album page's size, so the
// rising lámina and the album's own <img> don't wait on the network.
const preloaded = new Map<string, Promise<void>>();
export function preloadFirstPhoto(photo: FirstPhoto): Promise<void> {
  let p = preloaded.get(photo.src);
  if (!p) {
    const props = albumPhotoImgProps(photo);
    const img = new Image();
    if (props.sizes) img.sizes = props.sizes;
    if (props.srcSet) img.srcset = props.srcSet;
    img.src = props.src;
    p = img.decode().catch(() => undefined);
    preloaded.set(photo.src, p);
  }
  return p;
}

// --- Container ------------------------------------------------------------
let container: HTMLDivElement | null = null;
export function setContainer(el: HTMLDivElement | null) {
  container = el;
}

// --- Flight state -----------------------------------------------------------
type Live = {
  tweens: gsap.core.Animation[];
  timeout: number;
  unsubTargets: (() => void) | null;
  unlockScroll: () => void;
  /** Rising lámina and texts handed over to the album page. */
  landed: boolean;
  /** Exit clones gone. The flight is over once both are true. */
  exitsDone: boolean;
};
let live: Live | null = null;

export type CarouselElements = {
  frames: Map<number, HTMLElement>;
  title: HTMLElement;
  description: HTMLElement;
  /** Everything else on screen that has to leave with the láminas through
   * the bottom: the "NN / 04" counter, the hover rule under the title. */
  extras: HTMLElement[];
};

function textBox(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const r = range.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function snapText(el: HTMLElement): TextSnapshot {
  return { text: el.textContent ?? "", ...textBox(el), className: el.className };
}

function parseTranslateX(transform: string) {
  const m = /translateX\((-?[\d.]+)px\)/.exec(transform);
  return m ? parseFloat(m[1]) : 0;
}

/** Reads the carousel as it is at the click. Null when the flight can't be
 * built (e.g. the lámina that should rise is off-screen mid-fling): the
 * caller then just navigates, as before spec 019. */
export function snapshotCarousel(
  els: CarouselElements,
  activeAbs: number,
  slug: string,
  coverSrc: string,
  firstPhoto: FirstPhoto,
  naturalWidthOf: (absIndex: number) => number
): OpenSnapshot | null {
  const coverIsFirst = coverSrc === firstPhoto.src;
  const risingAbs = coverIsFirst ? activeAbs : activeAbs - 1;
  const vw = window.innerWidth;
  const slides: SlideSnapshot[] = [];
  for (const [absIndex, frame] of els.frames) {
    const r = frame.getBoundingClientRect();
    if (r.right <= 0 || r.left >= vw) continue;
    const inner = frame.firstElementChild as HTMLElement | null;
    const img = frame.querySelector("img");
    const panel = inner?.lastElementChild as HTMLElement | null;
    if (!inner || !img || !panel) continue;
    slides.push({
      absIndex,
      role: absIndex === risingAbs ? "sube" : absIndex < activeAbs ? "arriba" : "baja",
      src: img.currentSrc || img.src,
      naturalWidth: naturalWidthOf(absIndex),
      x: r.left,
      y: r.top,
      width: r.width,
      pinnedOrigin: inner.style.transformOrigin || "0 0",
      driftPx: parseTranslateX(img.style.transform),
      panelOpacity: parseFloat(getComputedStyle(panel).opacity),
    });
  }
  if (!slides.some((s) => s.role === "sube")) return null;
  return {
    slug,
    coverIsFirst,
    firstPhoto,
    slides,
    title: snapText(els.title),
    description: snapText(els.description),
    viewportHeight: window.innerHeight,
  };
}

// --- Clones -----------------------------------------------------------------
type SlideClone = {
  snap: SlideSnapshot;
  wrapper: HTMLElement; // carries the exit translateY
  frame: HTMLElement;
  inner: HTMLElement;
  img: HTMLImageElement;
  panel: HTMLElement;
  naturalWidth: number;
};

function writeFrame(c: SlideClone, x: number, y: number, k: number, width: number) {
  c.frame.style.transform = `translate(${x}px, ${y}px) scale(${(k * width) / c.naturalWidth}, ${k})`;
  c.inner.style.transform = `scaleX(${c.naturalWidth / width})`;
}

function cloneSlide(source: HTMLElement, snap: SlideSnapshot): SlideClone | null {
  const frame = source.cloneNode(true) as HTMLElement;
  frame.removeAttribute("data-carousel-slide");
  frame.querySelector("a")?.remove();
  frame.dataset.transicionRol = snap.role;
  frame.style.top = "0px";
  frame.style.left = "0px";
  const inner = frame.firstElementChild as HTMLElement | null;
  const img = frame.querySelector("img");
  const panel = inner?.lastElementChild as HTMLElement | null;
  if (!inner || !img || !panel) return null;
  const wrapper = document.createElement("div");
  wrapper.style.position = "absolute";
  wrapper.style.left = "0px";
  wrapper.style.top = "0px";
  wrapper.appendChild(frame);
  const c: SlideClone = { snap, wrapper, frame, inner, img, panel, naturalWidth: snap.naturalWidth };
  writeFrame(c, snap.x, snap.y, 1, snap.width);
  return c;
}

/** Swaps the rising lámina's photo for the album's photo 1 (america, sol):
 * under its panel, at the click — never on the open lámina (spec CA6). The
 * frame is re-laid out at photo 1's natural width; its visible width stays
 * the same, so nothing moves. */
function swapToFirstPhoto(c: SlideClone, photo: FirstPhoto) {
  const props = albumPhotoImgProps(photo);
  const natural = naturalWidthFor(photo);
  c.naturalWidth = natural;
  c.frame.style.width = `${natural}px`;
  c.img.style.width = `${natural}px`;
  c.img.loading = "eager";
  c.img.removeAttribute("srcset");
  if (props.sizes) c.img.sizes = props.sizes;
  if (props.srcSet) c.img.srcset = props.srcSet;
  c.img.src = props.src;
  c.img.alt = photo.title;
  writeFrame(c, c.snap.x, c.snap.y, 1, c.snap.width);
  mark("relevo-textura");
}

/** A frozen copy of a carousel element, absolutely placed at its current
 * box, with the computed text styles it inherited baked in (it no longer
 * sits under the same parents). */
function cloneBox(source: HTMLElement, role: string) {
  const el = source.cloneNode(true) as HTMLElement;
  // Carousel hover cue (a CSS transition on transform/width): the box is
  // read as it is, and a transition would fight GSAP.
  el.classList.remove("album-title", "album-rule");
  const cs = getComputedStyle(source);
  const r = source.getBoundingClientRect();
  Object.assign(el.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    margin: "0px",
    width: `${r.width}px`,
    height: `${r.height}px`,
    whiteSpace: "nowrap",
    color: cs.color,
    backgroundColor: cs.backgroundColor,
    fontFamily: cs.fontFamily,
    fontSize: cs.fontSize,
    fontWeight: cs.fontWeight,
    fontVariantNumeric: cs.fontVariantNumeric,
    letterSpacing: cs.letterSpacing,
    textTransform: cs.textTransform,
    lineHeight: cs.lineHeight,
    transformOrigin: "0 0",
    transform: `translate(${r.left}px, ${r.top}px)`,
    transition: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  el.dataset.transicionRol = role;
  return { el, r };
}

type TextClone = {
  el: HTMLElement;
  /** Offset of the text box inside the element, at scale 1. */
  ox: number;
  oy: number;
  w: number;
  h: number;
  /** The text box on screen, where the source sits. */
  box: { x: number; y: number; width: number; height: number };
};

/** A frozen copy of a text element plus where its text box sits inside it
 * (a Range over its text, see TextSnapshot in store.ts): morphs move text
 * boxes, not element boxes, so line-heights never matter. */
function cloneText(source: HTMLElement, role: string): TextClone {
  const box = textBox(source);
  const { el, r } = cloneBox(source, role);
  return { el, ox: box.x - r.left, oy: box.y - r.top, w: box.width, h: box.height, box };
}

// --- Text morphs (Javi, 2026-11-15) -----------------------------------------
// Carousel and album set the same words differently: the title at 30px/400
// vs 110px/500, the place line in tracked caps vs normal case. Scaling one
// clone can't land on the other's glyphs, so each text flies as two
// clones, the carousel's and a copy of the album's own element, sharing one
// moving text box. Title: the box's width is interpolated too and both
// stretch slightly to fill it while they cross-fade mid-flight. Place line:
// a scramble (the nav labels' effect) hides the swap of case and size.
const TITLE_FADE = [0.3, 0.7] as const;
const SCRAMBLE_START = 0.1; // A's letters start scrambling
const SCRAMBLE_SWAP = 0.45; // A → B, both scrambled
const SCRAMBLE_RESOLVE = [0.5, 0.95] as const; // B resolves left to right
const SCRAMBLE_TICK_MS = 40;

function randomLike(c: string) {
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  if (/\p{Lu}/u.test(c)) return pick("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  if (/\p{Ll}/u.test(c)) return pick("abcdefghijklmnopqrstuvwxyz");
  if (/\d/.test(c)) return pick("0123456789");
  return c; // spaces, dashes and commas hold still
}

/** Text with chars [0, resolved) final and the rest random (re-rolled
 * once per tick). */
function scrambled(text: string, resolved: number, cache: { tick: number; out: string[] }, tick: number) {
  if (cache.tick !== tick || cache.out.length !== text.length) {
    cache.tick = tick;
    cache.out = [...text].map(randomLike);
  }
  const chars = [...text];
  return chars.map((c, i) => (i < resolved ? c : cache.out[i] ?? c)).join("");
}

const smooth = (p: number, a: number, b: number) => {
  const x = Math.min(1, Math.max(0, (p - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Flies text clone `a` (already in the layer, at its own box) to where `b`
 * sits, handing over from a to b on the way. b is appended here. */
function morphText(me: Live, a: TextClone, b: TextClone, delay: number, duration: number, mode: "fundido" | "scramble") {
  const ease = gsap.parseEase("power3.inOut");
  const from = a.box;
  const to = b.box;
  b.el.style.opacity = "0";
  container?.appendChild(b.el);
  const finalA = a.el.textContent ?? "";
  const finalB = b.el.textContent ?? "";
  const nA = [...finalA].length;
  const nB = [...finalB].length;
  const cacheA = { tick: -1, out: [] as string[] };
  const cacheB = { tick: -1, out: [] as string[] };
  const place = (c: TextClone, X: number, Y: number, W: number, H: number, stretch: boolean) => {
    const sy = H / c.h;
    const sx = stretch ? W / c.w : sy;
    c.el.style.transform = `translate(${X - sx * c.ox}px, ${Y - sy * c.oy}px) scale(${sx}, ${sy})`;
  };
  const q = { p: 0 };
  let startedAt = 0;
  me.tweens.push(
    gsap.to(q, {
      p: 1,
      duration,
      delay,
      ease: "none",
      onStart: () => {
        startedAt = performance.now();
      },
      onUpdate: () => {
        const p = q.p;
        const u = ease(p);
        const X = from.x + (to.x - from.x) * u;
        const Y = from.y + (to.y - from.y) * u;
        const W = from.width + (to.width - from.width) * u;
        const H = from.height + (to.height - from.height) * u;
        if (mode === "fundido") {
          const f = smooth(p, TITLE_FADE[0], TITLE_FADE[1]);
          place(a, X, Y, W, H, true);
          place(b, X, Y, W, H, true);
          a.el.style.opacity = String(1 - f);
          b.el.style.opacity = String(f);
          return;
        }
        const tick = Math.floor((performance.now() - startedAt) / SCRAMBLE_TICK_MS);
        if (p < SCRAMBLE_SWAP) {
          place(a, X, Y, W, H, false);
          // Letters go random left to right, so none is left final at the swap.
          const randomUpTo = Math.ceil(nA * smooth(p, SCRAMBLE_START, SCRAMBLE_SWAP - 0.05));
          const s = [...scrambled(finalA, 0, cacheA, tick)];
          a.el.textContent = [...finalA].map((c, i) => (i < randomUpTo ? s[i] : c)).join("");
          a.el.style.opacity = "1";
          b.el.style.opacity = "0";
        } else {
          place(b, X, Y, W, H, false);
          const resolved = Math.floor(nB * smooth(p, SCRAMBLE_RESOLVE[0], SCRAMBLE_RESOLVE[1]));
          b.el.textContent = p >= 1 ? finalB : scrambled(finalB, resolved, cacheB, tick);
          a.el.style.opacity = "0";
          b.el.style.opacity = "1";
        }
      },
    })
  );
}

// --- Scroll lock (Javi's answer 8) -------------------------------------------
function lockScroll() {
  const keys = new Set([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"]);
  const block = (e: Event) => e.preventDefault();
  const onKey = (e: KeyboardEvent) => {
    if (keys.has(e.key)) e.preventDefault();
  };
  window.addEventListener("wheel", block, { passive: false });
  window.addEventListener("touchmove", block, { passive: false });
  window.addEventListener("keydown", onKey);
  return () => {
    window.removeEventListener("wheel", block);
    window.removeEventListener("touchmove", block);
    window.removeEventListener("keydown", onKey);
  };
}

// --- The flight ---------------------------------------------------------------
function albumPhoto1(): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>('[data-photo-index="0"] img');
}

function targetsReady() {
  return !!(getTarget("title") && getTarget("description") && albumPhoto1());
}

/** Cancels whatever is in flight and empties the layer. Leaves the album
 * page's own elements visible. */
export function abortFlight(reason: string) {
  if (!live) return;
  mark(`abortado:${reason}`);
  finish(true);
}

function revealAlbum() {
  for (const name of ["title", "description", "label", "nav"] as const) {
    const t = getTarget(name);
    if (t) t.style.opacity = "";
  }
  const row = document.querySelector<HTMLElement>('[data-photo-index="0"]');
  if (row) row.style.opacity = "1";
}

function finish(clearAll: boolean) {
  if (!live) return;
  if (live.landed) {
    // Already handed over; only exit clones can be left.
    if (clearAll) {
      for (const t of live.tweens) t.kill();
      container?.replaceChildren();
      live = null;
    }
    return;
  }
  live.landed = true;
  window.clearTimeout(live.timeout);
  live.unsubTargets?.();
  live.unlockScroll();
  // Same task: real elements on, rising clone and texts off.
  revealAlbum();
  if (container) {
    if (clearAll) {
      for (const t of live.tweens) t.kill();
      container.replaceChildren();
    } else {
      container.querySelectorAll('[data-transicion-rol="sube"], [data-transicion-rol="titulo"], [data-transicion-rol="descripcion"]').forEach((n) => {
        (n.closest("[data-transicion-envoltorio]") ?? n).remove();
      });
    }
  }
  const done = clearAll || live.exitsDone;
  if (done) live = null;
  setState({ phase: "asentado", arrival: "normal" });
  mark("asentado");
}

/** Starts the outbound flight. Must be called synchronously from the click
 * handler, before the carousel hides itself and before router.push: the
 * clones are in the layer by the time this returns, so the carousel can
 * vanish in the same task with no blank frame. */
export function startAlbumOpen(snapshot: OpenSnapshot, els: CarouselElements) {
  if (!container) return false;
  if (live) abortFlight("nuevo-clic");
  container.replaceChildren();

  const t0 = performance.now();
  setState({ phase: "ida", arrival: "transicion", snapshot, savedSlug: snapshot.slug, fromCarousel: snapshot.slug, t0, events: [] });
  mark("clic");

  // Build clones: exits first, rising last so it paints on top.
  const clones: SlideClone[] = [];
  for (const snap of snapshot.slides) {
    const source = els.frames.get(snap.absIndex);
    if (!source) continue;
    const c = cloneSlide(source, snap);
    if (c) clones.push(c);
  }
  clones.sort((a, b) => Number(a.snap.role === "sube") - Number(b.snap.role === "sube"));
  for (const c of clones) {
    c.wrapper.dataset.transicionEnvoltorio = "";
    container.appendChild(c.wrapper);
  }
  const rising = clones.find((c) => c.snap.role === "sube")!;
  if (!snapshot.coverIsFirst) swapToFirstPhoto(rising, snapshot.firstPhoto);

  const title = cloneText(els.title, "titulo");
  const description = cloneText(els.description, "descripcion");
  container.appendChild(title.el);
  container.appendChild(description.el);
  const extras = els.extras
    .filter((e) => e.getBoundingClientRect().width > 0)
    .map((e) => {
      const { el, r } = cloneBox(e, "extra");
      container!.appendChild(el);
      return { el, r };
    });

  const tweens: gsap.core.Animation[] = [];
  live = { tweens, timeout: 0, unsubTargets: null, unlockScroll: lockScroll(), landed: false, exitsDone: false };
  const me = live;

  // Exits start at once: they don't depend on the album page.
  const vh = snapshot.viewportHeight;
  const down = clones.filter((c) => c.snap.role === "baja").sort((a, b) => a.snap.x - b.snap.x);
  const up = clones.filter((c) => c.snap.role === "arriba").sort((a, b) => b.snap.x - a.snap.x);
  const stagger = (n: number) => (n > 1 ? Math.min(EXIT_STAGGER_S, (EXIT_TOTAL_MAX_S - EXIT_S) / (n - 1)) : 0);
  const sDown = stagger(down.length);
  down.forEach((c, i) => {
    tweens.push(gsap.to(c.wrapper, { y: vh - c.snap.y + EXIT_MARGIN_PX, duration: EXIT_S, ease: "power2.in", delay: i * sDown }));
  });
  const sUp = stagger(up.length);
  up.forEach((c, i) => {
    tweens.push(gsap.to(c.wrapper, { y: -(c.snap.y + SLIDE_HEIGHT) - EXIT_MARGIN_PX, duration: EXIT_S, ease: "power2.in", delay: i * sUp }));
  });
  // The counter and the hover rule go down with the last lámina. Their
  // transform already holds their position, so GSAP's `y` can't be used:
  // the translate is written whole.
  for (const { el, r } of extras) {
    const q = { y: r.top };
    tweens.push(
      gsap.to(q, {
        y: vh + EXIT_MARGIN_PX,
        duration: EXIT_S,
        ease: "power2.in",
        delay: Math.max(0, down.length - 1) * sDown,
        onUpdate: () => {
          el.style.transform = `translate(${r.left}px, ${q.y}px)`;
        },
      })
    );
  }
  tweens.push(
    gsap.delayedCall(EXIT_TOTAL_MAX_S + 0.05, () => {
      if (live !== me) return;
      me.exitsDone = true;
      container?.querySelectorAll('[data-transicion-rol="baja"], [data-transicion-rol="arriba"], [data-transicion-rol="extra"]').forEach((n) => {
        (n.closest("[data-transicion-envoltorio]") ?? n).remove();
      });
      if (me.landed) live = null;
    })
  );

  // Rise + texts wait for the album page and photo 1.
  let started = false;
  const tryStart = () => {
    if (started || live !== me || !targetsReady()) return;
    started = true;
    me.unsubTargets?.();
    me.unsubTargets = null;
    Promise.all([document.fonts.ready, preloadFirstPhoto(snapshot.firstPhoto), albumPhoto1()?.decode().catch(() => undefined)]).then(() => {
      if (live !== me) return;
      rise(me, rising, title, description, t0);
    });
  };
  me.unsubTargets = subscribeTargets(tryStart);
  tryStart();

  me.timeout = window.setTimeout(() => {
    if (live !== me || started) return;
    mark("tope-montaje");
    // Fade fallback: the album never mounted in time.
    tweens.push(gsap.to(container!.children, { opacity: 0, duration: FADE_IN_S }));
    finish(false);
  }, MOUNT_TIMEOUT_MS);

  return true;
}

function rise(
  me: Live,
  rising: SlideClone,
  title: TextClone,
  description: TextClone,
  t0: number
) {
  const img = albumPhoto1()!;
  const T = img.getBoundingClientRect();
  mark("subida");
  const elapsed = (performance.now() - t0) / 1000;
  const duration = Math.min(RISE_S, Math.max(RISE_MIN_S, RISE_S - elapsed));

  // Lámina: position, uniform zoom k, visible width (unfold), drift, panel.
  const s = rising.snap;
  const p = { x: s.x, y: s.y, k: 1, w: s.width, drift: s.driftPx, panel: s.panelOpacity };
  const end = { x: T.left, y: T.top, k: T.height / SLIDE_HEIGHT, w: rising.naturalWidth, drift: 0, panel: 0 };
  // The panel follows openness, as in the carousel (carouselGeometry.ts,
  // PANEL_OPACITY): from whatever it was at the click down to 0 as the
  // frame reaches full width.
  me.tweens.push(
    gsap.to(p, {
      ...end,
      duration,
      ease: "power3.inOut",
      onUpdate: () => {
        writeFrame(rising, p.x, p.y, p.k, p.w);
        rising.img.style.transform = `translateX(${p.drift}px)`;
        rising.panel.style.opacity = String(p.panel);
      },
      onComplete: () => {
        if (live !== me) return;
        const real = albumPhoto1();
        const land = () => {
          if (live === me) finish(false);
        };
        // The album's own <img> must be decoded before it takes over.
        if (real && !real.complete) real.decode().then(land, land);
        else land();
      },
    })
  );

  // Texts: each on its own, as a pair of clones sharing one text box (see
  // "Text morphs" above).
  const textDuration = (delay: number) => Math.max(0.3, duration - delay);
  const titleTarget = getTarget("title")?.firstElementChild as HTMLElement | null;
  if (titleTarget) morphText(me, title, cloneText(titleTarget, "titulo"), 0, textDuration(0), "fundido");
  const descriptionTarget = getTarget("description")?.firstElementChild as HTMLElement | null;
  if (descriptionTarget) {
    morphText(
      me,
      description,
      cloneText(descriptionTarget, "descripcion"),
      DESCRIPTION_DELAY_S,
      textDuration(DESCRIPTION_DELAY_S),
      "scramble"
    );
  }

  // Label and photo nav: a plain fade, ending with the landing.
  const fades = (["label", "nav"] as const).map((n) => getTarget(n)).filter((n): n is HTMLElement => !!n);
  if (fades.length) {
    me.tweens.push(
      gsap.to(fades, {
        opacity: 1,
        duration: FADE_IN_S,
        delay: Math.max(0, duration - FADE_IN_LEAD_S),
        ease: "none",
      })
    );
  }
}

// --- The way back (T7, Javi's answer 6) --------------------------------------
// Browser back from an album to /albums. Two steps, because the album page
// and the carousel are never mounted at the same time:
//   1. prepareReturn(), from the layer's popstate listener, BEFORE Next swaps
//      the route: freezes the album's photo 1, title, place line, label and
//      photo nav as clones in the layer, so the unmount shows no blank frame.
//   2. startAlbumReturn(), from the carousel once it has mounted (hidden) on
//      the same album: the outbound choreography in reverse. If the album
//      had been scrolled, only a fade, with the title still travelling
//      (spec: "La asimetria es deliberada").
const RETURN_FADE_S = 0.3; // scrolled album: the carousel fades in
const RETURN_IMG_WAIT_MS = 400; // the open slide's photo, at most, before flying

type ReturnPrep = {
  slug: string;
  scrolled: boolean;
  photo: { el: HTMLImageElement; rect: DOMRect } | null;
  title: TextClone | null;
  description: TextClone | null;
  fades: HTMLElement[];
  timeout: number;
};
let back: ReturnPrep | null = null;

function clearAll() {
  if (live) {
    for (const t of live.tweens) t.kill();
    window.clearTimeout(live.timeout);
    live.unsubTargets?.();
    live.unlockScroll();
    live = null;
  }
  if (back) {
    window.clearTimeout(back.timeout);
    back = null;
  }
  container?.replaceChildren();
}

export function prepareReturn(slug: string) {
  if (!container) return;
  clearAll();
  if (prefersReducedMotion()) return; // T8
  const scrolled = window.scrollY > 1;
  const childOf = (name: "title" | "description" | "label" | "nav") =>
    getTarget(name)?.firstElementChild as HTMLElement | null;

  let photo: ReturnPrep["photo"] = null;
  let description: TextClone | null = null;
  const fades: HTMLElement[] = [];
  if (!scrolled) {
    const img = albumPhoto1();
    if (img) {
      const rect = img.getBoundingClientRect();
      // Same URL as the album's <img>, which is decoded: paints at once.
      const el = img.cloneNode(false) as HTMLImageElement;
      el.removeAttribute("srcset");
      el.src = img.currentSrc || img.src;
      Object.assign(el.style, {
        position: "absolute",
        left: "0px",
        top: "0px",
        margin: "0px",
        maxWidth: "none",
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        visibility: "visible",
        opacity: "1",
      });
      el.dataset.transicionRol = "foto";
      container.appendChild(el);
      photo = { el, rect };
    }
    for (const name of ["label", "nav"] as const) {
      const source = childOf(name);
      if (!source || source.getBoundingClientRect().width === 0) continue;
      const { el } = cloneBox(source, "extra");
      container.appendChild(el);
      fades.push(el);
    }
    const d = childOf("description");
    if (d) {
      description = cloneText(d, "descripcion");
      description.el.style.transform = `translate(${description.box.x - description.ox}px, ${description.box.y - description.oy}px)`;
      container.appendChild(description.el);
    }
  }
  // The title travels both ways, scrolled or not.
  const t = childOf("title");
  let title: TextClone | null = null;
  if (t) {
    title = cloneText(t, "titulo");
    title.el.style.transform = `translate(${title.box.x - title.ox}px, ${title.box.y - title.oy}px)`;
    container.appendChild(title.el);
  }

  setState({ phase: "vuelta", arrival: "normal", savedSlug: slug, fromCarousel: null, t0: performance.now(), events: [] });
  mark(scrolled ? "vuelta-fundido" : "vuelta");
  const me: ReturnPrep = { slug, scrolled, photo, title, description, fades, timeout: 0 };
  me.timeout = window.setTimeout(() => {
    // The carousel never picked it up: fade the clones away.
    if (back !== me) return;
    mark("tope-vuelta");
    back = null;
    const els = container ? [...container.children] : [];
    gsap.to(els, {
      opacity: 0,
      duration: FADE_IN_S,
      onComplete: () => {
        if (back || live) return;
        container?.replaceChildren();
        setState({ phase: "reposo" });
      },
    });
  }, MOUNT_TIMEOUT_MS);
  back = me;
}

/** Leaving /albums again before the way back has finished. */
export function abortReturn(reason: string) {
  if (getState().phase !== "vuelta") return;
  mark(`abortado:${reason}`);
  clearAll();
  setState({ phase: "reposo" });
}

export function isReturnPending(slug: string) {
  return getState().phase === "vuelta" && back?.slug === slug;
}

/** Called by the carousel, mounted and hidden on the saved album. Returns
 * false when there's nothing to pick up; the caller then just shows itself. */
export function startAlbumReturn(
  root: HTMLElement,
  els: CarouselElements,
  activeAbs: number,
  slug: string,
  coverSrc: string,
  firstPhoto: FirstPhoto,
  naturalWidthOf: (absIndex: number) => number
) {
  const prep = back;
  if (!prep || !container || prep.slug !== slug) return false;
  window.clearTimeout(prep.timeout);
  back = null;

  const tweens: gsap.core.Animation[] = [];
  const me: Live = { tweens, timeout: 0, unsubTargets: null, unlockScroll: lockScroll(), landed: false, exitsDone: true };
  live = me;
  const done = () => {
    if (live !== me) return;
    me.unlockScroll();
    // Same task: real carousel on, clones off.
    root.style.visibility = "";
    root.style.opacity = "";
    els.title.style.visibility = "";
    container?.replaceChildren();
    live = null;
    setState({ phase: "reposo" });
    mark("reposo");
  };

  const snapshot = prep.scrolled || !prep.photo ? null : snapshotCarousel(els, activeAbs, slug, coverSrc, firstPhoto, naturalWidthOf);

  if (!snapshot) {
    // Scrolled (or the slot can't be read): the carousel fades in and only
    // the title travels.
    for (const n of [...container.children]) if (n !== prep.title?.el) n.remove();
    els.title.style.visibility = "hidden";
    root.style.opacity = "0";
    root.style.visibility = "";
    tweens.push(gsap.to(root, { opacity: 1, duration: RETURN_FADE_S, ease: "none" }));
    if (prep.title) morphText(me, prep.title, cloneText(els.title, "titulo"), 0, RETURN_FADE_S, "fundido");
    tweens.push(gsap.delayedCall(RETURN_FADE_S + 0.02, done));
    return true;
  }

  // Slide clones, built from the carousel at rest on the saved album.
  const clones: SlideClone[] = [];
  for (const snap of snapshot.slides) {
    const source = els.frames.get(snap.absIndex);
    if (!source) continue;
    const c = cloneSlide(source, snap);
    if (c) clones.push(c);
  }
  clones.sort((a, b) => Number(a.snap.role === "sube") - Number(b.snap.role === "sube"));
  const rising = clones.find((c) => c.snap.role === "sube")!;
  // The rising lámina carries the album's own photo 1 file, already decoded
  // (the album page showed it); the carousel's cover candidate may not be.
  swapToFirstPhoto(rising, firstPhoto);
  const vh = window.innerHeight;
  const offY = (c: SlideClone) =>
    c.snap.role === "baja" ? vh - c.snap.y + EXIT_MARGIN_PX : -(c.snap.y + SLIDE_HEIGHT) - EXIT_MARGIN_PX;
  for (const c of clones) {
    c.wrapper.dataset.transicionEnvoltorio = "";
    if (c !== rising) gsap.set(c.wrapper, { y: offY(c) });
  }
  const T = prep.photo!.rect;
  const p = { x: T.left, y: T.top, k: T.height / SLIDE_HEIGHT, w: rising.naturalWidth, drift: 0, panel: 0 };
  const paintRising = () => {
    writeFrame(rising, p.x, p.y, p.k, p.w);
    rising.img.style.transform = `translateX(${p.drift}px)`;
    rising.panel.style.opacity = String(p.panel);
  };
  paintRising();
  // Insert under the frozen texts and fades, swapping out the frozen photo
  // in the same task.
  const firstText = container.firstChild;
  for (const c of clones) container.insertBefore(c.wrapper, prep.photo?.el ?? firstText);
  prep.photo?.el.remove();
  const extras = els.extras
    .filter((e) => e.getBoundingClientRect().width > 0)
    .map((e) => {
      const { el, r } = cloneBox(e, "extra");
      el.style.transform = `translate(${r.left}px, ${vh + EXIT_MARGIN_PX}px)`;
      container!.appendChild(el);
      return { el, r };
    });
  root.style.visibility = "hidden";

  const fly = () => {
    if (live !== me) return;
    mark("vuelo-vuelta");
    const s = rising.snap;
    tweens.push(
      gsap.to(p, {
        x: s.x,
        y: s.y,
        k: 1,
        w: s.width,
        drift: s.driftPx,
        panel: s.panelOpacity,
        duration: RISE_S,
        ease: "power3.inOut",
        onUpdate: paintRising,
      })
    );
    // What left last comes back first; arriving, so easing out.
    const down = clones.filter((c) => c.snap.role === "baja").sort((a, b) => b.snap.x - a.snap.x);
    const up = clones.filter((c) => c.snap.role === "arriba").sort((a, b) => a.snap.x - b.snap.x);
    const stagger = (n: number) => (n > 1 ? Math.min(EXIT_STAGGER_S, (EXIT_TOTAL_MAX_S - EXIT_S) / (n - 1)) : 0);
    const cascade = (list: SlideClone[]) => {
      const st = stagger(list.length);
      list.forEach((c, i) => {
        tweens.push(
          gsap.to(c.wrapper, { y: 0, duration: EXIT_S, ease: "power2.out", delay: EXIT_TOTAL_MAX_S - EXIT_S - (list.length - 1 - i) * st })
        );
      });
    };
    cascade(down);
    cascade(up);
    for (const { el, r } of extras) {
      const q = { y: vh + EXIT_MARGIN_PX };
      tweens.push(
        gsap.to(q, {
          y: r.top,
          duration: EXIT_S,
          ease: "power2.out",
          delay: EXIT_TOTAL_MAX_S - EXIT_S,
          onUpdate: () => {
            el.style.transform = `translate(${r.left}px, ${q.y}px)`;
          },
        })
      );
    }
    if (prep.fades.length) tweens.push(gsap.to(prep.fades, { opacity: 0, duration: FADE_IN_S, ease: "none" }));
    if (prep.title) morphText(me, prep.title, cloneText(els.title, "titulo"), 0, RISE_S, "fundido");
    if (prep.description) {
      morphText(
        me,
        prep.description,
        cloneText(els.description, "descripcion"),
        DESCRIPTION_DELAY_S,
        RISE_S - DESCRIPTION_DELAY_S,
        "scramble"
      );
    }
    tweens.push(gsap.delayedCall(Math.max(RISE_S, EXIT_TOTAL_MAX_S) + 0.02, done));
  };

  // The open slide's photo (the cover) arrives in plain sight: wait for it,
  // briefly; the frozen album holds the screen meanwhile.
  const openImg = clones.find((c) => c.snap.absIndex === activeAbs)?.img;
  const wait = openImg && !openImg.complete ? openImg.decode().catch(() => undefined) : Promise.resolve();
  Promise.race([wait, new Promise((r) => window.setTimeout(r, RETURN_IMG_WAIT_MS))]).then(fly);
  return true;
}

export function isFlying() {
  return getState().phase === "ida";
}

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

function cloneText(source: HTMLElement, snap: TextSnapshot, role: string) {
  const { el, r } = cloneBox(source, role);
  // Offset of the text box inside the element, at scale 1.
  return { el, left: r.left, top: r.top, ox: snap.x - r.left, oy: snap.y - r.top, w: snap.width, h: snap.height };
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
  setState({ phase: "ida", arrival: "transicion", snapshot, savedSlug: snapshot.slug, t0, events: [] });
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

  const title = cloneText(els.title, snapshot.title, "titulo");
  const description = cloneText(els.description, snapshot.description, "descripcion");
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
  title: ReturnType<typeof cloneText>,
  description: ReturnType<typeof cloneText>,
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
  const ease = gsap.parseEase("power3.inOut");
  const flyText = (
    a: ReturnType<typeof cloneText>,
    targetName: "title" | "description",
    role: string,
    delay: number,
    mode: "fundido" | "scramble"
  ) => {
    const target = getTarget(targetName)?.firstElementChild as HTMLElement | null;
    if (!target) return;
    const tb = textBox(target);
    const { el: bEl, r: bR } = cloneBox(target, role);
    bEl.style.opacity = "0";
    container?.appendChild(bEl);
    const b = { el: bEl, ox: tb.x - bR.left, oy: tb.y - bR.top, w: tb.width, h: tb.height };
    const from = { x: a.left + a.ox, y: a.top + a.oy, w: a.w, h: a.h };
    const finalA = a.el.textContent ?? "";
    const finalB = bEl.textContent ?? "";
    const nA = [...finalA].length;
    const nB = [...finalB].length;
    const cacheA = { tick: -1, out: [] as string[] };
    const cacheB = { tick: -1, out: [] as string[] };
    const place = (
      c: { el: HTMLElement; ox: number; oy: number; w: number; h: number },
      X: number,
      Y: number,
      W: number,
      H: number,
      stretch: boolean
    ) => {
      const sy = H / c.h;
      const sx = stretch ? W / c.w : sy;
      c.el.style.transform = `translate(${X - sx * c.ox}px, ${Y - sy * c.oy}px) scale(${sx}, ${sy})`;
    };
    const ta = { el: a.el, ox: a.ox, oy: a.oy, w: a.w, h: a.h };
    const q = { p: 0 };
    const startedAt = { ms: 0 };
    me.tweens.push(
      gsap.to(q, {
        p: 1,
        duration: Math.max(0.3, duration - delay),
        delay,
        ease: "none",
        onStart: () => {
          startedAt.ms = performance.now();
        },
        onUpdate: () => {
          const p = q.p;
          const u = ease(p);
          const X = from.x + (tb.x - from.x) * u;
          const Y = from.y + (tb.y - from.y) * u;
          const W = from.w + (tb.width - from.w) * u;
          const H = from.h + (tb.height - from.h) * u;
          if (mode === "fundido") {
            const f = smooth(p, TITLE_FADE[0], TITLE_FADE[1]);
            place(ta, X, Y, W, H, true);
            place(b, X, Y, W, H, true);
            a.el.style.opacity = String(1 - f);
            b.el.style.opacity = String(f);
            return;
          }
          const tick = Math.floor((performance.now() - startedAt.ms) / SCRAMBLE_TICK_MS);
          if (p < SCRAMBLE_SWAP) {
            place(ta, X, Y, W, H, false);
            // Letters go random left to right, so none is left final at the swap.
            const randomUpTo = Math.ceil(nA * smooth(p, SCRAMBLE_START, SCRAMBLE_SWAP - 0.05));
            const s = scrambled(finalA, 0, cacheA, tick);
            a.el.textContent = [...finalA].map((c, i) => (i < randomUpTo ? [...s][i] : c)).join("");
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
  };
  flyText(title, "title", "titulo", 0, "fundido");
  flyText(description, "description", "descripcion", DESCRIPTION_DELAY_S, "scramble");

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

export function isFlying() {
  return getState().phase === "ida";
}

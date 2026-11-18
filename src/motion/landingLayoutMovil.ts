// Spec 021: the landing's mobile composition. Applied by CSS (globals.css,
// `.landing-photo` under `movil:` / `movil-h:`) from per-photo custom
// properties that LandingComposition writes inline next to the desktop
// position, so the server HTML already carries it and nothing jumps on
// hydration. Outside those media queries none of this has any effect.
//
// Composition rules (Javi's canvas, docs/referencias/movil/Landing-A-scroll
// and Landing-horizontal; spec 021, answer 3): one pass of the 15 photos in
// data order (the counter's order), 40-65 % of the width in portrait, about
// five per screen, overlapping, never off the sides; photo 15 is the lowest,
// so the panel trigger (its centre crossing the viewport centre) is the end.

import { MOVIL_H_QUERY, MOVIL_QUERY } from "@/lib/movil";

/** Portrait (phones and tablets): every value in vw, so a tablet is the same
 * composition scaled to its width (spec 021, answer 2). */
export type ColocacionVertical = { x: number; y: number; w: number };

/** Landscape phone: `x` is 0-100 across the free track between the 47 px
 * margins (0 = flush with the left margin, 100 = flush with the right one),
 * `y` in vh, `w` in px. The px width is what keeps every photo at 300 px tall
 * or less (CA5). */
export type ColocacionHorizontal = { x: number; y: number; w: number };

export type ColocacionMovil = {
  v: ColocacionVertical;
  h: ColocacionHorizontal;
  /** Parallax depth on mobile (spec 021 plan: 0.9-1.1x the scroll). */
  depth: number;
};

export const MARGEN_H_PX = 47;
/** Height of the number under each photo (`mt-2` + one 12 px line). */
const ETIQUETA_PX = 26;
const BARRA_PX = 78;
const BARRA_H_PX = 57;
const AIRE_PX = 24;
/** Less air in landscape: photo 15 (220 px) + its number + the bar have to
 * fit whole in a ~340 px tall viewport. */
const AIRE_H_PX = 10;

export const LANDING_LAYOUT_MOVIL: Record<string, ColocacionMovil> = {
  "san-miguel-street": { v: { x: 49, y: 4, w: 47 }, h: { x: 6, y: 8, w: 200 }, depth: 0.4 },
  "bougainvillea": { v: { x: 4, y: 34, w: 54 }, h: { x: 46, y: 2, w: 160 }, depth: 0.5 },
  "horses-dust": { v: { x: 26, y: 88, w: 64 }, h: { x: 92, y: 20, w: 210 }, depth: 0.3 },
  "cowboy-silhouette": { v: { x: 11, y: 150, w: 40 }, h: { x: 30, y: 62, w: 200 }, depth: 0.5 },
  "america-untitled-08": { v: { x: 55, y: 158, w: 41 }, h: { x: 76, y: 80, w: 210 }, depth: 0.35 },
  "san-blas-island": { v: { x: 30, y: 204, w: 52 }, h: { x: 2, y: 112, w: 200 }, depth: 0.45 },
  "basque-cliffs": { v: { x: 4, y: 252, w: 44 }, h: { x: 52, y: 128, w: 180 }, depth: 0.3 },
  "sea-through-trees": { v: { x: 54, y: 270, w: 42 }, h: { x: 98, y: 160, w: 160 }, depth: 0.5 },
  "waves-panorama": { v: { x: 8, y: 344, w: 64 }, h: { x: 8, y: 186, w: 300 }, depth: 0.4 },
  "biarritz-palace": { v: { x: 44, y: 372, w: 50 }, h: { x: 60, y: 224, w: 210 }, depth: 0.3 },
  "ny-skyline": { v: { x: 6, y: 404, w: 48 }, h: { x: 18, y: 250, w: 200 }, depth: 0.5 },
  "ny-library": { v: { x: 52, y: 440, w: 42 }, h: { x: 92, y: 268, w: 180 }, depth: 0.35 },
  "red-sun-boat": { v: { x: 10, y: 470, w: 40 }, h: { x: 44, y: 300, w: 170 }, depth: 0.45 },
  "cristo-silhouette": { v: { x: 46, y: 524, w: 44 }, h: { x: 4, y: 336, w: 180 }, depth: 0.3 },
  "eclipse-totality": { v: { x: 20, y: 596, w: 46 }, h: { x: 70, y: 362, w: 165 }, depth: 0.4 },
};

/** A photo with no mobile placement (a featured photo added later) goes
 * below the last one, centred, so it is never lost off-screen. */
export const COLOCACION_MOVIL_RESERVA: ColocacionMovil = {
  v: { x: 27, y: 680, w: 46 },
  h: { x: 50, y: 400, w: 180 },
  depth: 0,
};

/** The inline custom properties for one photo (read by globals.css). */
export function propiedadesMovil(c: ColocacionMovil): Record<string, string> {
  return {
    "--mx": String(c.v.x),
    "--my": String(c.v.y),
    "--mw": String(c.v.w),
    "--hx": String(c.h.x),
    "--hy": String(c.h.y),
    "--hw": String(c.h.w),
  };
}

/** `sizes` entries for the mobile composition, placed before the desktop
 * ones. Media conditions can't carry a comma list, so each orientation is its
 * own entry; landscape first, as in the CSS. Neither matches a fine pointer,
 * so on desktop the chosen candidate doesn't change. */
export function sizesMovil(c: ColocacionMovil): string {
  return `${MOVIL_H_QUERY} ${c.h.w}px, (pointer: coarse) and (orientation: portrait) and (max-width: 1024px) ${c.v.w}vw`;
}

type Medida = { ratio: number; c: ColocacionMovil };

/** Height of the scrolling container on mobile, one per orientation (CSS
 * `max()`): long enough that photo 15's centre reaches the viewport centre
 * (the panel trigger) AND that, at the end, it sits whole above the bar. */
export function altosMovil(medidas: Medida[]): { vertical: string; horizontal: string } {
  let ultV: Medida | null = null;
  let ultH: Medida | null = null;
  for (const m of medidas) {
    const cv = m.c.v.y + m.c.v.w / m.ratio / 2;
    if (!ultV || cv > ultV.c.v.y + ultV.c.v.w / ultV.ratio / 2) ultV = m;
    if (!ultH || m.c.h.y > ultH.c.h.y) ultH = m;
  }
  if (!ultV || !ultH) return { vertical: "100vh", horizontal: "100vh" };
  const hV = ultV.c.v.w / ultV.ratio; // vw
  const hH = ultH.c.h.w / ultH.ratio; // px
  const fmt = (n: number) => +n.toFixed(2);
  return {
    vertical: `max(${fmt(ultV.c.v.y + hV)}vw + ${ETIQUETA_PX + AIRE_PX + BARRA_PX}px, ${fmt(ultV.c.v.y + hV / 2)}vw + 50vh)`,
    horizontal: `max(${ultH.c.h.y}vh + ${fmt(hH + ETIQUETA_PX + AIRE_H_PX + BARRA_H_PX)}px, ${ultH.c.h.y}vh + ${fmt(hH / 2)}px + 50vh)`,
  };
}

export type ModoComposicion = "escritorio" | "vertical" | "horizontal";

/** Which composition the CSS is showing right now (live, not fixed at load:
 * the composition belongs to the media query; spec 021 plan). */
export function modoComposicion(): ModoComposicion {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "escritorio";
  if (window.matchMedia(MOVIL_H_QUERY).matches) return "horizontal";
  if (window.matchMedia(MOVIL_QUERY).matches) return "vertical";
  return "escritorio";
}

/** Rest geometry in px (document coordinates) of one photo in a mobile mode. */
export function geometriaMovilPx(
  c: ColocacionMovil,
  ratio: number,
  modo: "vertical" | "horizontal",
  vw: number,
  vh: number
): { x: number; y: number; ancho: number; alto: number } {
  if (modo === "vertical") {
    const ancho = (c.v.w / 100) * vw;
    return { x: (c.v.x / 100) * vw, y: (c.v.y / 100) * vw, ancho, alto: ancho / ratio };
  }
  const ancho = c.h.w;
  return {
    x: MARGEN_H_PX + (c.h.x / 100) * (vw - 2 * MARGEN_H_PX - ancho),
    y: (c.h.y / 100) * vh,
    ancho,
    alto: ancho / ratio,
  };
}

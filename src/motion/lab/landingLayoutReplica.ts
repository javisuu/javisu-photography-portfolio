// PLACEHOLDER — spike-owned copy of the landing's real composition data.
// Copied verbatim from src/motion/LandingComposition.tsx (not re-derived)
// so the tube spike can be judged against the actual grid density/scale
// instead of an invented 3-photo layout. The landing file itself is never
// imported from or modified — this is a deliberate duplicate, kept only
// for as long as this spike exists. If LANDING_LAYOUT changes on the
// landing, re-sync this copy by hand.

import type { Photo } from "@/data/photos";

export const PARALLAX_STRENGTH = 0.12;
export const SEQUENCE_HEIGHT_VH = 320;

export type Placement = {
  x: number; // left, % of viewport width
  y: number; // top, vh (within one SEQUENCE_HEIGHT_VH cycle)
  w: number; // width, vw
  depth: number;
};

export const LANDING_LAYOUT: Record<string, Placement> = {
  "horses-dust": { x: 6, y: 8, w: 28, depth: 0.5 },
  "bougainvillea": { x: 74, y: 14, w: 22, depth: 0.45 },
  "sea-through-trees": { x: 42, y: 74, w: 15, depth: 0 },
  "basque-cliffs": { x: 8, y: 52, w: 17, depth: 0.6 },
  "waves-panorama": { x: 66, y: 54, w: 31, depth: 0.35 },
  "ny-library": { x: 26, y: 96, w: 15, depth: 0 },
  "cristo-silhouette": { x: 78, y: 87, w: 16, depth: 0.55 },
  "red-sun-boat": { x: 6, y: 128, w: 22, depth: 0 },
  "cowboy-silhouette": { x: 68, y: 272, w: 22, depth: 0.4 },
  "san-blas-island": { x: 12, y: 176, w: 24, depth: 0 },
  "eclipse-totality": { x: 44, y: 168, w: 15, depth: 0 },
  "biarritz-palace": { x: 72, y: 184, w: 26, depth: 0.5 },
  "ny-skyline": { x: 4, y: 224, w: 30, depth: 0.6 },
  "san-miguel-street": { x: 70, y: 236, w: 16, depth: 0.4 },
};

export type LayoutItem = {
  photo: Photo;
  placement: Placement;
};

export function buildLayout(photos: Photo[]): LayoutItem[] {
  return photos.map((photo) => {
    const placement = (photo.id && LANDING_LAYOUT[photo.id]) || {
      x: 40,
      y: SEQUENCE_HEIGHT_VH - 40,
      w: 20,
      depth: 0.3,
    };
    return { photo, placement };
  });
}

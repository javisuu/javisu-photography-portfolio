// Spec 021: the mobile path in JS. The CSS variants `movil:` / `movil-h:`
// (src/app/globals.css) decide the mobile layout live; this decides the
// mobile BEHAVIOUR (no GLSurface, no Lenis, finite landing) once, at the first
// client read, and keeps it until reload (spec 021, Javi's answer 5), even if
// a tablet rotates out of the media query.
//
// These two strings must stay identical to the `@media` of `movil` and
// `movil-h` in globals.css; scripts/lib/navegacion.mjs reads them from this
// file and fails if globals.css doesn't contain them.

import { useSyncExternalStore } from "react";

export const MOVIL_QUERY =
  "(pointer: coarse) and (orientation: portrait) and (max-width: 1024px), (pointer: coarse) and (orientation: landscape) and (max-height: 500px)";
export const MOVIL_H_QUERY =
  "(pointer: coarse) and (orientation: landscape) and (max-height: 500px)";

let cache: boolean | undefined;

/** Whether the page loaded on the mobile path. Fixed after the first call. */
export function esMovilAlCargar(): boolean {
  if (cache === undefined) {
    cache =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(MOVIL_QUERY).matches;
  }
  return cache;
}

const sinSuscripcion = () => () => {};
const enServidor = () => null;

/**
 * `null` on the server and during hydration, then the value read at load.
 * Callers treat `null` as "not decided yet": render nothing path-specific.
 */
export function useEsMovil(): boolean | null {
  return useSyncExternalStore(sinSuscripcion, esMovilAlCargar, enServidor);
}

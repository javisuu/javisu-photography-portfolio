"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

type LenisOptions = ConstructorParameters<typeof Lenis>[0];

/**
 * Smooth-scrolls the real page while the calling component is mounted.
 * Returns a ref to the live instance (for e.g. subscribing to scroll).
 * `options` is only read on mount — pass a stable object.
 */
export function useLenis(options?: LenisOptions) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Lenis honors prefers-reduced-motion itself for smoothing
    // (respectReducedMotion defaults to true), but options like `infinite`
    // are a motion/behavior choice on our end, not smoothing — skip them
    // too when the user prefers reduced motion.
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const lenis = new Lenis({ autoRaf: true, ...(reducedMotion ? {} : options) });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return lenisRef;
}

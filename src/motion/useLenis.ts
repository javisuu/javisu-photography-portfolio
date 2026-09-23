"use client";

import { useEffect, useRef } from "react";
import Lenis from "lenis";

type LenisOptions = ConstructorParameters<typeof Lenis>[0];

/**
 * Smooth-scrolls the real page while the calling component is mounted
 * AND `active` is true. Returns a ref to the live instance (for e.g.
 * subscribing to scroll) — `lenisRef.current` is null whenever inactive.
 * `options` is only read the moment an instance is constructed — pass a
 * stable object.
 *
 * `active` exists for callers that don't unmount on their own "exit"
 * (the persistent landing, kept mounted-but-hidden across navigation so
 * its GL scene never has to rebuild — see LandingComposition). Lenis
 * itself can't just be paused there: its own `.stop()` keeps calling
 * `preventDefault()` on every wheel/touch event, which would freeze
 * scrolling entirely rather than release it back to native/another
 * page's own Lenis instance. So instead this actually constructs/
 * destroys the instance in step with `active`, same as the old
 * mount/unmount-only behavior just re-triggerable without a real
 * unmount.
 */
export function useLenis(options?: LenisOptions, active = true) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!active) return;
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
    // `options` deliberately excluded — see the JSDoc above, it's read
    // once per (re)construction, not meant to be reactive; including it
    // would reconstruct Lenis on every render for callers passing an
    // inline object literal (every existing caller does).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return lenisRef;
}

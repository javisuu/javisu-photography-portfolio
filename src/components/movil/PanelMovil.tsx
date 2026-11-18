"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { PANEL_ID, fijarPanel, panelAbierto, suscribirPanel } from "./panel";

// Spec 020: the full-screen mobile panel (design `docs/referencias/movil`,
// frame Nav-B, notes n_nb and n_h3). Opened from the landing by tapping
// SUQUIA (the trigger is a sibling of the blended <h1>, in
// LandingComposition); closed only by its Close button (answer 7) or a
// link. Mounted once in the root layout, like BarraMovil, and
// `display: none` outside the `movil:` variant.
//
// Motion: opacity only on the layer (240 ms in, 200 ms out) and opacity +
// translateY 12→0 on the links, 40 ms apart. Reduced motion: 200 ms fade
// both ways, links don't move (CA7).
//
// The landing under it must not scroll while it's open (CA5), without
// touching Lenis: Lenis ignores events that start inside a
// `data-lenis-prevent` node (node_modules/lenis/dist/lenis.mjs:609), and
// `touch-action: none` + `overscroll-behavior: contain` keep the browser's
// own touch panning from reaching the page. Nothing scrolls, so closing
// restores nothing and the landing is exactly where it was.



const ENLACES = [
  { href: "/about", texto: "About Me", color: "text-[#111111]" },
  { href: "/albums", texto: "Albums", color: "text-[#111111]" },
  { href: "/atlas", texto: "Atlas", color: "text-[#111111]" },
  { href: "/credits", texto: "Credits", color: "text-[#888888]" },
] as const;

export default function PanelMovil() {
  const abierto = useSyncExternalStore(suscribirPanel, panelAbierto, () => false);
  const primerEnlace = useRef<HTMLAnchorElement>(null);
  const capa = useRef<HTMLDivElement>(null);

  // Spec 021 (T3): with no Lenis on the mobile landing, a drag on the open
  // panel left Chromium's touch gesture open, and the next tap (on Close)
  // came out without a click (measured in emulation: pointerup and
  // touchend, no click; a second tap did close). Cancelling touchmove here
  // ends that gesture. Non-passive, so it can't be a JSX prop. The panel
  // never scrolls (touch-none), so nothing is lost.
  useEffect(() => {
    const el = capa.current;
    if (!el) return;
    const sinGesto = (e: TouchEvent) => e.preventDefault();
    el.addEventListener("touchmove", sinGesto, { passive: false });
    return () => el.removeEventListener("touchmove", sinGesto);
  }, []);

  // Focus moves into the panel on open and back to the trigger on close;
  // Escape closes it (a keyboard on a tablet).
  useEffect(() => {
    if (!abierto) return;
    primerEnlace.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto]);

  return (
    <div
      ref={capa}
      id={PANEL_ID}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      aria-hidden={!abierto}
      data-panel-movil={abierto ? "abierto" : "cerrado"}
      data-lenis-prevent=""
      className={[
        "hidden movil:block",
        "fixed inset-0 z-[60] touch-none overscroll-contain bg-[#FAFAFA] text-[#111111]",
        // `visibility` transitions discretely but stays visible for the
        // whole fade whenever one end is visible, so the close fade plays
        // out before the layer stops taking taps.
        "transition-[opacity,visibility] ease-out motion-reduce:duration-200",
        abierto ? "visible opacity-100 duration-[240ms]" : "invisible pointer-events-none opacity-0 duration-200",
      ].join(" ")}
    >
      <span className="absolute left-4 top-[62px] text-[22px] font-medium tracking-[0.14em] movil-h:left-[47px] movil-h:top-6">
        SUQUIA
      </span>

      <nav
        aria-label="Menu"
        className={[
          // Portrait: the four links end 30 px above the Close row, which
          // keeps their centres in the lower half down to the iPhone 13.
          "absolute inset-x-4 bottom-[108px] flex flex-col",
          // Phone landscape: four 64 px rows don't fit in 342 px; one row.
          "movil-h:inset-x-[47px] movil-h:bottom-[69px] movil-h:flex-row movil-h:gap-8",
        ].join(" ")}
      >
        {ENLACES.map(({ href, texto, color }, i) => (
          <Link
            key={href}
            ref={i === 0 ? primerEnlace : undefined}
            href={href}
            tabIndex={abierto ? undefined : -1}
            onClick={cerrar}
            data-panel-enlace=""
            className={[
              "flex h-16 items-center whitespace-nowrap text-[44px] font-medium leading-none",
              color,
              "transition-[opacity,translate] duration-[240ms] ease-out motion-reduce:translate-y-0 motion-reduce:transition-none",
              abierto ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            ].join(" ")}
            style={{ transitionDelay: abierto ? `${i * 40}ms` : "0ms" }}
          >
            {texto}
          </Link>
        ))}
      </nav>

      <div className="absolute inset-x-0 bottom-0 flex h-[78px] items-center justify-end px-[9px] pb-[34px] movil-h:h-[57px] movil-h:px-[39px] movil-h:pb-[21px]">
        <button
          type="button"
          onClick={cerrar}
          tabIndex={abierto ? undefined : -1}
          data-panel-cerrar=""
          className="flex min-h-[44px] items-center whitespace-nowrap px-[7px] text-[12px] uppercase tracking-[0.18em] text-[#111111] movil-h:px-2"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function cerrar() {
  fijarPanel(false);
  // Back to the trigger, so keyboard and screen-reader focus isn't lost.
  document.querySelector<HTMLElement>("[data-panel-disparador]")?.focus({ preventScroll: true });
}

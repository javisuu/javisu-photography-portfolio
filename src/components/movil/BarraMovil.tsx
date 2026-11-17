"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import BackToAlbums from "@/motion/albumTransition/BackToAlbums";
import { estadoAlbum, suscribirAlbum } from "./estadoAlbum";

// Spec 020: the mobile bottom bar (design `docs/referencias/movil`, frame
// Nav-A and note n_na; landscape, Landing-horizontal and note n_lh). It
// exists on desktop too, as `display: none`: everything visible hangs off
// the `movil:` variant (src/app/globals.css), so no desktop CSS changes.
//
// Mounted once from the root layout as a SIBLING of the landing — never an
// ancestor of its blended <h1> — and with no transform/opacity of its own.
// z-40: above the landing chrome (z-20/z-30), below the carousel→album
// transition layer (z-50), which covers everything during a flight.
//
// On /album/[slug], once the title block (`data-album-cabecera`) has
// scrolled out above the viewport, the bar becomes the album bar (frame
// Album-A, note n_at): `← ALBUMS` (the same BackToAlbums as the page's,
// so it returns through the transition) and prev/next + `NN / total`,
// which on mobile replace AlbumPhotoNav's right-edge control. Its state
// comes from AlbumPhotoNav through ./estadoAlbum.
//
// The EN · ES switch in the design waits for the language spec (spec 020,
// answer 1): not rendered at all.

const ENLACES = [
  { href: "/about", texto: "About me", activo: (p: string) => p === "/about" },
  { href: "/albums", texto: "Albums", activo: (p: string) => p === "/albums" || p.startsWith("/album/") },
  { href: "/atlas", texto: "Atlas", activo: (p: string) => p === "/atlas" },
] as const;

const ETIQUETA = "flex min-h-[44px] items-center whitespace-nowrap px-[7px] text-[12px] uppercase tracking-[0.18em] movil-h:px-2";

/** True once the album page's title block is entirely above the viewport. */
function useCabeceraPasada(pathname: string): boolean {
  const [pasada, setPasada] = useState(false);
  useEffect(() => {
    if (!pathname.startsWith("/album/")) return;
    let observer: IntersectionObserver | null = null;
    let raf = 0;
    // The page's tree can commit a frame after the pathname changes.
    const enganchar = (intentos: number) => {
      const cabecera = document.querySelector("[data-album-cabecera]");
      if (!cabecera) {
        if (intentos > 0) raf = requestAnimationFrame(() => enganchar(intentos - 1));
        return;
      }
      observer = new IntersectionObserver(([e]) => {
        setPasada(!e.isIntersecting && e.boundingClientRect.bottom <= 0);
      });
      observer.observe(cabecera);
    };
    enganchar(30);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      setPasada(false);
    };
  }, [pathname]);
  return pasada;
}

export default function BarraMovil() {
  const pathname = usePathname() ?? "/";
  const cabeceraPasada = useCabeceraPasada(pathname);
  const album = useSyncExternalStore(suscribirAlbum, estadoAlbum, () => null);
  const slug = pathname.startsWith("/album/") ? pathname.slice("/album/".length) : null;
  const modoAlbum = !!(slug && cabeceraPasada && album);

  return (
    <nav
      aria-label={modoAlbum ? "Album" : "Principal"}
      data-barra-movil=""
      data-barra-modo={modoAlbum ? "album" : "general"}
      className={[
        "hidden",
        // Portrait: 78 px = a 44 px row + 34 px for the home indicator.
        "movil:fixed movil:inset-x-0 movil:bottom-0 movil:z-40 movil:flex movil:h-[78px] movil:items-center movil:bg-[#FAFAFA] movil:pb-[34px] movil:pl-[9px]",
        modoAlbum ? "movil:justify-between movil:pr-1" : "movil:pr-[9px]",
        // Phone in landscape: 57 px = a 36 px row + 21 px of indicator, 47 px
        // safe margins (39 px padding + each link's 8 px).
        "movil-h:h-[57px] movil-h:px-[39px] movil-h:pb-[21px]",
      ].join(" ")}
    >
      {modoAlbum && album && slug ? (
        <>
          <BackToAlbums slug={slug} className={`${ETIQUETA} text-[#666666]`} />
          <div className="flex items-center text-[#666666]">
            <button
              type="button"
              aria-label="Previous photo"
              data-barra-anterior=""
              onClick={() => album.irA(album.actual - 1)}
              className="flex h-11 w-11 items-center justify-center"
            >
              <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
                <path d="M8 1 2 8l6 7" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
            <span data-barra-contador="" className="text-[14px] tabular-nums">
              {String(album.actual + 1).padStart(2, "0")} / {String(album.total).padStart(2, "0")}
            </span>
            <button
              type="button"
              aria-label="Next photo"
              data-barra-siguiente=""
              onClick={() => album.irA(album.actual + 1)}
              className="flex h-11 w-11 items-center justify-center"
            >
              <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden>
                <path d="m2 1 6 7-6 7" fill="none" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </>
      ) : (
        ENLACES.map(({ href, texto, activo }) => {
          const esActivo = activo(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={esActivo ? "page" : undefined}
              // The landscape row is 36 px tall, but the touch target stays
              // 44 px: `items-center` overflows it by 4 px each side, unseen.
              className={`${ETIQUETA} ${esActivo ? "text-[#111111]" : "text-[#666666]"}`}
            >
              {texto}
            </Link>
          );
        })
      )}
    </nav>
  );
}

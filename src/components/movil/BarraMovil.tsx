"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
// The EN · ES switch in the design waits for the language spec (spec 020,
// answer 1): not rendered at all.

const ENLACES = [
  { href: "/about", texto: "About me", activo: (p: string) => p === "/about" },
  { href: "/albums", texto: "Albums", activo: (p: string) => p === "/albums" || p.startsWith("/album/") },
  { href: "/atlas", texto: "Atlas", activo: (p: string) => p === "/atlas" },
] as const;

export default function BarraMovil() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      aria-label="Principal"
      data-barra-movil=""
      className={[
        "hidden",
        // Portrait: 78 px = a 44 px row + 34 px for the home indicator.
        "movil:fixed movil:inset-x-0 movil:bottom-0 movil:z-40 movil:flex movil:h-[78px] movil:items-center movil:bg-[#FAFAFA] movil:px-[9px] movil:pb-[34px]",
        // Phone in landscape: 57 px = a 36 px row + 21 px of indicator, 47 px
        // safe margins (39 px padding + each link's 8 px).
        "movil-h:h-[57px] movil-h:px-[39px] movil-h:pb-[21px]",
      ].join(" ")}
    >
      {ENLACES.map(({ href, texto, activo }) => {
        const esActivo = activo(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={esActivo ? "page" : undefined}
            className={[
              "flex min-h-[44px] items-center whitespace-nowrap px-[7px] text-[12px] uppercase tracking-[0.18em]",
              // The landscape row is 36 px tall, but the touch target stays
              // 44 px: `items-center` overflows it by 4 px each side, unseen.
              "movil-h:px-2",
              esActivo ? "text-[#111111]" : "text-[#666666]",
            ].join(" ")}
          >
            {texto}
          </Link>
        );
      })}
    </nav>
  );
}

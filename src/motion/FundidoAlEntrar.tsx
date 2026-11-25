"use client";

// Spec 023: NEXT ALBUM's cover on mobile fades in (opacity 0 → 1 over 300 ms)
// the first time it crosses into the top 80 % of the screen, and stays —
// reduced motion included (Javi's canvas, note n_af). Only on the mobile path
// (useEsMovil): on desktop, and before hydration settles, it renders the
// plain <Image> with no style at all, so nothing changes there. Opacity only,
// on the <img> itself — no wrapper, so the NEXT ALBUM row lays out exactly as
// before.

import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState } from "react";
import { useEsMovil } from "@/lib/movil";

export default function FundidoAlEntrar(props: ImageProps) {
  const esMovil = useEsMovil();
  const ref = useRef<HTMLImageElement>(null);
  const [dentro, setDentro] = useState(false);

  useEffect(() => {
    if (esMovil !== true || !ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setDentro(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -20% 0px" }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [esMovil]);

  const style = esMovil === true ? { opacity: dentro ? 1 : 0, transition: "opacity 300ms ease-out" } : undefined;
  // eslint-disable-next-line jsx-a11y/alt-text -- alt comes in through props
  return <Image ref={ref} {...props} style={{ ...props.style, ...style }} />;
}

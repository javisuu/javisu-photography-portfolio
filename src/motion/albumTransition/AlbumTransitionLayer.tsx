"use client";

// The carousel→album flight layer (spec 019). Mounted once, from the root
// layout, so it outlives the route change between /albums and
// /album/[slug]. At rest it's an empty fixed box that paints nothing and
// takes no pointer events; flight.ts fills and empties it imperatively.
//
// A plain <div>, never a <main> (the diagnostic's "un solo <main>
// visible"), and a sibling of the landing — never an ancestor of its
// blended <h1>.

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { abortFlight, setContainer } from "./flight";
import { getState } from "./store";

export default function AlbumTransitionLayer() {
  const pathname = usePathname();

  // Leaving for anywhere but the album being opened (e.g. the browser's
  // back button mid-flight) cancels the flight: nothing may keep flying
  // over a page it wasn't meant for.
  useEffect(() => {
    const { phase, snapshot } = getState();
    if (phase === "ida" && snapshot && pathname !== `/album/${snapshot.slug}` && pathname !== "/albums") {
      abortFlight("ruta");
    }
  }, [pathname]);

  return <div ref={setContainer} aria-hidden className="pointer-events-none fixed inset-0 z-50" data-transicion-capa="" />;
}

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
import { useEffect, useRef } from "react";
import { abortFlight, abortReturn, prepareReturn, setContainer } from "./flight";
import { getState } from "./store";

const ALBUM_PATH = /^\/album\/([^/]+)$/;

export default function AlbumTransitionLayer() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);

  // Leaving for anywhere but the album being opened cancels the outbound
  // flight, and leaving /albums cancels the way back: nothing may keep
  // flying over a page it wasn't meant for.
  useEffect(() => {
    pathRef.current = pathname;
    const { phase, snapshot } = getState();
    if (phase === "ida" && snapshot && pathname !== `/album/${snapshot.slug}` && pathname !== "/albums") {
      abortFlight("ruta");
    }
    if (phase === "vuelta" && pathname !== "/albums") abortReturn("ruta");
  }, [pathname]);

  // Browser back from an album to /albums (T7). Capture phase: at the
  // window, capture listeners run before Next's own popstate listener, so
  // the album page is still in the DOM here and can be frozen into the
  // layer before React swaps the route (popstate updates commit
  // synchronously).
  useEffect(() => {
    function onPopState() {
      const from = ALBUM_PATH.exec(pathRef.current ?? "");
      if (from && window.location.pathname === "/albums") prepareReturn(decodeURIComponent(from[1]));
    }
    window.addEventListener("popstate", onPopState, { capture: true });
    return () => window.removeEventListener("popstate", onPopState, { capture: true });
  }, []);

  return <div ref={setContainer} aria-hidden className="pointer-events-none fixed inset-0 z-50" data-transicion-capa="" />;
}

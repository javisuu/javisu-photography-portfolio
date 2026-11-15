"use client";

// A destination of the carousel→album flight (spec 019): registers its
// element with the transition store so AlbumTransitionLayer can measure it
// and hand over to it, and starts hidden when the page is arriving by
// transition — from its very first render, so it never flashes before the
// clone that flies to it.
//
// A plain block wrapper: the album page's title block is a stack of blocks,
// and a wrapper with no padding or border lets their margins collapse
// through it exactly as before. The opacity sits here, not on the child,
// because the child may be a component (AlbumPhotoNav) with no ref; once
// shown, the layer clears it (`opacity: ""`), so no stacking context is
// left behind at rest.

import { useCallback, useState, type ReactNode } from "react";
import { getState, registerTarget, type TargetName } from "./store";

export default function TransitionTarget({ name, children }: { name: TargetName; children: ReactNode }) {
  // Fixed at mount: the arrival mode only means anything for the page that
  // mounts right after a click in the carousel.
  const [arriving] = useState(() => getState().arrival === "transicion");
  const ref = useCallback((el: HTMLDivElement | null) => registerTarget(name, el), [name]);

  return (
    <div ref={ref} data-transicion-destino={name} style={arriving ? { opacity: 0 } : undefined}>
      {children}
    </div>
  );
}

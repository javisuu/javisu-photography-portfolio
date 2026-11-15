"use client";

// "← ALBUMS" on the album page (Javi, 2026-11-15: it replaces "← SUQUIA").
// Same way back as the browser's back button (T7):
// - Album opened from the carousel: history.back(). The entry behind is
//   /albums, so the history stays as if the album had never been pushed,
//   and the layer's popstate listener runs the return choreography.
// - Any other arrival (direct load, NEXT ALBUM, the atlas): the album is
//   frozen into the layer here and /albums is pushed.
// A plain <a href="/albums"> underneath, so it works without JS and a
// modified click (new tab, etc.) behaves as a link.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { prepareReturn } from "./flight";
import { getState } from "./store";

export default function BackToAlbums({ slug, className }: { slug: string; className?: string }) {
  const router = useRouter();

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (getState().fromCarousel === slug) {
      router.back();
      return;
    }
    prepareReturn(slug);
    router.push("/albums");
  }

  return (
    <Link href="/albums" onClick={onClick} className={className}>
      ← Albums
    </Link>
  );
}

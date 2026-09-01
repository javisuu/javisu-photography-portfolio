import Link from "next/link";
import { getOrderedAlbums, photos } from "@/data/photos";
import AlbumsCarousel from "@/motion/AlbumsCarousel";

// Carousel opened only via the "Albums" nav link — not reached by scrolling
// the landing (see docs/design-spec-v2.md). The page must have zero native
// scroll on BOTH axes (scrollHeight===clientHeight, scrollWidth===
// clientWidth) — that's what makes the carousel read as infinite rather
// than a strip with a measurable end. h-screen + overflow-hidden covers
// the vertical axis; the header sits as an absolute overlay, not in flow,
// so it can never push the carousel down. w-full (not w-screen) avoids
// the classic 100vw-includes-scrollbar-gutter mismatch that would
// otherwise leave a few px of horizontal overflow.
export default function AlbumsPage() {
  const albums = getOrderedAlbums().map((album) => ({
    ...album,
    cover: photos.find((p) => p.src === album.cover)!,
  }));

  return (
    <div className="relative h-screen w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-6 md:p-10">
        <Link
          href="/"
          className="pointer-events-auto text-[13px] uppercase tracking-[0.18em] text-[#666] hover:text-[#111]"
        >
          ← Suquia
        </Link>
      </div>

      <AlbumsCarousel albums={albums} />
    </div>
  );
}

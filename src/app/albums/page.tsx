import Image from "next/image";
import Link from "next/link";
import {
  getCarouselNeighbors,
  getOrderedAlbums,
  photos,
  type Album,
} from "@/data/photos";

// Carousel opened only via the "Albums" nav link — not reached by scrolling
// the landing (see docs/design-spec-v2.md).
export default function AlbumsPage() {
  const albums = getOrderedAlbums();
  const centerAlbum = albums[0];
  const centerCover = photos.find((p) => p.src === centerAlbum.cover)!;
  const { left, right } = getCarouselNeighbors(centerAlbum.slug, 3);
  const centerHeight = 500;
  const centerWidth = Math.round(
    centerHeight * (centerCover.width / centerCover.height)
  );

  return (
    <main>
      <div className="p-6 md:p-10">
        <Link
          href="/"
          className="text-[13px] uppercase tracking-[0.18em] text-[#666] hover:text-[#111]"
        >
          ← Suquia
        </Link>
      </div>

      <section className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-4 py-20">
        <div className="flex items-center justify-center gap-8">
          {left.map((album) => (
            <CarouselSliver key={`l-${album.slug}`} album={album} />
          ))}

          <Link
            href={`/album/${centerAlbum.slug}`}
            className="relative block shrink-0 overflow-hidden"
            style={{ width: centerWidth, height: centerHeight }}
          >
            <Image
              src={centerCover.src}
              alt={centerAlbum.title}
              width={centerCover.width}
              height={centerCover.height}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              sizes="(max-width: 768px) 80vw, 900px"
            />
          </Link>

          {right.map((album) => (
            <CarouselSliver key={`r-${album.slug}`} album={album} />
          ))}
        </div>

        <div className="flex w-full max-w-4xl items-end justify-between text-[#666]">
          <div>
            <p className="font-serif text-[30px] text-[#111]">{centerAlbum.title}</p>
            <p className="text-[13px] uppercase tracking-[0.16em]">
              {centerAlbum.location} — {centerAlbum.year}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[14px] tabular-nums">
            <span>{String(1).padStart(2, "0")}</span>
            <span className="h-px w-16 bg-[#CCC]" />
            <span>{String(albums.length).padStart(2, "0")}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function CarouselSliver({ album }: { album: Album }) {
  const cover = photos.find((p) => p.src === album.cover)!;
  return (
    <Link
      href={`/album/${album.slug}`}
      className="relative block shrink-0 overflow-hidden"
      style={{ width: 132, height: 500 }}
    >
      <Image
        src={cover.src}
        alt={album.title}
        width={cover.width}
        height={cover.height}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
        sizes="132px"
      />
    </Link>
  );
}

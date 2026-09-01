import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Footer from "@/components/Footer";
import {
  albums,
  getAlbumBySlug,
  getNextAlbum,
  getPhotosByAlbum,
  photos,
  type Photo,
} from "@/data/photos";

export function generateStaticParams() {
  return albums.map((album) => ({ slug: album.slug }));
}

// Alternating placement per the design spec's vertical top-down flow.
function placementClass(index: number) {
  switch (index % 3) {
    case 1:
      return "items-start";
    case 2:
      return "items-end";
    default:
      return "items-center";
  }
}

function PhotoRow({ photo, index }: { photo: Photo; index: number }) {
  return (
    <div className={`flex flex-col gap-4 px-6 py-16 md:px-16 ${placementClass(index)}`}>
      <Image
        src={photo.src}
        alt={photo.title}
        width={photo.width}
        height={photo.height}
        className="h-auto w-auto max-h-[85vh] max-w-full"
        sizes="(max-width: 768px) 90vw, 70vw"
      />
      <div className="flex flex-wrap items-baseline gap-4 text-[#666]">
        <span className="text-[14px] tabular-nums">
          {String(photo.order).padStart(2, "0")}
        </span>
        <span className="font-serif text-[20px] italic text-[#111]">
          {photo.title}
        </span>
        <span className="text-[13px] uppercase tracking-[0.14em]">
          {photo.capture.focalLength} — {photo.capture.aperture} — {photo.capture.iso}
        </span>
      </div>
    </div>
  );
}

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const album = getAlbumBySlug(slug);
  if (!album) notFound();

  const albumPhotos = getPhotosByAlbum(slug);
  const nextAlbum = getNextAlbum(slug);
  const nextCover = photos.find((p) => p.src === nextAlbum.cover)!;

  return (
    <main className="relative">
      {/* PLACEHOLDER — prev/next photo control is static for now; scroll
          tracking + arrow navigation lands in Phase 3 (see CLAUDE.md). */}
      <div className="fixed right-4 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-center gap-4 text-[#666] md:right-8 md:flex">
        <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden>
          <path d="M1 8L7 1L13 8" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="text-[14px] tabular-nums">
          01 / {String(albumPhotos.length).padStart(2, "0")}
        </span>
        <svg width="14" height="9" viewBox="0 0 14 9" fill="none" aria-hidden>
          <path d="M1 1L7 8L13 1" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>

      {/* Title block — the carousel's jump-into transition IS the entrance in Phase 3 */}
      <div className="px-6 pb-16 pt-28 md:px-16 md:pt-40">
        <p className="text-[13px] uppercase tracking-[0.18em] text-[#666]">
          Album {String(album.order).padStart(2, "0")} — {albumPhotos.length} Photos
        </p>
        <h1
          className="mt-4 font-medium leading-none text-[#111]"
          style={{ fontSize: "clamp(48px, 10vw, 110px)" }}
        >
          {album.title}
        </h1>
        <p className="mt-4 text-[14px] text-[#666]">
          {album.location} — {album.year}
        </p>
      </div>

      {albumPhotos.map((photo, i) => (
        <PhotoRow key={photo.src} photo={photo} index={i} />
      ))}

      <Link
        href={`/album/${nextAlbum.slug}`}
        className="flex items-center gap-6 border-t border-[#eee] px-6 py-16 md:px-16"
      >
        <div className="relative h-24 w-32 shrink-0 overflow-hidden">
          <Image
            src={nextCover.src}
            alt={nextAlbum.title}
            width={nextCover.width}
            height={nextCover.height}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            sizes="128px"
          />
        </div>
        <div>
          <p className="text-[12px] uppercase tracking-[0.18em] text-[#888]">
            Next Album
          </p>
          <p className="font-serif text-[24px] text-[#111]">{nextAlbum.title}</p>
        </div>
      </Link>

      <Footer />
    </main>
  );
}

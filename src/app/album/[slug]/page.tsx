import Link from "next/link";
import { notFound } from "next/navigation";
import AlbumPhotoNav from "@/components/AlbumPhotoNav";
import Footer from "@/components/Footer";
import AlbumPhotos from "@/motion/AlbumPhotos";
import BackToAlbums from "@/motion/albumTransition/BackToAlbums";
import FundidoAlEntrar from "@/motion/FundidoAlEntrar";
import TransitionTarget from "@/motion/albumTransition/TransitionTarget";
import {
  albums,
  getAlbumBySlug,
  getNextAlbum,
  getPhotosByAlbum,
  photos,
} from "@/data/photos";

export function generateStaticParams() {
  return albums.map((album) => ({ slug: album.slug }));
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
    <main className="relative movil:pb-[78px] movil-h:pb-[57px]">
      <div className="absolute inset-x-0 top-0 z-20 p-6 md:p-10">
        <BackToAlbums
          slug={album.slug}
          className="text-[13px] uppercase tracking-[0.18em] text-[#666] hover:text-[#111]"
        />
      </div>

      <TransitionTarget name="nav">
        <AlbumPhotoNav total={albumPhotos.length} />
      </TransitionTarget>

      {/* No hero — the carousel→album transition (spec 019) is the
          entrance: the title and the location line fly in from the
          carousel, the label fades in. The page opens directly on this
          typographic title block. */}
      {/* data-album-cabecera: once this block has scrolled out above the
          viewport, the mobile bar turns into the album bar (spec 020). */}
      <div data-album-cabecera="" className="album-cabecera px-6 pb-16 pt-28 md:px-16 md:pt-40">
        <TransitionTarget name="label">
          <p className="album-etiqueta text-[13px] uppercase tracking-[0.18em] text-[#666]">
            Album {String(album.order).padStart(2, "0")} — {albumPhotos.length} Photos
          </p>
        </TransitionTarget>
        <TransitionTarget name="title">
          <h1
            className="album-titulo mt-4 font-medium leading-none text-[#111]"
            style={{ fontSize: "clamp(48px, 10vw, 110px)" }}
          >
            {album.title}
          </h1>
        </TransitionTarget>
        <TransitionTarget name="description">
          <p className="album-lugar mt-4 text-[14px] text-[#666]">
            {album.location} — {album.year}
          </p>
        </TransitionTarget>
      </div>

      <AlbumPhotos photos={albumPhotos} albumText={album.text} />

      <Link
        href={`/album/${nextAlbum.slug}`}
        data-album-siguiente=""
        className="album-siguiente flex items-center gap-6 border-t border-[#eee] px-6 py-16 md:px-16"
      >
        {/* Natural aspect ratio, fixed height only — no object-fit crop.
            The hard rule ("no cropping, carousel slivers excepted")
            applies here too; only the carousel gets to cheat this. */}
        {/* Mobile (spec 023, globals.css `.album-siguiente*`): one column —
            label, cover at 200u, title at 40/44, place and year — the inner
            div turned `contents` and the order set in CSS. The place line
            only exists on mobile. */}
        <FundidoAlEntrar
          src={nextCover.src}
          alt={nextAlbum.title}
          width={nextCover.width}
          height={nextCover.height}
          className="album-siguiente-portada h-24 w-auto shrink-0"
          data-album-portada=""
          // Pixels, not vw: with a vw entry Next drops the small widths
          // from the srcset and desktop would fetch a different file. On
          // mobile the cover is 200u: 200 px on a phone, up to ~525 on a
          // tablet in portrait.
          sizes="(pointer: coarse) and (orientation: portrait) and (max-width: 500px) 200px, (pointer: coarse) and (orientation: portrait) and (max-width: 1024px) 540px, 200px"
        />
        <div className="album-siguiente-textos">
          <p className="album-siguiente-etiqueta text-[12px] uppercase tracking-[0.18em] text-[#888]">
            Next Album
          </p>
          <p className="album-siguiente-titulo font-serif text-[24px] text-[#111]">{nextAlbum.title}</p>
          <p className="album-siguiente-lugar hidden">
            {nextAlbum.location} — {nextAlbum.year}
          </p>
        </div>
      </Link>

      <Footer />
    </main>
  );
}

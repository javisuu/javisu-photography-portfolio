import type { Metadata } from "next";
import Link from "next/link";
import { getPhotosByAlbum, photos } from "@/data/photos";
import Atlas, { type AtlasMark } from "@/motion/Atlas";

export const metadata: Metadata = {
  title: "Atlas — SUQUIA",
  description: "A map of every place these photographs were taken.",
  openGraph: {
    title: "Atlas — SUQUIA",
    description: "A map of every place these photographs were taken.",
    type: "website",
  },
};

export default function AtlasPage() {
  // Only photos with coordinates are plottable — everything else is
  // simply omitted, no placeholder marks (per the atlas spec).
  const marks: AtlasMark[] = photos
    .filter((p) => p.place.lat !== null && p.place.lng !== null)
    .map((p) => {
      const albumPhotos = getPhotosByAlbum(p.album);
      const albumPhotoIndex = albumPhotos.findIndex((ap) => ap.src === p.src);
      return {
        src: p.src,
        width: p.width,
        height: p.height,
        title: p.title,
        album: p.album,
        albumPhotoIndex,
        city: p.place.city,
        country: p.place.country,
        lat: p.place.lat as number,
        lng: p.place.lng as number,
        precision: p.place.precision,
      };
    });

  // Counts computed from the data, never hardcoded.
  const countryCount = new Set(marks.map((m) => m.country)).size;
  const cityCount = new Set(marks.map((m) => m.city)).size;
  const plural = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <div className="absolute inset-x-0 top-0 z-20 p-6 md:p-10">
        <Link
          href="/"
          className="text-[13px] uppercase tracking-[0.18em] text-[#666] hover:text-[#111]"
        >
          ← Suquia
        </Link>
      </div>

      <div className="shrink-0 px-6 pb-6 pt-28 md:px-16 md:pt-40">
        <h1
          className="font-medium leading-none text-[#111]"
          style={{ fontSize: "clamp(40px, 8vw, 72px)" }}
        >
          Atlas
        </h1>
        <p className="mt-4 text-[13px] uppercase tracking-[0.18em] text-[#666]">
          {marks.length} {plural(marks.length, "Photograph", "Photographs")} —{" "}
          {cityCount} {plural(cityCount, "City", "Cities")} — {countryCount}{" "}
          {plural(countryCount, "Country", "Countries")}
        </p>
      </div>

      <div className="min-h-0 flex-1">
        <Atlas marks={marks} />
      </div>
    </main>
  );
}

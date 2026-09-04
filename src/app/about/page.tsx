import type { Metadata } from "next";
import Link from "next/link";
// import Image from "next/image"; // for the optional portrait slot below

export const metadata: Metadata = {
  title: "About — SUQUIA",
  description: "About Javier Suquia, photographer.",
  openGraph: {
    title: "About — SUQUIA",
    description: "About Javier Suquia, photographer.",
    type: "website",
  },
};

// PLACEHOLDER — bio copy needs to come from Javi. Do not invent one.
const BIO_PLACEHOLDER = "[PLACEHOLDER BIO]";

// PLACEHOLDER — real email pending.
const EMAIL = "hello@example.com";

// PLACEHOLDER — Instagram handle pending.
const INSTAGRAM_HANDLE = "[PLACEHOLDER]";
const INSTAGRAM_HREF = "#";

export default function AboutPage() {
  return (
    <main className="relative min-h-screen">
      <div className="absolute inset-x-0 top-0 z-20 p-6 md:p-10">
        <Link
          href="/"
          className="text-[13px] uppercase tracking-[0.18em] text-[#666] hover:text-[#111]"
        >
          ← Suquia
        </Link>
      </div>

      <div className="mx-auto flex max-w-xl flex-col gap-12 px-6 pb-24 pt-28 md:px-0 md:pt-40">
        <h1
          className="font-medium leading-none text-[#111]"
          style={{ fontSize: "clamp(40px, 8vw, 72px)" }}
        >
          About
        </h1>

        {/* Optional portrait slot — uncomment and point at a real photo
            when one is ready. Explicit width/height, matching the rest of
            the site's no-layout-shift convention.
        <Image
          src="/photos/about/portrait.avif"
          alt="Javier Suquia"
          width={480}
          height={600}
          className="h-auto w-full max-w-xs"
        />
        */}

        <p className="font-serif text-[18px] italic leading-relaxed text-[#666]">
          {BIO_PLACEHOLDER}
        </p>

        {/* Each contact method is its own self-contained block (label +
            value) so the email link below can be swapped for a form later
            without touching this section's surroundings or the Instagram
            block next to it. */}
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <p className="text-[13px] uppercase tracking-[0.18em] text-[#888]">
              Contact
            </p>
            <a
              href={`mailto:${EMAIL}`}
              className="font-serif text-[18px] text-[#111] hover:text-[#666]"
            >
              {EMAIL}
            </a>
          </section>

          <section className="flex flex-col gap-3">
            <p className="text-[13px] uppercase tracking-[0.18em] text-[#888]">
              Instagram
            </p>
            <a
              href={INSTAGRAM_HREF}
              className="font-serif text-[18px] text-[#111] hover:text-[#666]"
            >
              {INSTAGRAM_HANDLE}
            </a>
          </section>
        </div>
      </div>
    </main>
  );
}

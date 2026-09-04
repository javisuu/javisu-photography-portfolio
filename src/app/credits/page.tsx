import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Credits — SUQUIA",
  description: "Colophon for the SUQUIA photography portfolio.",
  openGraph: {
    title: "Credits — SUQUIA",
    description: "Colophon for the SUQUIA photography portfolio.",
    type: "website",
  },
};

const YEAR = new Date().getFullYear();
const GITHUB_URL = "https://github.com/javisuu/javisu-photography-portfolio";

// A footnote, not a page — five lines, no heading shouting "Credits".
export default function CreditsPage() {
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

      <div className="mx-auto flex max-w-md flex-col gap-6 px-6 pb-24 pt-28 text-[14px] text-[#666] md:px-0 md:pt-40">
        <p>Photography, design and development — Javier Suquia</p>
        <p>Typeface: EB Garamond</p>
        <p>Built with Next.js, WebGL (OGL), GSAP, Lenis</p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[#111]"
        >
          GitHub repository
        </a>
        <p className="text-[#888]">
          All photographs © Javier Suquia, {YEAR}. Not to be reproduced without
          permission.
        </p>
      </div>
    </main>
  );
}

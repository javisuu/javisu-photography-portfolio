import Link from "next/link";
import Footer from "@/components/Footer";

// PLACEHOLDER — bio copy needs to come from Javi.
export default function AboutPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <div className="p-6 md:p-10">
        <Link
          href="/"
          className="text-[13px] uppercase tracking-[0.18em] text-[#666] hover:text-[#111]"
        >
          ← Suquia
        </Link>
      </div>

      <div className="mx-auto flex max-w-xl flex-1 flex-col justify-center gap-8 px-6 py-16 md:px-0">
        <h1
          className="font-medium leading-none text-[#111]"
          style={{ fontSize: "clamp(40px, 8vw, 72px)" }}
        >
          About
        </h1>
        <p className="font-serif text-[18px] leading-relaxed text-[#333]">
          Placeholder bio — a few sentences about Javier Suquia, his approach
          to photography, and what draws him to a scene. Replace this with
          real copy whenever it&apos;s ready.
        </p>
        <div className="flex gap-4 text-[13px] uppercase tracking-[0.18em] text-[#666]">
          <a href="#" className="hover:text-[#111]">
            Instagram
          </a>
          <span aria-hidden>—</span>
          <a href="mailto:hello@example.com" className="hover:text-[#111]">
            Email
          </a>
        </div>
      </div>

      <Footer />
    </main>
  );
}

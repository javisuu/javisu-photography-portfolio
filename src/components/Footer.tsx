// PLACEHOLDER — Instagram and email links point nowhere real yet.
export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="flex flex-wrap items-center justify-center gap-3 py-10 text-[13px] uppercase tracking-[0.18em] text-[#666]">
      <span className="text-[#111]">Suquia</span>
      <span aria-hidden>—</span>
      <a href="#" className="hover:text-[#111]">
        Instagram
      </a>
      <span aria-hidden>—</span>
      <a href="mailto:hello@example.com" className="hover:text-[#111]">
        Email
      </a>
      <span aria-hidden>—</span>
      <span>{year}</span>
    </footer>
  );
}

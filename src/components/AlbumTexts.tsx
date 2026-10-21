// Javi's own words alongside an album's photos (spec 010): a long text
// either beside a photo or between two, and short quotes beside a photo.
// Static text, grayscale only — no motion, so nothing to gate on
// prefers-reduced-motion. data-* attributes are what the diagnostic's
// `textos del album` section measures.

const SIGNATURE = "Javier Suárez Suquía";

function Signature() {
  return (
    <p className="mt-6 flex items-center gap-3 text-[12px] uppercase tracking-[0.18em] text-[#A8A8A8]">
      <span aria-hidden className="block h-px w-8 bg-[#BBBBBB]" />
      {SIGNATURE}
    </p>
  );
}

/** Long text in the free side of a photo's row, top-aligned with the photo. */
export function SideNote({ body, lang }: { body: string; lang?: string }) {
  return (
    <div data-album-text data-text-kind="beside" lang={lang} className="max-w-[440px] md:mt-20">
      <p className="font-serif text-[18px] leading-[1.65] text-[#666666]">{body}</p>
      <Signature />
    </div>
  );
}

/** Short line beside a photo, vertically centred on it, unsigned. */
export function Quote({ text, lang }: { text: string; lang?: string }) {
  return (
    <div data-photo-quote lang={lang} className="max-w-[280px]">
      <span aria-hidden className="mb-4 block h-px w-6 bg-[#BBBBBB]" />
      <p className="font-serif text-[16px] italic leading-[1.5] text-[#888888]">{text}</p>
    </div>
  );
}

/** Long text in its own row between two photos, large serif. Sizes follow
 *  the reference (rluijten.photography, `.heading.is-small`): 2.778vw type,
 *  ~10/12 of the width, 8.333vw above and below. */
export function Interlude({ body, lang }: { body: string; lang?: string }) {
  return (
    <div className="px-6 py-[8.333vw] md:px-16">
      <div data-album-text data-text-kind="between" lang={lang} className="mx-auto max-w-[83.333vw]">
        <p
          className="font-serif leading-[1.075] text-[#666666]"
          style={{ fontSize: "clamp(28px, 2.778vw, 48px)" }}
        >
          {body}
        </p>
        <Signature />
      </div>
    </div>
  );
}

# SUQUIA

Source code of the photography portfolio of Javier Suárez Suquía: white, editorial, serif, with the photographs as the only colour on the page.

**Stack:** Next.js (App Router), Tailwind CSS, GSAP, Lenis, WebGL2 via `ogl` (a tube/roll scroll effect that mirrors normal `<img>` elements onto one canvas) and a hand-rolled orthographic globe for the atlas. Fonts by EB Garamond.

## The photographs are not here

This repository is a public mirror of the code. **The photographs are not included**, and they have been removed from its entire history. They are the author's work and are not licensed for reuse: see [`LICENSE`](LICENSE). Code is MIT; photographs are all rights reserved.

That means a fresh clone builds and runs, but every photo will show as a broken image. To try it with your own pictures, put AVIF files at the paths listed in `src/data/photos.ts` (for example `public/photos/sol/01.avif`), or point those entries at any images you own.

## Running it

```
npm install
npm run dev
```

Open `http://localhost:3000`. Use `localhost`, not `127.0.0.1`: in development Next.js only serves its own scripts to the origins it allows.

## Where things are

- `src/data/photos.ts`: every album and photo. Pages render from this file alone.
- `src/motion/`: all animation (landing composition, the GL renderer, the carousel, the atlas).
- `scripts/prepare-images.mjs`: turns originals into the web AVIFs, writing authorship into each file's EXIF and XMP.
- `scripts/diagnostico.mjs`: the measurement harness (types, lint, build, console errors and layout invariants via Playwright).
- `docs/` and `specs/`: design system, current state and the spec-driven change log (mostly in Spanish).

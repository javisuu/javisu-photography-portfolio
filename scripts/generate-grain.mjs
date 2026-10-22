// Regenerates public/textures/grano.png — the film-grain tile that covers a
// folded carousel slide (spec 011, decision 3): near-black with fine light
// grain, 256x256, greyscale, tiled with background-repeat. Seeded, so every
// run writes the same pixels; change SEED (or MEAN/SPREAD) to get a
// different grain.
//
// To re-run: node scripts/generate-grain.mjs
import { mkdirSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SIZE = 256;
const SEED = 11;
const MEAN = 16; // base grey level: near-black
const SPREAD = 13; // standard deviation of the grain, in grey levels

// mulberry32: small, fast, seedable.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller: a normal distribution reads as grain; uniform noise reads as
// static.
const random = rng(SEED);
function gaussian() {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const pixels = Buffer.alloc(SIZE * SIZE);
for (let i = 0; i < pixels.length; i++) {
  pixels[i] = Math.max(0, Math.min(255, Math.round(MEAN + SPREAD * gaussian())));
}

const outDir = path.join(ROOT, "public", "textures");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "grano.png");
await sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 1 } })
  .png({ compressionLevel: 9 })
  .toFile(out);
console.log(`escrito ${path.relative(ROOT, out)}`);

// Regenerates public/atlas/land-mask.png — a monochrome equirectangular
// raster (land = white, ocean = black) sampled from the same Natural
// Earth source the old fixed dot-grid used (see docs/atlas-data-sources.md).
// The atlas page's dot lattice is built AT RUNTIME, resampled to
// whatever angular step the current globe radius needs (see
// src/motion/Atlas.tsx) — this mask is what a land/ocean test samples
// against, replacing the old fixed-density src/data/atlas-land-dots.json.
// Beyond what this mask can resolve, the zones that need it read the
// local masks of scripts/generate-atlas-local-masks.mjs (spec 016).
//
// To re-run:
//   1. curl -o scripts/ne_110m_land.geojson \
//        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
//   2. node scripts/generate-atlas-land-mask.mjs
//   3. rm scripts/ne_110m_land.geojson (not checked in — a build input,
//      same convention as the gitignored photos-master/)
import { readFileSync, mkdirSync } from "fs";
import path from "node:path";
import sharp from "sharp";
import { rasterizePolygons } from "./lib/land-raster.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const geojson = JSON.parse(readFileSync(path.join(ROOT, "scripts", "ne_110m_land.geojson")));

// One entry per polygon (exterior + holes); the rasterizer's parity is
// per polygon (see scripts/lib/land-raster.mjs).
const polygons = [];
for (const feature of geojson.features) {
  const geom = feature.geometry;
  if (!geom) continue;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  polygons.push(...polys);
}

// 2048x1024 (0.176deg/px). At 14 screen px per mask pixel — two dots of
// the lattice — that resolves the globe up to R = 2048 * 14 / (2 * PI)
// ≈ 4563 px; past that the coastline would show as steps, which is
// where the atlas stops zooming outside a local zone (spec 016).
const W = 2048;
const H = 1024;

const startedAt = Date.now();
const mask = rasterizePolygons(polygons, { south: -90, west: -180, north: 90, east: 180 }, W, H);
console.log(`Rasterized ${W}x${H} in ${Date.now() - startedAt}ms`);

const outDir = path.join(ROOT, "public", "atlas");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "land-mask.png");
await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(outPath);
console.log(`Wrote ${outPath}`);

// Regenerates public/atlas/land-mask.png — a monochrome equirectangular
// raster (land = white, ocean = black) sampled from the same Natural
// Earth source the old fixed dot-grid used (see docs/atlas-data-sources.md).
// The atlas page's dot lattice is now built AT RUNTIME, resampled to
// whatever angular step the current globe radius needs (see
// src/motion/Atlas.tsx) — this mask is what a land/ocean test samples
// against, replacing the old fixed-density src/data/atlas-land-dots.json.
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

const ROOT = path.resolve(import.meta.dirname, "..");
const geojson = JSON.parse(readFileSync(path.join(ROOT, "scripts", "ne_110m_land.geojson")));

// Ray-casting point-in-polygon. `ring` is an array of [lng, lat] pairs.
function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ringBBox(ring) {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
}

// Pre-index every polygon (exterior + hole rings, each with its own
// bbox) so the raster loop below can skip the expensive ray-cast for
// any ring whose bbox can't possibly contain the sample point — with
// 2048x1024 = ~2.1M samples, a naive un-indexed scan against this
// source's ~5100 total ring points would be far too slow.
const polygons = [];
for (const feature of geojson.features) {
  const geom = feature.geometry;
  if (!geom) continue;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  for (const rings of polys) {
    const exterior = rings[0];
    const holes = rings.slice(1);
    polygons.push({
      exterior,
      exteriorBBox: ringBBox(exterior),
      holes: holes.map((ring) => ({ ring, bbox: ringBBox(ring) })),
    });
  }
}

function isLand(lng, lat) {
  for (const { exterior, exteriorBBox: b, holes } of polygons) {
    if (lng < b.minLng || lng > b.maxLng || lat < b.minLat || lat > b.maxLat) continue;
    if (!pointInRing(lng, lat, exterior)) continue;
    let inHole = false;
    for (const { ring, bbox: hb } of holes) {
      if (lng < hb.minLng || lng > hb.maxLng || lat < hb.minLat || lat > hb.maxLat) continue;
      if (pointInRing(lng, lat, ring)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

// 2048x1024 (0.176deg/px) — finer than the dot lattice ever needs even
// at max zoom (TARGET_PX=7 over R up to ~1.6x a 900px viewport gives a
// dot step of ~0.28deg), so the mask is never the limiting resolution;
// coarser than this would start showing in the dot pattern as blocky
// coastlines, finer would just be a bigger file for no visible gain.
const W = 2048;
const H = 1024;
const mask = Buffer.alloc(W * H); // 1 byte/px, grayscale: 255 land, 0 ocean

const startedAt = Date.now();
for (let py = 0; py < H; py++) {
  const lat = 90 - ((py + 0.5) / H) * 180;
  for (let px = 0; px < W; px++) {
    const lng = ((px + 0.5) / W) * 360 - 180;
    mask[py * W + px] = isLand(lng, lat) ? 255 : 0;
  }
}
console.log(`Rasterized ${W}x${H} in ${Date.now() - startedAt}ms`);

const outDir = path.join(ROOT, "public", "atlas");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "land-mask.png");
await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
  .png({ compressionLevel: 9, palette: false })
  .toFile(outPath);
console.log(`Wrote ${outPath}`);

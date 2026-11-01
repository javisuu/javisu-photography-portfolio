// Regenerates the atlas's local land masks (spec 016): public/atlas/local/*.png
// and src/data/atlas-zones.json, which src/motion/Atlas.tsx reads.
//
// Why: the world mask (public/atlas/land-mask.png, 2048x1024 from Natural
// Earth 110m) resolves the globe only up to R ≈ 4563 px. Some photos with
// `precision: "exact"` sit a few hundred metres — or 40 m — apart and only
// separate on screen far beyond that. A ZONE is a group of such photos;
// each zone gets a small pyramid of square masks, sampled from
// OpenStreetMap's coastline, fine enough to zoom in until its photos
// separate. Everything is derived from src/data/photos.ts: adding photos
// needs no component change, just a re-run of this script (the
// diagnostic's `atlas` section — CA10 — fails if one is forgotten).
//
// To re-run:
//   1. curl -L -o atlas-source/land-polygons-split-4326.zip \
//        https://osmdata.openstreetmap.de/download/land-polygons-split-4326.zip
//      (~930 MB; atlas-source/ is gitignored, a build input like photos-master/)
//   2. unzip atlas-source/land-polygons-split-4326.zip -d atlas-source/
//   3. node scripts/generate-atlas-local-masks.mjs
// Data © OpenStreetMap contributors, ODbL — see docs/atlas-data-sources.md.
import { readFileSync, writeFileSync, mkdirSync, openSync, readSync, closeSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { rasterizePolygons } from "./lib/land-raster.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHP = path.join(ROOT, "atlas-source", "land-polygons-split-4326", "land_polygons.shp");
const SHX = SHP.replace(/\.shp$/, ".shx");
const OUT_DIR = path.join(ROOT, "public", "atlas", "local");
const OUT_JSON = path.join(ROOT, "src", "data", "atlas-zones.json");

// Must match src/motion/Atlas.tsx and scripts/diagnostico.mjs.
const CLUSTER_PX = 14; // CLUSTER_THRESHOLD_PX
const SEPARATION_MARGIN = 1.5; // a zone zooms until its closest pair is 1.5x the cluster threshold apart
const PX_PER_MASK_PX = 14; // a mask stops resolving once one of its pixels covers two lattice dots
const WORLD_MASK_W = 2048;
const WORLD_MAX_R = Math.round((WORLD_MASK_W * PX_PER_MASK_PX) / (2 * Math.PI)); // 4563

const EARTH_KM = 6371;
const KM_PER_DEG = (2 * Math.PI * EARTH_KM) / 360;
const LEVEL_PX = 1024;
const FIRST_LEVEL_KM = 400;
const LEVEL_SHRINK = 10;
const MIN_LEVEL_OVER_EXTENT = 2; // the finest level is at least twice the zone's own extent

if (!existsSync(SHP) || !existsSync(SHX)) {
  console.log(`Missing ${path.relative(ROOT, SHP)} — see the header of this script for how to fetch it.`);
  process.exit(2);
}

// ---- Photos (same line format the diagnostic parses) ----
function readPhotos() {
  const lines = readFileSync(path.join(ROOT, "src", "data", "photos.ts"), "utf8").split("\n");
  const out = [];
  let src = null;
  for (const l of lines) {
    const s = l.match(/src: "(\/photos[^"]+)"/);
    if (s) src = s[1];
    const m = l.match(/place: \{ city: "([^"]+)", country: "[^"]+", lat: *([-\d.]+|null), *lng: *([-\d.]+|null), *precision: "(\w+)"/);
    if (m && src && m[2] !== "null" && m[3] !== "null") out.push({ src, city: m[1], lat: +m[2], lng: +m[3], precision: m[4] });
  }
  return out;
}

function angDist(a, b) {
  const D = Math.PI / 180;
  const c = Math.sin(a.lat * D) * Math.sin(b.lat * D) + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.cos((a.lng - b.lng) * D);
  return Math.acos(Math.min(1, Math.max(-1, c)));
}

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---- Zones: exact coordinates that don't separate on the world mask ----
const photos = readPhotos().filter((p) => p.precision === "exact");
const coords = [...new Map(photos.map((p) => [`${p.lat},${p.lng}`, p])).values()];
const linkRad = (CLUSTER_PX * SEPARATION_MARGIN) / WORLD_MAX_R;
const parent = coords.map((_, i) => i);
const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
for (let i = 0; i < coords.length; i++)
  for (let j = i + 1; j < coords.length; j++) if (angDist(coords[i], coords[j]) < linkRad) parent[find(i)] = find(j);
const groups = new Map();
coords.forEach((c, i) => {
  const r = find(i);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(c);
});

const zones = [];
for (const members of groups.values()) {
  if (members.length < 2) continue;
  let minRad = Infinity, maxRad = 0;
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) {
      const a = angDist(members[i], members[j]);
      minRad = Math.min(minRad, a);
      maxRad = Math.max(maxRad, a);
    }
  const lats = members.map((m) => m.lat);
  const lngs = members.map((m) => m.lng);
  const south = Math.min(...lats), north = Math.max(...lats), west = Math.min(...lngs), east = Math.max(...lngs);
  const lat0 = (south + north) / 2, lng0 = (west + east) / 2;
  const cities = photos.filter((p) => members.some((m) => m.lat === p.lat && m.lng === p.lng)).map((p) => p.city);
  const city = [...new Set(cities)].sort((a, b) => cities.filter((c) => c === b).length - cities.filter((c) => c === a).length)[0];
  const needR = Math.round((CLUSTER_PX * SEPARATION_MARGIN) / minRad);
  const extentKm = maxRad * EARTH_KM;
  // Levels: 400 km, then ten times smaller (never below twice the zone's
  // own extent), until one resolves needR.
  const levels = [];
  let sizeKm = FIRST_LEVEL_KM;
  for (;;) {
    const resKm = sizeKm / LEVEL_PX;
    const maxR = Math.round((PX_PER_MASK_PX * EARTH_KM) / resKm);
    const halfLat = sizeKm / 2 / KM_PER_DEG;
    const halfLng = sizeKm / 2 / (KM_PER_DEG * Math.cos((lat0 * Math.PI) / 180));
    levels.push({ sizeKm, maxR, box: { south: lat0 - halfLat, west: lng0 - halfLng, north: lat0 + halfLat, east: lng0 + halfLng } });
    if (maxR >= needR) break;
    sizeKm = Math.max(sizeKm / LEVEL_SHRINK, extentKm * MIN_LEVEL_OVER_EXTENT);
  }
  // A small pad (~100 m) so the members' own coordinates sit strictly inside.
  const pad = 0.001;
  zones.push({ name: slug(city), city, members: members.length, minM: Math.round(minRad * EARTH_KM * 1000), extentKm, needR, bbox: [south - pad, west - pad, north + pad, east + pad], levels, polygons: [] });
}
console.log(`${zones.length} zones: ${zones.map((z) => `${z.name} (${z.members} coordinates, closest ${z.minM} m, needR ${z.needR})`).join(", ")}`);

// ---- OSM land polygons: only the records that touch a zone ----
// Minimal ESRI shapefile reader (Polygon records only, which is all this
// file has): the .shx gives each record's offset, every record starts
// with its bbox, so only the few that intersect a zone get parsed.
const boxHit = (b, xmin, ymin, xmax, ymax) => !(xmax < b.west || xmin > b.east || ymax < b.south || ymin > b.north);
const shx = readFileSync(SHX);
const nRecords = (shx.length - 100) / 8;
const fd = openSync(SHP, "r");
const head = Buffer.alloc(44);
let parsed = 0;
const t0 = Date.now();
for (let i = 0; i < nRecords; i++) {
  const offset = shx.readInt32BE(100 + i * 8) * 2;
  const length = shx.readInt32BE(100 + i * 8 + 4) * 2;
  readSync(fd, head, 0, 44, offset);
  if (head.readInt32LE(8) !== 5) continue;
  const xmin = head.readDoubleLE(12), ymin = head.readDoubleLE(20), xmax = head.readDoubleLE(28), ymax = head.readDoubleLE(36);
  const hits = zones.filter((z) => boxHit(z.levels[0].box, xmin, ymin, xmax, ymax));
  if (!hits.length) continue;
  const rec = Buffer.alloc(length);
  readSync(fd, rec, 0, length, offset + 8);
  const numParts = rec.readInt32LE(36);
  const numPoints = rec.readInt32LE(40);
  const partsAt = 44;
  const pointsAt = partsAt + numParts * 4;
  // One record = one polygon: its parts are the exterior and its holes.
  const polygon = [];
  for (let p = 0; p < numParts; p++) {
    const from = rec.readInt32LE(partsAt + p * 4);
    const to = p + 1 < numParts ? rec.readInt32LE(partsAt + (p + 1) * 4) : numPoints;
    const ring = new Array(to - from);
    for (let k = from; k < to; k++) ring[k - from] = [rec.readDoubleLE(pointsAt + k * 16), rec.readDoubleLE(pointsAt + k * 16 + 8)];
    polygon.push(ring);
  }
  for (const z of hits) z.polygons.push(polygon);
  parsed++;
}
closeSync(fd);
console.log(`Read ${nRecords} records, parsed ${parsed} in ${Date.now() - t0}ms`);

// ---- Rasterize every level ----
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });
const json = { source: "OpenStreetMap land polygons (osmdata.openstreetmap.de), © OpenStreetMap contributors, ODbL", worldMaxR: WORLD_MAX_R, zones: [] };
for (const z of zones) {
  const levels = [];
  for (let l = 0; l < z.levels.length; l++) {
    const { box, maxR, sizeKm } = z.levels[l];
    const t = Date.now();
    const mask = rasterizePolygons(z.polygons, box, LEVEL_PX, LEVEL_PX);
    const file = `${z.name}-${l}.png`;
    await sharp(mask, { raw: { width: LEVEL_PX, height: LEVEL_PX, channels: 1 } })
      .png({ compressionLevel: 9, palette: false })
      .toFile(path.join(OUT_DIR, file));
    const land = mask.reduce((s, v) => s + (v ? 1 : 0), 0) / mask.length;
    console.log(`  ${file}: ${sizeKm.toFixed(1)} km, ${((sizeKm * 1000) / LEVEL_PX).toFixed(1)} m/px, maxR ${maxR}, ${(land * 100).toFixed(1)} % land, ${Date.now() - t}ms`);
    const r6 = (v) => Math.round(v * 1e6) / 1e6;
    levels.push({ file: `/atlas/local/${file}`, bbox: [r6(box.south), r6(box.west), r6(box.north), r6(box.east)], w: LEVEL_PX, h: LEVEL_PX, maxR });
  }
  json.zones.push({ name: z.name, city: z.city, bbox: z.bbox.map((v) => Math.round(v * 1e6) / 1e6), needR: z.needR, levels });
}
writeFileSync(OUT_JSON, JSON.stringify(json, null, 2) + "\n");
console.log(`Wrote ${path.relative(ROOT, OUT_JSON)} and ${json.zones.reduce((s, z) => s + z.levels.length, 0)} masks in ${path.relative(ROOT, OUT_DIR)}`);

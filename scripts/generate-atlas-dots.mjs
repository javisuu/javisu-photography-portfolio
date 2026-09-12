// Regenerates src/data/atlas-land-dots.json — the dot-grid landmass the
// /atlas page renders. Source data and licensing: see
// docs/atlas-data-sources.md. To re-run:
//   1. curl -o scripts/ne_110m_land.geojson \
//        https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson
//   2. node scripts/generate-atlas-dots.mjs
//   3. rm scripts/ne_110m_land.geojson (not checked in — it's a build
//      input, same convention as the gitignored photos-master/)
import { readFileSync, writeFileSync } from "fs";

const geojson = JSON.parse(readFileSync(new URL("./ne_110m_land.geojson", import.meta.url)));

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

// A GeoJSON Polygon's rings: ring[0] is the exterior, the rest are holes.
function pointInPolygonCoords(lng, lat, polygonCoords) {
  if (!pointInRing(lng, lat, polygonCoords[0])) return false;
  for (let k = 1; k < polygonCoords.length; k++) {
    if (pointInRing(lng, lat, polygonCoords[k])) return false; // inside a hole
  }
  return true;
}

function pointOnLand(lng, lat, features) {
  for (const feature of features) {
    const geom = feature.geometry;
    if (!geom) continue;
    if (geom.type === "Polygon") {
      if (pointInPolygonCoords(lng, lat, geom.coordinates)) return true;
    } else if (geom.type === "MultiPolygon") {
      for (const polygonCoords of geom.coordinates) {
        if (pointInPolygonCoords(lng, lat, polygonCoords)) return true;
      }
    }
  }
  return false;
}

const STEP = 2.5; // degrees between grid samples, both axes (equirectangular preserves aspect, so uniform degree spacing gives uniform screen spacing)
const dots = [];

for (let lat = -90 + STEP / 2; lat < 90; lat += STEP) {
  for (let lng = -180 + STEP / 2; lng < 180; lng += STEP) {
    if (pointOnLand(lng, lat, geojson.features)) {
      dots.push([Math.round(lat * 1000) / 1000, Math.round(lng * 1000) / 1000]);
    }
  }
}

console.log(`Generated ${dots.length} land dots at ${STEP}-degree spacing.`);
writeFileSync(
  new URL("../src/data/atlas-land-dots.json", import.meta.url),
  JSON.stringify(dots)
);

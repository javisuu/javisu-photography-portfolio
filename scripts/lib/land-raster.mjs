// Shared land rasterizer for the atlas masks (spec 016):
// scripts/generate-atlas-land-mask.mjs (the world) and
// scripts/generate-atlas-local-masks.mjs (the local zones).
//
// Scanline. For a pixel centre at (lng, lat), a ring edge "crosses" when
// (yi > lat) !== (yj > lat), at
//   x = ((xj - xi) * (lat - yi)) / (yj - yi) + xi
// and the pixel is inside a POLYGON (its exterior and holes together)
// when an odd number of that polygon's crossings lie at x > lng — the
// ray-casting test the world script used before, so its output is the
// same bit for bit. The pixel is land when it is inside ANY polygon.
//
// The parity is per polygon, never across polygons, on purpose: OSM's
// split land polygons overlap slightly along their 1° tile borders, and
// a global even-odd counts that overlap twice and paints a sea line down
// every border (seen on the first run of the local masks, 2026-11-01).
//
// Cost: each edge is visited once per row it spans, not once per pixel,
// which is what makes OSM's dense coastlines tractable.
//
// polygons: array of polygons, each an array of rings, each ring an
// array of [lng, lat] (closed or not — the last->first edge is always
// included). box: { south, west, north, east } in degrees.
// Returns a Buffer of W*H bytes, 255 land / 0 sea, row 0 = north.
export function rasterizePolygons(polygons, box, W, H) {
  const { south, west, north, east } = box;
  const rowLat = (py) => north - ((py + 0.5) / H) * (north - south);
  const colLng = (px) => west + ((px + 0.5) / W) * (east - west);
  // rows[py]: Map polygon index -> crossings.
  const rows = Array.from({ length: H }, () => new Map());
  polygons.forEach((rings, poly) => {
    for (const ring of rings) {
      const n = ring.length;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (yi === yj) continue;
        const yLo = Math.min(yi, yj);
        const yHi = Math.max(yi, yj);
        // Rows whose centre latitude may fall in [yLo, yHi]; the exact
        // (yi > lat) !== (yj > lat) test decides.
        const pyFrom = Math.max(0, Math.floor(((north - yHi) / (north - south)) * H - 0.5) - 1);
        const pyTo = Math.min(H - 1, Math.ceil(((north - yLo) / (north - south)) * H - 0.5) + 1);
        for (let py = pyFrom; py <= pyTo; py++) {
          const lat = rowLat(py);
          if (yi > lat !== yj > lat) {
            const m = rows[py];
            let xs = m.get(poly);
            if (!xs) m.set(poly, (xs = []));
            xs.push(((xj - xi) * (lat - yi)) / (yj - yi) + xi);
          }
        }
      }
    }
  });
  const out = Buffer.alloc(W * H);
  for (let py = 0; py < H; py++) {
    for (const xs of rows[py].values()) {
      xs.sort((a, b) => a - b);
      // Walk pixels left to right with the same comparison the ray-cast
      // used (lng < x): k = crossings at x <= lng so far, so the count at
      // x > lng is xs.length - k. Left of xs[0] that count is the full
      // (even, rings are closed) total, so the walk starts just before it.
      let k = 0;
      const startPx = Math.max(0, Math.floor(((xs[0] - west) / (east - west)) * W - 0.5) - 1);
      for (let px = startPx; px < W; px++) {
        const lng = colLng(px);
        while (k < xs.length && !(lng < xs[k])) k++;
        if (k === xs.length) break; // nothing left to the right: outside from here on
        if ((xs.length - k) % 2 === 1) out[py * W + px] = 255;
      }
    }
  }
  return out;
}

# Atlas map data sources

## Landmass (dot-grid outline)

- **Source**: Natural Earth, `ne_110m_land` (110m resolution — Natural Earth's coarsest, made for exactly this kind of small-scale/whole-world display).
- **Fetched from**: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson` (the project's official GitHub mirror).
- **License**: Public domain. Per Natural Earth's own terms of use (naturalearthdata.com/about/terms-of-use/): *"All versions of Natural Earth raster + vector map data found on this website are in the public domain... No permission is needed to use Natural Earth. Crediting the authors is unnecessary."* Attribution is optional/encouraged, not required — the atlas page credits it anyway as a courtesy ("Land data: Natural Earth").
- **How it's used**: not shipped as raw GeoJSON or rendered client-side. `scripts/generate-atlas-dots.mjs` reads the source polygons, samples a 2.5°×2.5° lat/lng grid, keeps only points that fall on land (ray-casting point-in-polygon, respecting holes), and writes the result to `src/data/atlas-land-dots.json` — a flat array of `[lat, lng]` pairs (~3,400 points). The atlas page just plots that static list; no geometry processing happens in the browser, and no map library is used anywhere in the pipeline.
- **Regenerating**: see the header comment in `scripts/generate-atlas-dots.mjs`. The source GeoJSON itself isn't checked in (a build input, same convention as the gitignored `photos-master/`) — only the generated dot list is.

## Photo coordinates

Hand-entered by Javi per photo (`src/data/photos.ts`, `Place` type) — not from any external dataset, not from EXIF. See that file's doc comments and `design-spec-v2.md`'s "Place data" section for the exact rules (`exact` vs `city` precision, nullability).

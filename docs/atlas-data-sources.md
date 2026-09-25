# Atlas map data sources

## Landmass (orthographic globe dot lattice)

- **Source**: Natural Earth, `ne_110m_land` (110m resolution — Natural Earth's coarsest, made for exactly this kind of small-scale/whole-world display). Unchanged from before this became a globe — see Open items/history below for why a coarser source is still the right call even at the globe's much closer max zoom.
- **Fetched from**: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson` (the project's official GitHub mirror).
- **License**: Public domain. Per Natural Earth's own terms of use (naturalearthdata.com/about/terms-of-use/): *"All versions of Natural Earth raster + vector map data found on this website are in the public domain... No permission is needed to use Natural Earth. Crediting the authors is unnecessary."* Attribution is optional/encouraged, not required.
- **How it's used**: `scripts/generate-atlas-land-mask.mjs` reads the source polygons and rasterizes them (ray-casting point-in-polygon per pixel, bbox-indexed per ring for speed, respecting holes) into a monochrome 2048×1024 equirectangular PNG — `public/atlas/land-mask.png` (land = white, ocean = black; ~23KB, compresses well since land/ocean are large contiguous regions). That's the only shipped artifact; no raw GeoJSON and no per-dot list ship to the client.
- **Why a raster mask now, not a fixed dot list**: the old flat map baked one dot grid in world coordinates and scaled it with zoom, so on-screen spacing degraded linearly as you zoomed in (measured: 31.3px spacing at one zoom, ~6.7px at scale 1 — zooming in just showed the SAME dots further apart, never more coastline). The globe instead derives the lattice's angular step from the CURRENT radius every time it changes meaningfully (`TARGET_PX / R`, see `buildLattice` in `src/motion/Atlas.tsx`) and resamples the mask at that step — on-screen spacing stays pinned to `TARGET_PX` (7px) at every zoom level. 2048×1024 (0.176°/px) is finer than the lattice ever needs, even at the globe's max zoom (R up to 1.6× the shorter viewport dimension, which works out to roughly a 0.28° dot step) — so the mask is never the resolution bottleneck; the Natural Earth source's own coastline detail is.
- **Regenerating**: see the header comment in `scripts/generate-atlas-land-mask.mjs`. The source GeoJSON itself isn't checked in (a build input, same convention as the gitignored `photos-master/`) — only the generated PNG mask is.

## Photo coordinates

Hand-entered by Javi per photo (`src/data/photos.ts`, `Place` type) — not from any external dataset, not from EXIF. See that file's doc comments and `design-spec-v2.md`'s "Place data" section for the exact rules (`exact` vs `city` precision, nullability).

#!/usr/bin/env node
// Reads originals from /photos-master/<Album>/, exports resized AVIF
// versions into /public/photos/<slug>/, and writes a JSON manifest
// (scripts/photos-manifest.json) with the structural facts — width,
// height, order, cover flag, and any EXIF capture data found — needed
// to hand-update src/data/photos.ts (titles, album location/year, and
// any missing capture data are NOT inferred and must be filled in there).
//
// Filename convention inside each album folder: "NN.ext" or "NN-cover.ext"
// (case-insensitive extension, e.g. "05-cover.JPEG"). NN sets display
// order; "-cover" marks that album's cover photo. If order numbers
// collide or are missing anywhere in an album, the whole album falls
// back to alphabetical-filename order instead (a warning is printed).

import { readdir, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import exifr from "exifr";

const ROOT = path.resolve(import.meta.dirname, "..");
const MASTER_DIR = path.join(ROOT, "photos-master");
const OUTPUT_DIR = path.join(ROOT, "public", "photos");
const MANIFEST_PATH = path.join(ROOT, "scripts", "photos-manifest.json");
const MAX_LONG_EDGE = 2500;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff"]);

function slugify(name) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseFilename(filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const match = base.match(/^(\d+)(-cover)?$/i);
  return {
    orderFromName: match ? parseInt(match[1], 10) : null,
    isCover: Boolean(match?.[2]),
  };
}

async function extractCapture(filePath) {
  try {
    const exif = await exifr.parse(filePath, ["FocalLength", "FNumber", "ISO"]);
    if (!exif) return null;
    const { FocalLength, FNumber, ISO } = exif;
    if (!FocalLength && !FNumber && !ISO) return null;
    return {
      focalLength: FocalLength ? `${Math.round(FocalLength)}mm` : "—",
      aperture: FNumber ? `f/${FNumber}` : "—",
      iso: ISO ? `ISO ${ISO}` : "—",
    };
  } catch {
    return null;
  }
}

async function processAlbum(albumDirName) {
  const albumPath = path.join(MASTER_DIR, albumDirName);
  const entries = await readdir(albumPath, { withFileTypes: true });
  const files = entries
    .filter(
      (e) =>
        e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase())
    )
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const slug = slugify(albumDirName);
  const outDir = path.join(OUTPUT_DIR, slug);
  await mkdir(outDir, { recursive: true });

  const parsedAll = files.map(parseFilename);
  const seenOrders = new Set();
  const hasCollision = parsedAll.some((p) => {
    if (p.orderFromName === null) return true;
    if (seenOrders.has(p.orderFromName)) return true;
    seenOrders.add(p.orderFromName);
    return false;
  });

  if (hasCollision) {
    console.warn(
      `  ! "${albumDirName}": order numbers are missing or collide (check for duplicate NN prefixes) — falling back to alphabetical order for this album.`
    );
  }

  const photos = [];
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const srcPath = path.join(albumPath, filename);
    const { orderFromName, isCover } = parsedAll[i];
    const order = hasCollision ? i + 1 : orderFromName;

    const image = sharp(srcPath).rotate(); // auto-orient from EXIF
    const metadata = await image.metadata();
    const isPortrait = (metadata.height ?? 0) > (metadata.width ?? 0);
    const resizeOpts = isPortrait
      ? { height: Math.min(MAX_LONG_EDGE, metadata.height ?? MAX_LONG_EDGE) }
      : { width: Math.min(MAX_LONG_EDGE, metadata.width ?? MAX_LONG_EDGE) };

    const outName = `${String(order).padStart(2, "0")}.avif`;
    const outPath = path.join(outDir, outName);
    const outputInfo = await image
      .resize({ ...resizeOpts, withoutEnlargement: true })
      .avif({ quality: 62 })
      .toFile(outPath);

    photos.push({
      album: slug,
      order,
      isCover,
      sourceFile: filename,
      src: `/photos/${slug}/${outName}`,
      width: outputInfo.width,
      height: outputInfo.height,
      capture: await extractCapture(srcPath),
    });
  }

  return { slug, folderName: albumDirName, photos };
}

async function main() {
  if (!existsSync(MASTER_DIR)) {
    console.log(`prepare-images: no ${MASTER_DIR} found — nothing to do.`);
    return;
  }
  const albumDirs = (await readdir(MASTER_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  if (albumDirs.length === 0) {
    console.log("prepare-images: photos-master is empty — nothing to do.");
    return;
  }

  const albums = [];
  for (const dir of albumDirs) {
    console.log(`Processing album "${dir}"...`);
    albums.push(await processAlbum(dir));
  }

  await writeFile(MANIFEST_PATH, JSON.stringify(albums, null, 2));
  console.log(
    `\nDone. Exported images to public/photos/. Manifest written to ${path.relative(ROOT, MANIFEST_PATH)}.`
  );
  console.log(
    "src/data/photos.ts still needs real titles, and album location/year — update it from the manifest."
  );
}

main();

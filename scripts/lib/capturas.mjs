// Capturas de referencia del escritorio (spec 018, CA10). Un arreglo para
// movil no puede cambiar nada del escritorio (Javi, 2026-11-04): se guarda
// una captura de cada ruta antes de tocar src/ y cada tarea la compara al
// pixel.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

// Valida el flag: devuelve { modo, dir } o { error }, o null si no se paso.
export function parseCapturasArgs(args) {
  const g = args.indexOf("--capturas-guardar");
  const c = args.indexOf("--capturas-comparar");
  if (g === -1 && c === -1) return null;
  if (g !== -1 && c !== -1) return { error: "--capturas-guardar y --capturas-comparar no van juntos" };
  const modo = g !== -1 ? "guardar" : "comparar";
  const dir = args[(g !== -1 ? g : c) + 1];
  if (!dir || dir.startsWith("--")) return { error: `--capturas-${modo} necesita una carpeta` };
  if (modo === "comparar" && !existsSync(dir)) return { error: `--capturas-comparar: no existe ${JSON.stringify(dir)}` };
  return { modo, dir };
}

export function guardarPng(dir, name, buf) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.png`), buf);
}

export function guardarJson(dir, name, data) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(data, null, 2));
}

export function leerJson(dir, name) {
  const f = join(dir, `${name}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

// Pixeles distintos entre la captura `buf` y la de referencia `name`. Un
// pixel cuenta si cualquiera de sus canales difiere. Devuelve tambien la caja
// que encierra todas las diferencias, para saber donde mirar.
export const RUIDO_NIVELES = 1;
export async function compararPng(dir, name, buf) {
  const f = join(dir, `${name}.png`);
  if (!existsSync(f)) return { error: `no hay referencia ${name}.png` };
  const [a, b] = await Promise.all([
    sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height)
    return { error: `tamaño distinto: ${a.info.width}x${a.info.height} frente a ${b.info.width}x${b.info.height}` };
  const { width, height } = a.info;
  // diff: pixeles con cualquier diferencia. real: los que difieren en mas de
  // RUIDO_NIVELES en algun canal. Medido el 2026-11-04 sin tocar src/: la
  // ultima fila del atlas sale a 249 o a 250 segun la pasada (1440 px a 1
  // nivel); un cambio de verdad mueve mucho mas que 1 nivel.
  let diff = 0, real = 0, maxDelta = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3]));
      if (d === 0) continue;
      diff++;
      if (d > maxDelta) maxDelta = d;
      if (d <= RUIDO_NIVELES) continue;
      real++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { diff, real, maxDelta, total: width * height, bbox: real ? [minX, minY, maxX - minX + 1, maxY - minY + 1] : null };
}

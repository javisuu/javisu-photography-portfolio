#!/usr/bin/env node
// Medida del carrusel /albums (spec 011). Mide; no arregla nada.
//   node scripts/medir-carrusel.mjs --url https://x.vercel.app
//                                    contra una web desplegada
//   node scripts/medir-carrusel.mjs  next build + next start en :3100
//   --sin-build                      reutiliza el .next existente
//   --cpu N                          throttling de CPU de CDP (N veces mas lento)
//   --repeticiones N                 N pasadas, cada una con contexto nuevo;
//                                    se da la mediana de cada cifra
//   --geometria <salida.json>        solo caja y recorte en reposo (CA7): al
//                                    llegar y tras ArrowRight, ArrowRight,
//                                    ArrowLeft, ArrowLeft (el primero no
//                                    cambia de album; el segundo, si)
//   --comparar <referencia.json>     con --geometria: diferencia maxima en px
//   --fps 30|120                     con --geometria: requestAnimationFrame a
//                                    30 (un frame de cada dos) o 120 (dos
//                                    callbacks por frame, el primero 8,33 ms
//                                    antes) (CA8)
//   --trace <carpeta>                graba un trace de la llegada y lista lo
//                                    que hay en su frame mas largo (CA2)
// Requiere: npm i -D playwright && npx playwright install chromium
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PORT = 3100;
const S = 110; // ancho de una diapositiva plegada (src/motion/AlbumsCarousel.tsx)
const EPS = 0.5;
const SLIDE_HEIGHT = 500;
const SETTLE_MS = 3500;
// Spec 012: umbral de "rapido" de la tira, en px por frame de referencia
// (src/motion/AlbumsCarousel.tsx, OPEN_SPEED y su histeresis).
const FAST_PX = 20;
const SLOW_PX = 16;
// Linea fija del borde derecho de la abierta en reposo, hacia delante: la
// de la geometria de referencia de la spec 011 (ArrowRight 1).
const GEOM_REF = "evidencia/2026-10-22_011-geometria-antes.json";

const args = process.argv.slice(2);
const val = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] ?? "" : d);
const intArg = (k, d, min) => {
  const v = val(k, String(d));
  if (!/^\d+$/.test(v) || Number(v) < min) { console.log(`${k} invalido: ${JSON.stringify(v)}. Tiene que ser un entero >= ${min}`); process.exit(2); }
  return Number(v);
};
const urlArg = val("--url");
let BASE = `http://localhost:${PORT}`;
if (urlArg !== null) {
  try {
    const u = new URL(urlArg);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocolo");
    BASE = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    console.log(`URL invalida: ${JSON.stringify(urlArg)}. Ejemplo: --url https://dominio.vercel.app`);
    process.exit(2);
  }
}
const CPU = intArg("--cpu", 1, 1);
const reps = intArg("--repeticiones", 1, 1);
const geomOut = val("--geometria");
const geomRef = val("--comparar");
const fpsArg = val("--fps");
if (fpsArg !== null && fpsArg !== "30" && fpsArg !== "120") { console.log(`--fps invalido: ${JSON.stringify(fpsArg)}. Solo 30 o 120`); process.exit(2); }
const FPS = fpsArg ? Number(fpsArg) : 60;
const traceDir = val("--trace");
if (geomOut === "" || geomRef === "" || traceDir === "") { console.log("falta el valor de --geometria, --comparar o --trace"); process.exit(2); }

const log = (s = "") => console.log(s);
const rule = (t) => log(`\n=== ${t} ===`);
const r1 = (v) => Math.round(v * 10) / 10;
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function sh(cmd) {
  try { return { code: 0, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` }; }
}
// Hijo con su salida guardada: next sale con 1 si ve el lockfile de otro next
// de la carpeta (spec 005).
function child(cmdArgs) {
  const c = spawn("npx", cmdArgs, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const s = { proc: c, out: "", exit: null };
  c.stdout.on("data", (d) => { s.out += d; });
  c.stderr.on("data", (d) => { s.out += d; });
  c.once("exit", (code) => { s.exit = code ?? "senal"; });
  return s;
}
// Con shell:true, kill() en Windows mata solo la shell; hay que matar el arbol.
const killTree = (c) => (process.platform === "win32" ? sh(`taskkill /PID ${c.proc.pid} /T /F`) : c.proc.kill("SIGTERM"));

let pw;
try { pw = await import("playwright"); }
catch { log("falta playwright: npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const git = { branch: sh("git branch --show-current").out.trim(), head: sh("git rev-parse --short HEAD").out.trim() };
log(`MEDIR CARRUSEL ${new Date().toISOString().slice(0, 10)} · ${git.branch} · ${git.head}`);
log(`contra ${BASE} · cpu x${CPU} · ${FPS} fps · 1440x900 · ${reps} repeticion(es)`);

// --- servidor -----------------------------------------------------------------

let server = null;
let browser = null;
let code = 0;
// Los helpers y escenarios de abajo son const: main corre al final del fichero.
async function main() {
try {
  if (urlArg === null) {
    rule(`next start en :${PORT}`);
    if (await fetch(BASE, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)) {
      log(`el puerto ${PORT} ya esta ocupado (servidor huerfano de un run anterior?). Cierralo y repite.`);
      process.exit(2);
    }
    if (!args.includes("--sin-build")) {
      const build = child(["next", "build"]);
      while (build.exit === null) await new Promise((r) => setTimeout(r, 500));
      if (build.exit !== 0) { log(`next build salio con ${build.exit}. Su salida:`); log(build.out.slice(-2000)); process.exit(2); }
      log("build ok");
    }
    server = child(["next", "start", "-p", String(PORT)]);
    const t0 = Date.now();
    let ready = false;
    while (!ready && Date.now() - t0 < 60000) {
      if (server.exit !== null) { log(`next start salio (codigo ${server.exit}) antes de responder. Su salida:`); log(server.out.slice(-1500)); process.exit(2); }
      ready = await fetch(BASE, { signal: AbortSignal.timeout(4000) }).then((r) => r.status < 500, () => false);
      if (!ready) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!ready) { log("next start no respondio en 60 s"); log(server.out.slice(-1500)); killTree(server); process.exit(2); }
    log("ok");
  } else {
    rule("servidor remoto");
    // Misma regla que scripts/diagnostico.mjs: la proteccion de Vercel
    // redirige a vercel.com/login con 200.
    const r = await fetch(BASE, { signal: AbortSignal.timeout(15000) }).catch((e) => ({ error: e.message }));
    if (r.error || r.status >= 400) { log(`${BASE} no responde bien: ${r.error ?? `http ${r.status}`}`); process.exit(2); }
    if (new URL(r.url).origin !== new URL(BASE).origin) {
      log(`${BASE} redirige a otro origen (${new URL(r.url).origin}): seguramente esta protegido con login.`);
      process.exit(2);
    }
    log(`ok · http ${r.status}`);
  }

  browser = await pw.chromium.launch();
  if (geomOut) await geometry();
  else if (traceDir) await trace();
  else await fluidity();
} finally {
  await browser?.close();
  if (server) killTree(server);
}
}

// --- pagina instrumentada -------------------------------------------------------

// Corre antes que cualquier script de la pagina. Graba por frame: intervalo,
// cajas de cada diapositiva visible (solo si __recBoxes) y el contador; y por
// mutacion de style, que propiedades cambiaron de verdad.
function instrument({ fps, S, SLIDE_HEIGHT }) {
  // A 60 fps los callbacks de rAF de la pagina siguen siendo los nativos, y la
  // cadencia la graba un rAF propio, registrado antes que ningun script de la
  // pagina: corre primero en cada frame. Juntar todos los callbacks en uno
  // (como hace --fps) cambio la cadencia medida, p95 de 33 a 17 ms en la rueda
  // (2026-10-22); la medida no puede alterar lo medido.
  // Las cajas, en cambio, tienen que leerse despues del tick del carrusel en
  // ese mismo frame: son las que se pintan, no las del frame anterior ni las
  // de un render de React que el siguiente tick sobrescribe antes de pintar.
  // El tick pide su siguiente frame al empezar, asi que cada vez que la pagina
  // pide un frame se encola una microtarea, que corre al terminar el callback
  // que lo pidio, y lee las cajas para el frame en curso (la ultima gana).
  const real = window.requestAnimationFrame.bind(window);
  if (fps === 60) {
    const loop = (t) => { sample(t); real(loop); };
    real(loop);
    window.requestAnimationFrame = (cb) => {
      const h = real(cb);
      if (rec.recBoxes) {
        queueMicrotask(() => {
          const f = rec.frames[rec.frames.length - 1];
          if (f && Math.abs(f.t - document.timeline.currentTime) < 1) f.boxes = boxes();
        });
      }
      return h;
    };
  } else {
    // --fps: los callbacks de la pagina se llaman a 30 (un frame de cada dos)
    // o a 120 por segundo (dos veces por frame, la primera 8,33 ms antes).
    // Solo para --geometria: ahi cuenta donde se para, no la cadencia.
    let queue = new Map();
    let id = 0;
    let odd = false;
    const flush = (t) => {
      const q = queue;
      queue = new Map();
      q.forEach((cb) => { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } });
      sample(t);
      if (rec.recBoxes) rec.frames[rec.frames.length - 1].boxes = boxes();
    };
    const run = (t) => {
      real(run);
      if (fps === 30) { odd = !odd; if (!odd) flush(t); }
      else { flush(t - 1000 / 120); flush(t); }
    };
    real(run);
    window.requestAnimationFrame = (cb) => { queue.set(++id, cb); return id; };
    window.cancelAnimationFrame = (h) => { queue.delete(h); };
  }

  const rec = { frames: [], lt: [], recBoxes: false };
  window.__rec = rec;
  const ids = new WeakMap();
  let next = 0;
  const idOf = (el) => { if (!ids.has(el)) ids.set(el, next++); return ids.get(el); };
  const visibleMain = () => [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
  const slides = (m) => {
    const tagged = m.querySelectorAll("[data-carousel-slide]");
    return [...(tagged.length ? tagged : m.querySelectorAll("div.absolute.isolate.overflow-hidden"))];
  };
  const counter = (m) => m?.querySelector(".tabular-nums span")?.textContent ?? null;

  let last = null;
  const fresh = () => ({ records: 0, targets: new Set(), changed: { width: 0, left: 0, right: 0, filter: 0, transform: 0, opacity: 0 } });
  let pending = fresh();
  function sample(t) {
    if (!document.documentElement) return;
    const m = visibleMain();
    const f = { t, dt: last === null ? 0 : t - last, counter: counter(m), records: pending.records, targets: [...pending.targets].slice(0, 3), changed: pending.changed };
    pending = fresh();
    last = t;
    rec.frames.push(f);
  }
  function boxes() {
    const m = visibleMain();
    if (!m) return [];
    return slides(m).map((el) => {
      const r = el.getBoundingClientRect();
      const img = el.querySelector("img");
      const nat = img ? Math.round(SLIDE_HEIGHT * (Number(img.getAttribute("width")) / Number(img.getAttribute("height")))) : 0;
      // a: la diapositiva abierta, la unica con enlace.
      return { id: idOf(el), l: r.left, r: r.right, w: r.width, nat, a: !!el.querySelector("a") };
    }).filter((b) => b.r > -200 && b.l < innerWidth + 200);
  }

  const parse = (css) => {
    const o = {};
    for (const decl of (css || "").split(";")) {
      const i = decl.indexOf(":");
      if (i > 0) o[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
    }
    return o;
  };
  const start = () => new MutationObserver((ms) => {
    for (const mu of ms) {
      pending.records++;
      pending.targets.add(`${mu.target.tagName.toLowerCase()}.${String(mu.target.className).split(" ")[0]}`);
      const a = parse(mu.oldValue);
      const b = parse(mu.target.getAttribute("style"));
      for (const k of Object.keys(pending.changed)) if (a[k] !== b[k]) pending.changed[k]++;
    }
  }).observe(document, { attributes: true, attributeFilter: ["style"], attributeOldValue: true, subtree: true });
  if (document.documentElement) start(); else addEventListener("DOMContentLoaded", start);

  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => rec.lt.push([e.startTime, e.duration]))).observe({ type: "longtask", buffered: true });
  } catch { /* sin longtask */ }
}

async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.addInitScript(instrument, { fps: FPS, S, SLIDE_HEIGHT });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return { ctx, page, cdp, errors };
}

async function cost(cdp) {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return { layoutMs: m.LayoutDuration * 1000, styleMs: m.RecalcStyleDuration * 1000, scriptMs: m.ScriptDuration * 1000 };
}

const now = (page) => page.evaluate(() => performance.now());
const framesSince = (page, t0) => page.evaluate((t0) => window.__rec.frames.filter((f) => f.t >= t0), t0);

// Espera a que ninguna caja se mueva mas de 0,05 px durante 30 frames.
async function waitRest(page, maxMs = 6000) {
  await page.evaluate(() => (window.__rec.recBoxes = true));
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const still = await page.evaluate(() => {
      const fs = window.__rec.frames.slice(-31).filter((f) => f.boxes);
      if (fs.length < 31) return false;
      for (let i = 1; i < fs.length; i++) {
        for (const b of fs[i].boxes) {
          const a = fs[i - 1].boxes.find((x) => x.id === b.id);
          if (a && (Math.abs(a.l - b.l) > 0.05 || Math.abs(a.w - b.w) > 0.05)) return false;
        }
      }
      return true;
    });
    if (still) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

// --- fluidez, pliegue y escrituras (CA1 a CA6, CA9) -------------------------

// Escenarios de rueda: [deltaY, espera en ms] por evento. El fling fuerte y
// la rafaga son los de la linea base del scratchpad (2026-10-22).
const SCENARIOS = [
  { name: "trackpad (60 x 12 px)", boxes: false, steps: Array.from({ length: 60 }, () => [12, 16]) },
  { name: "raton (8 x 100 px)", boxes: false, steps: Array.from({ length: 8 }, () => [100, 120]) },
  { name: "fling fuerte (60 x 50 px)", boxes: true, forward: true, steps: Array.from({ length: 60 }, () => [50, 8]) },
  { name: "rafaga (40 x 30 px)", boxes: true, forward: true, steps: Array.from({ length: 40 }, () => [30, 16]) },
  // Como un trackpad real: un evento de rueda por frame, despachado desde la
  // propia pagina. page.mouse.wheel espera la ida y vuelta de cada evento,
  // asi que el fling fuerte no pasa de ~8,5 px/frame (spec 012, T1).
  { name: "trackpad real (40 x 60 px, uno por frame)", boxes: true, forward: true, perFrame: { events: 40, dy: 60 } },
  { name: "giro brusco (20 x 15 px y 20 x -15 px)", boxes: true, steps: [...Array.from({ length: 20 }, () => [15, 16]), ...Array.from({ length: 20 }, () => [-15, 16])] },
  { name: "paso y paso atras (raton)", boxes: true, steps: [[120, 250], [-120, 16]] },
];

function frameStats(frames) {
  const d = frames.map((f) => f.dt).filter((x) => x > 0).sort((a, b) => a - b);
  const q = (p) => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : 0);
  return { frames: d.length, p50: q(0.5), p95: q(0.95), max: d.length ? d[d.length - 1] : 0, over25: d.filter((x) => x > 25).length, over50: d.filter((x) => x > 50).length };
}

function writeStats(frames) {
  const n = Math.max(1, frames.length);
  const sum = (k) => frames.reduce((s, f) => s + f.changed[k], 0);
  return {
    recordsPerFrame: frames.reduce((s, f) => s + f.records, 0) / n,
    widthPerFrame: sum("width") / n, leftRightPerFrame: (sum("left") + sum("right")) / n,
    filterPerFrame: sum("filter") / n, transformPerFrame: sum("transform") / n,
  };
}

// Pasos de album: el contador es el indice modulo N, asi que cada cambio se
// lleva al paso con signo mas corto.
function albumSteps(frames, total) {
  let fwd = 0, back = 0, prev = null;
  for (const f of frames) {
    const c = Number(f.counter);
    if (!Number.isFinite(c)) continue;
    if (prev !== null && c !== prev) {
      let d = (c - prev) % total;
      if (d > total / 2) d -= total;
      if (d < -total / 2) d += total;
      if (d > 0) fwd += d; else back -= d;
    }
    prev = c;
  }
  return { fwd, back };
}

// Enmienda 1 de la spec 011, solo en escenarios hacia delante (la tira
// avanza hacia la derecha: las diapositivas por delante estan a la derecha
// de la abierta).
// - CA5: ninguna a mas de una posicion por delante de la abierta cambia de
//   ancho (la siguiente, la que se abre, si puede).
// - CA12: la estela (las de detras, a la izquierda) decrece con la
//   distancia: cada una igual o mas estrecha que la anterior, con 0,5 px de
//   margen, en los frames en que hay estela.
// Spec 012, en escenarios hacia delante:
// - cuantas diapositivas distintas pasan de la mitad de su apertura, y a que
//   velocidad de la tira lo hicieron (CA1, CA2);
// - del ultimo cruce de la velocidad hacia abajo (de mas de FAST_PX a menos
//   de SLOW_PX) a la primera apertura de la que queda abierta, y al ultimo
//   cambio de album (CA3);
// - el encaje: borde derecho de la abierta en reposo frente a la linea fija,
//   y album final frente al del cruce (CA3b).
// La velocidad de la tira sale de una diapositiva a dos o mas posiciones por
// delante de la abierta: esas no cambian de ancho, asi que se mueven con la
// tira (incluye restOffsetPx y el encaje, que tambien mueven la tira).
let lineCache;
function anchorLine() {
  if (lineCache !== undefined) return lineCache;
  try {
    const ref = JSON.parse(readFileSync(GEOM_REF, "utf8")).states["ArrowRight 1"].slides;
    const open = ref.reduce((a, b) => (b.w > a.w ? b : a));
    lineCache = open.l + open.w;
  } catch { lineCache = null; }
  return lineCache;
}
function stopStats(frames, total) {
  const rec = frames.filter((f) => f.boxes);
  const speed = new Array(rec.length).fill(null);
  for (let i = 1; i < rec.length; i++) {
    const bs = [...rec[i].boxes].sort((a, b) => a.l - b.l);
    const k = bs.reduce((best, b, j) => (b.w > bs[best].w ? j : best), 0);
    // Mediana de todas las de delante presentes en los dos frames: una sola
    // daba picos de 77 px/frame en los cambios de album.
    const moves = bs.slice(k + 2)
      .map((b) => { const a = rec[i - 1].boxes.find((x) => x.id === b.id); return a ? Math.abs(b.l - a.l) : null; })
      .filter((v) => v !== null);
    if (moves.length) speed[i] = (median(moves) * (1000 / 60)) / Math.max(1, rec[i].t - rec[i - 1].t);
  }
  const half = new Map();
  rec.forEach((f, i) => f.boxes.forEach((b) => {
    if (!half.has(b.id) && b.w - S > 0.5 * (b.nat - S)) half.set(b.id, speed[i]);
  }));
  const halfFast = [...half.values()].filter((v) => v !== null && v > FAST_PX).length;
  // Ultimo cruce hacia abajo.
  let wasFast = false, cross = -1;
  for (let i = 0; i < rec.length; i++) {
    if (speed[i] === null) continue;
    if (speed[i] > FAST_PX) wasFast = true;
    else if (wasFast && speed[i] < SLOW_PX) { cross = i; wasFast = false; }
  }
  const last = rec[rec.length - 1];
  const finalOpen = last ? last.boxes.reduce((a, b) => (b.w > a.w ? b : a)) : null;
  let toOpen = null, toCommit = null, finalVsCross = null;
  if (cross >= 0 && finalOpen) {
    for (let i = cross; i < rec.length; i++) {
      const b = rec[i].boxes.find((x) => x.id === finalOpen.id);
      const prev = rec[i - 1]?.boxes.find((x) => x.id === finalOpen.id);
      if (b && prev && b.w > prev.w + 0.05) { toOpen = rec[i].t - rec[cross].t; break; }
      if (b && b.w >= b.nat - EPS) { toOpen = 0; break; }
    }
    for (let i = rec.length - 1; i > cross; i--) {
      if (rec[i].counter !== rec[i - 1].counter) { toCommit = rec[i].t - rec[cross].t; break; }
    }
    let d = (Number(last.counter) - Number(rec[cross].counter)) % total;
    if (d > total / 2) d -= total;
    if (d < -total / 2) d += total;
    finalVsCross = d;
  }
  const line = anchorLine();
  const sp = speed.filter((v) => v !== null).sort((a, b) => a - b);
  return {
    speedMax: sp.length ? sp[sp.length - 1] : 0, speedP90: sp.length ? sp[Math.floor(0.9 * (sp.length - 1))] : 0,
    halfCount: half.size, halfFast, crossed: cross >= 0 ? 1 : 0,
    toOpen, toCommit, finalVsCross,
    edgeOff: line !== null && finalOpen ? finalOpen.r - line : null,
  };
}

function trailStats(frames) {
  let aheadFrames = 0, aheadMax = 0, trailFrames = 0, trailBad = 0, trailMaxPx = 0;
  for (const f of frames.filter((x) => x.boxes)) {
    const bs = [...f.boxes].sort((a, b) => a.l - b.l);
    const k = bs.findIndex((b) => b.a);
    if (k < 0) continue;
    const ahead = bs.slice(k + 2);
    const dev = Math.max(0, ...ahead.map((b) => Math.abs(b.w - S)));
    if (dev > EPS) aheadFrames++;
    aheadMax = Math.max(aheadMax, dev);
    const behind = bs.slice(0, k).reverse();
    if (behind.some((b) => b.w > S + EPS)) {
      trailFrames++;
      trailMaxPx = Math.max(trailMaxPx, ...behind.map((b) => b.w - S));
      for (let i = 1; i < behind.length; i++) {
        if (behind[i].w > behind[i - 1].w + EPS) { trailBad++; break; }
      }
    }
  }
  return { aheadFrames, aheadMax, trailFrames, trailBad, trailMaxPx };
}

function foldStats(frames) {
  const rec = frames.filter((f) => f.boxes);
  const counts = rec.map((f) => f.boxes.filter((b) => Math.abs(b.w - S) > EPS && Math.abs(b.w - b.nat) > EPS).length);
  const hist = {};
  counts.forEach((c) => (hist[c] = (hist[c] || 0) + 1));
  // Salto: movimiento de un borde en un frame menos la mediana de su
  // movimiento en los 6 frames vecinos. El movimiento se lleva a px por
  // 16,67 ms: un frame perdido dobla el movimiento sin ser un salto de la
  // geometria (eso ya lo cuentan los frames >25 ms). Es la mediana de verdad:
  // el script del scratchpad de la linea base tomaba el elemento 3 de 6
  // ordenados, y el mismo salto le daba 59 px en lugar de 38.
  const at = (i, id) => rec[i]?.boxes.find((x) => x.id === id);
  const mv = (i, id, edge) => {
    const a = at(i - 1, id), b = at(i, id);
    return a && b ? ((b[edge] - a[edge]) * (1000 / 60)) / Math.max(1, rec[i].t - rec[i - 1].t) : null;
  };
  let worst = { d: 0, i: -1, id: -1 };
  for (let i = 1; i < rec.length; i++) {
    for (const b of rec[i].boxes) for (const edge of ["l", "r"]) {
      const m = mv(i, b.id, edge);
      if (m === null) continue;
      const around = [-3, -2, -1, 1, 2, 3].map((k) => mv(i + k, b.id, edge)).filter((x) => x !== null);
      const j = Math.abs(m - (around.length ? median(around) : 0));
      if (j > worst.d) worst = { d: j, i, id: b.id };
    }
  }
  // Ultimo frame en que algo se movio mas de 0,5 px.
  let lastMove = null;
  for (let i = 1; i < rec.length; i++) {
    if (rec[i].boxes.some((b) => { const a = at(i - 1, b.id); return a && (Math.abs(a.l - b.l) > EPS || Math.abs(a.w - b.w) > EPS); })) lastMove = rec[i].t;
  }
  const trace = [];
  if (worst.i > 0) {
    for (let i = Math.max(1, worst.i - 3); i <= Math.min(rec.length - 1, worst.i + 3); i++) {
      const x = at(i, worst.id);
      if (x) trace.push(`frame ${i}${i === worst.i ? " <<" : ""}: +${Math.round(rec[i].t - rec[i - 1].t)} ms · izq ${x.l.toFixed(1)} der ${x.r.toFixed(1)} ancho ${x.w.toFixed(1)}`);
    }
  }
  return { hist, threePlus: counts.filter((c) => c >= 3).length, maxMid: Math.max(0, ...counts), jump: worst.d, lastMove, trace };
}

async function onePass() {
  const { ctx, page, cdp, errors } = await openPage();
  const out = {};
  const m0 = await cost(cdp);
  await page.goto(`${BASE}/albums`, { waitUntil: "load" });
  const tLoad = await now(page);
  await page.waitForTimeout(2500);
  const m1 = await cost(cdp);
  const arrival = (await framesSince(page, tLoad)).filter((f) => f.t <= tLoad + 2500);
  const lt = await page.evaluate((t) => window.__rec.lt.filter(([s]) => s >= t), tLoad);
  const covers = await page.evaluate(() => {
    const m = [...document.querySelectorAll("main")].find((x) => getComputedStyle(x).display !== "none");
    const imgs = [...(m?.querySelectorAll("img") ?? [])];
    const onScreen = imgs.filter((i) => { const r = i.parentElement.getBoundingClientRect(); return r.right > 0 && r.left < innerWidth; });
    return { total: imgs.length, onScreen: onScreen.length, loaded: onScreen.filter((i) => i.complete && i.naturalWidth > 0).length, lazy: onScreen.filter((i) => i.loading === "lazy").length };
  });
  const total = await page.evaluate(() => Number(document.querySelector("main .tabular-nums span:last-child")?.textContent) || 0);
  out.llegada = { ...frameStats(arrival), styleMs: m1.styleMs - m0.styleMs, layoutMs: m1.layoutMs - m0.layoutMs, ltCount: lt.length, ltMax: Math.max(0, ...lt.map(([, d]) => d)), covers };
  await waitRest(page);

  // Reposo: escrituras de style en 1 s sin entrada.
  await page.evaluate(() => (window.__rec.recBoxes = false));
  let t0 = await now(page);
  await page.waitForTimeout(1000);
  const quiet = await framesSince(page, t0);
  out.reposo = { ...writeStats(quiet), targets: [...new Set(quiet.flatMap((f) => f.targets))].join(", ") || "ninguno" };

  await page.mouse.move(720, 450);
  for (const sc of SCENARIOS) {
    await waitRest(page);
    await page.evaluate((b) => (window.__rec.recBoxes = b), sc.boxes);
    const a = await cost(cdp);
    t0 = await now(page);
    if (sc.perFrame) {
      await page.evaluate(({ events, dy }) => new Promise((done) => {
        let n = 0;
        const fire = () => {
          // El elemento bajo el centro se busca en cada evento: el enlace de
          // la abierta desaparece del DOM en cada cambio de album, y un evento
          // despachado sobre un nodo suelto no llega al carrusel.
          document.elementFromPoint(innerWidth / 2, innerHeight / 2).dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true }));
          if (++n < events) requestAnimationFrame(fire); else done();
        };
        requestAnimationFrame(fire);
      }), sc.perFrame);
    } else {
      for (const [dy, wait] of sc.steps) { await page.mouse.wheel(0, dy); await page.waitForTimeout(wait); }
    }
    const tInput = await now(page);
    await page.waitForTimeout(sc.boxes ? 2500 : 1500);
    const b = await cost(cdp);
    const fs = await framesSince(page, t0);
    const l = await page.evaluate((t) => window.__rec.lt.filter(([s]) => s >= t), t0);
    const st = frameStats(fs);
    const r = { ...st, stylePerFrame: (b.styleMs - a.styleMs) / Math.max(1, st.frames), layoutPerFrame: (b.layoutMs - a.layoutMs) / Math.max(1, st.frames), ltCount: l.length, ...writeStats(fs), ...albumSteps(fs, total) };
    if (sc.boxes) {
      const fo = foldStats(fs);
      if (sc.forward) Object.assign(r, trailStats(fs), stopStats(fs, total));
      Object.assign(r, { hist: fo.hist, threePlus: fo.threePlus, maxMid: fo.maxMid, jump: fo.jump, restMs: fo.lastMove === null ? 0 : Math.max(0, fo.lastMove - tInput), trace: fo.trace });
    }
    out[sc.name] = r;
  }
  out.errors = errors;
  await ctx.close();
  return out;
}

async function fluidity() {
  const passes = [];
  for (let k = 0; k < reps; k++) passes.push(await onePass());
  // Mediana de cada cifra numerica entre pasadas; lo demas, de la primera.
  const med = (key) => {
    const first = passes[0][key];
    const o = {};
    for (const [k, v] of Object.entries(first)) o[k] = typeof v === "number" ? median(passes.map((p) => p[key][k])) : v;
    return o;
  };
  const errors = passes.flatMap((p) => p.errors);
  const tag = reps > 1 ? ` (mediana de ${reps})` : "";

  const L = med("llegada");
  rule(`llegada a /albums: load -> +2,5 s${tag}`);
  log(`  frames ${L.frames} · p50 ${r1(L.p50)} ms · p95 ${r1(L.p95)} ms · max ${Math.round(L.max)} ms · >25 ms ${L.over25} · >50 ms ${L.over50}`);
  log(`  estilo ${r1(L.styleMs)} ms · layout ${r1(L.layoutMs)} ms desde la navegacion · long tasks ${L.ltCount}, max ${Math.round(L.ltMax)} ms`);
  log(`  portadas: ${L.covers.total} <img>, ${L.covers.onScreen} en pantalla, ${L.covers.loaded} de ellas cargadas a +2,5 s, ${L.covers.lazy} lazy`);

  const R = med("reposo");
  rule(`reposo: 1 s sin entrada${tag}`);
  log(`  mutaciones de style por frame ${r1(R.recordsPerFrame)} · width ${r1(R.widthPerFrame)} · left/right ${r1(R.leftRightPerFrame)} · filter ${r1(R.filterPerFrame)} · transform ${r1(R.transformPerFrame)}`);
  log(`  elementos mutados: ${R.targets}`);

  for (const sc of SCENARIOS) {
    const x = med(sc.name);
    rule(`${sc.name}${tag}`);
    log(`  fluidez: frames ${x.frames} · p50 ${r1(x.p50)} ms · p95 ${r1(x.p95)} ms · max ${Math.round(x.max)} ms · >25 ms ${x.over25} · >50 ms ${x.over50} · long tasks ${x.ltCount}`);
    // La cadencia de un Chromium headless varia mucho de una pasada a otra:
    // la mediana sola esconde una pasada mala.
    if (reps > 1) log(`  peor pasada: p95 ${r1(Math.max(...passes.map((p) => p[sc.name].p95)))} ms · >25 ms ${Math.max(...passes.map((p) => p[sc.name].over25))} · >50 ms ${Math.max(...passes.map((p) => p[sc.name].over50))}`);
    log(`  coste por frame: estilo ${(x.stylePerFrame).toFixed(2)} ms · layout ${(x.layoutPerFrame).toFixed(2)} ms`);
    log(`  escrituras por frame: mutaciones ${r1(x.recordsPerFrame)} · width ${r1(x.widthPerFrame)} · left/right ${r1(x.leftRightPerFrame)} · filter ${r1(x.filterPerFrame)} · transform ${r1(x.transformPerFrame)}`);
    log(`  albumes: ${x.fwd} adelante, ${x.back} atras`);
    if (sc.boxes) {
      if (sc.forward) {
        log(`  CA5, por delante de la que se abre: ${x.aheadFrames} frames con un ancho distinto de ${S} px (max ${r1(x.aheadMax)} px)`);
        log(`  spec 012, velocidad de la tira: max ${r1(x.speedMax)} px/frame · p90 ${r1(x.speedP90)}`);
        log(`  spec 012: ${x.halfCount} diapositivas pasan de la mitad de su apertura, ${x.halfFast} con la tira a mas de ${FAST_PX} px/frame`);
        if (x.crossed) {
          const ms = (v) => (v === null ? "—" : `${Math.round(v)} ms`);
          log(`  spec 012, al frenar: apertura a ${ms(x.toOpen)} del cruce · ultimo cambio de album a ${ms(x.toCommit)} · album final ${x.finalVsCross >= 0 ? "+" : ""}${x.finalVsCross} frente al del cruce`);
        } else log(`  spec 012, al frenar: la tira no paso de ${FAST_PX} px/frame`);
        if (x.edgeOff !== null) log(`  spec 012, encaje: borde derecho de la abierta a ${r1(x.edgeOff)} px de su linea`);
        log(`  CA12, estela: en ${x.trailFrames} frames, ${x.trailBad} no decrecen con la distancia · ancho extra max ${Math.round(x.trailMaxPx)} px`);
      }
      log(`  a medio plegar por frame: ${Object.entries(x.hist).map(([k, v]) => `${k}: ${v}`).join(" · ")} · max ${x.maxMid} · frames con 3 o mas: ${x.threePlus}`);
      log(`  salto max de borde (frente a la mediana de sus 6 vecinos): ${r1(x.jump)} px · reposo ${Math.round(x.restMs)} ms despues de la ultima entrada`);
      for (const line of x.trace) log(`    ${line}`);
    }
  }
  rule("errores de consola");
  log(errors.length ? errors.map((e) => `  ${e}`).join("\n") : "  0");
  if (errors.length) code = 1;
}

// --- geometria en reposo (CA7, CA8) -------------------------------------------

async function snapshot(page) {
  return page.evaluate(() => {
    const m = [...document.querySelectorAll("main")].find((x) => getComputedStyle(x).display !== "none");
    const tagged = m.querySelectorAll("[data-carousel-slide]");
    const els = [...(tagged.length ? tagged : m.querySelectorAll("div.absolute.isolate.overflow-hidden"))];
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      counter: m.querySelector(".tabular-nums span")?.textContent ?? null,
      slides: els.map((el) => {
        const r = el.getBoundingClientRect();
        const img = el.querySelector("img");
        const ir = img.getBoundingClientRect();
        // Recorte: que franja de la imagen se ve, en px desde su borde izquierdo.
        return { src: img.getAttribute("src"), l: r2(r.left), w: r2(r.width), cropL: r2(r.left - ir.left), cropR: r2(r.right - ir.left) };
      }).filter((s) => s.l + s.w > 0 && s.l < innerWidth).sort((a, b) => a.l - b.l),
    };
  });
}

async function geometry() {
  const { ctx, page, errors } = await openPage();
  await page.goto(`${BASE}/albums`, { waitUntil: "load" });
  await page.waitForTimeout(SETTLE_MS);
  const states = {};
  const rest = async (label, t0 = null) => {
    const ok = await waitRest(page);
    // Tiempo hasta el reposo: ultimo frame en que algo se movio mas de 0,5 px
    // por 16,67 ms desde la tecla (por tiempo: a 120 fps cada frame mueve la
    // mitad, y sin normalizar pasaria el umbral antes).
    const ms = t0 === null ? null : await page.evaluate(({ t0, EPS }) => {
      const fs = window.__rec.frames.filter((f) => f.t >= t0 && f.boxes);
      let lastMove = t0;
      for (let i = 1; i < fs.length; i++) {
        const k = (1000 / 60) / Math.max(1, fs[i].t - fs[i - 1].t);
        if (fs[i].boxes.some((b) => { const a = fs[i - 1].boxes.find((x) => x.id === b.id); return a && (Math.abs(a.l - b.l) * k > EPS || Math.abs(a.w - b.w) * k > EPS); })) lastMove = fs[i].t;
      }
      return lastMove - t0;
    }, { t0, EPS });
    states[label] = { ...(await snapshot(page)), quieto: ok, msHastaReposo: ms === null ? null : Math.round(ms) };
  };
  await rest("llegada");
  for (const [label, key] of [["ArrowRight 1", "ArrowRight"], ["ArrowRight 2", "ArrowRight"], ["ArrowLeft 1", "ArrowLeft"], ["ArrowLeft 2", "ArrowLeft"]]) {
    const t0 = await now(page);
    await page.keyboard.press(key);
    await page.waitForTimeout(300);
    await rest(label, t0);
  }
  await ctx.close();
  writeFileSync(geomOut, JSON.stringify({ base: BASE, fps: FPS, cpu: CPU, head: git.head, states }, null, 2));
  rule(`geometria en reposo · ${FPS} fps`);
  for (const [label, s] of Object.entries(states)) {
    log(`  ${label}: contador ${s.counter} · ${s.slides.length} diapositivas en pantalla${s.msHastaReposo === null ? "" : ` · reposo a ${s.msHastaReposo} ms`}${s.quieto ? "" : " · NO SE QUEDO QUIETO en 6 s"}`);
  }
  log(`  guardado en ${geomOut}`);
  if (errors.length) { log(`  errores de consola: ${errors.join(" | ")}`); code = 1; }

  if (geomRef) {
    const ref = JSON.parse(readFileSync(geomRef, "utf8")).states;
    rule(`comparacion con ${geomRef}`);
    let worst = 0;
    for (const [label, s] of Object.entries(states)) {
      const r = ref[label];
      if (!r) { log(`  ${label}: falta en la referencia`); code = 1; continue; }
      if (r.counter !== s.counter || r.slides.length !== s.slides.length) {
        log(`  ${label}: FALLA · contador ${r.counter} -> ${s.counter}, diapositivas ${r.slides.length} -> ${s.slides.length}`);
        code = 1;
        continue;
      }
      let d = 0;
      s.slides.forEach((x, i) => {
        const y = r.slides[i];
        if (x.src !== y.src) d = Infinity;
        else d = Math.max(d, ...["l", "w", "cropL", "cropR"].map((k) => Math.abs(x[k] - y[k])));
      });
      worst = Math.max(worst, d);
      log(`  ${label}: ${d <= 1 ? "ok  " : "FALLA"} diferencia max ${d === Infinity ? "otra portada" : `${r1(d)} px`}`);
    }
    if (worst > 1) code = 1;
  }
}

// --- trace de la llegada (CA2) ------------------------------------------------

async function trace() {
  mkdirSync(traceDir, { recursive: true });
  const { ctx, page } = await openPage();
  const path = join(traceDir, `carrusel-llegada-${Date.now()}.json`);
  await browser.startTracing(page, {
    path,
    categories: ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "v8.execute", "blink.user_timing", "loading"],
  });
  await page.goto(`${BASE}/albums`, { waitUntil: "load" });
  const tLoad = await now(page);
  await page.waitForTimeout(2500);
  await browser.stopTracing();
  const frames = (await framesSince(page, 0)).filter((f) => f.t <= tLoad + 2500);
  await ctx.close();

  const worst = frames.reduce((w, f) => (f.dt > w.dt ? f : w), { dt: 0, t: 0 });
  rule("trace de la llegada");
  log(`  frame mas largo: ${Math.round(worst.dt)} ms, termina a ${Math.round(worst.t)} ms (load a ${Math.round(tLoad)} ms)`);
  log(`  trace: ${path}`);
  // Eventos completos del hilo principal del renderer que solapan ese frame,
  // por duracion. El origen de tiempos del trace no es performance.now: se
  // alinea con la marca de navegacion del documento.
  const ev = JSON.parse(readFileSync(path, "utf8")).traceEvents;
  const nav = ev.find((e) => e.name === "navigationStart" && e.args?.data?.isLoadingMainFrame && e.args?.data?.documentLoaderURL?.includes("/albums"));
  if (!nav) { log("  sin navigationStart de /albums en el trace: no se puede alinear"); return; }
  const a = nav.ts + (worst.t - worst.dt) * 1000, b = nav.ts + worst.t * 1000;
  const main = ev.filter((e) => e.pid === nav.pid && e.tid === nav.tid && e.ph === "X" && e.dur > 1000 && e.ts < b && e.ts + e.dur > a);
  main.sort((x, y) => y.dur - x.dur);
  for (const e of main.slice(0, 20)) {
    const d = e.args?.data ?? {};
    const where = d.url ? ` · ${String(d.url).split("/").pop()}${d.lineNumber ? `:${d.lineNumber}` : ""}` : d.functionName ? ` · ${d.functionName}` : d.type ? ` · ${d.type}` : "";
    log(`  ${String(Math.round(e.dur / 1000)).padStart(4)} ms  ${e.name}${where}`);
  }
}

await main();
process.exit(code);

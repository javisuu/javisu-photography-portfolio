#!/usr/bin/env node
// Perfil del frame del arranque del landing (spec 006). Mide; no arregla nada.
//   node scripts/perfil-arranque.mjs --url https://x.vercel.app
//                                    contra una web desplegada
//   node scripts/perfil-arranque.mjs --local-prod
//                                    next build --no-mangling + next start
//                                    en :3102 (nombres de funcion legibles,
//                                    sin tocar next.config.ts)
//   --repeticiones N                 N pares de cargas (sin trace / con trace),
//                                    cada una con la cache vacia
//   --trace-dir <carpeta>            donde se guardan los traces crudos
//                                    (por defecto, el temporal del sistema)
// El "frame del arranque" es el intervalo entre dos requestAnimationFrame que
// contiene [entrance] start (src/motion/LandingComposition.tsx:429), el mismo
// que mide scripts/diagnostico.mjs en "entrada /". Las marcas
// performance.mark las pone este harness, no el sitio.
// Requiere: npm i -D playwright && npx playwright install chromium
import { spawn, execSync } from "node:child_process";
import { readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 3102;
const MAX_MS = 15000;
const AFTER_START_MS = 1500;
const TOP_N = 10;
const INFLATE_WARN = 0.3;

// Nombres de evento vistos en un trace real de Chromium (Playwright 1.64),
// tarea T2 de la spec 006. Lo que no esta aqui cae en "otros".
const CATS = [
  ["parse/compilacion", /^(v8\.compile|v8\.parseOnBackground|CompileScript|CompileCode|V8\.CompileLazy|v8\.produceCache|v8\.deserializeOnBackground)$/],
  ["ejecucion JS", /^(EvaluateScript|FunctionCall|v8\.callFunction|v8\.run|TimerFire|FireAnimationFrame|EventDispatch|RunMicrotasks|v8\.evaluateModule|V8\.StackGuard|V8\.HandleInterrupts|V8\.BytecodeBudgetInterrupt)$/],
  ["GC", /^(MajorGC|MinorGC|V8\.GC|BlinkGC)/],
  ["estilo/layout", /^(UpdateLayoutTree|RecalculateStyles|Layout|ParseHTML|ParseAuthorStyleSheet|InvalidateLayout|ScheduleStyleRecalculation|HitTest)$/],
  ["pintado/GPU", /^(Paint|PrePaint|Layerize|CompositeLayers|UpdateLayer|UpdateLayerTree|Commit|RasterTask|GPUTask|PaintImage)$/],
  ["decodificacion", /^(Decode Image|ImageDecodeTask|Decode LazyPixelRef)$/],
];
const catOf = (name) => (CATS.find(([, re]) => re.test(name)) || ["otros"])[0];

const pkgCache = new Map();
const r0 = (v) => Math.round(v);
const where = (f) => (f?.url ? `${f.url.split("/").pop()}:${f.line ?? f.lineNumber}:${f.col ?? f.columnNumber}` : "(nativo)");
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const args = process.argv.slice(2);
const val = (k, d = null) => (args.includes(k) ? args[args.indexOf(k) + 1] ?? "" : d);
const urlArg = val("--url");
const localProd = args.includes("--local-prod");
if ((urlArg === null) === !localProd) {
  console.log("Indica una fuente: --url <base> o --local-prod (no las dos)");
  process.exit(2);
}
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
const repsArg = val("--repeticiones", "1");
const reps = /^\d+$/.test(repsArg) ? Number(repsArg) : 0;
if (reps < 1) {
  console.log(`--repeticiones invalido: ${JSON.stringify(repsArg)}. Tiene que ser un entero >= 1`);
  process.exit(2);
}
const traceDir = val("--trace-dir") || join(tmpdir(), "suquia-perfil-arranque");
mkdirSync(traceDir, { recursive: true });

const log = (s = "") => console.log(s);
const rule = (t) => log(`\n=== ${t} ===`);
function sh(cmd) {
  try { return { code: 0, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` }; }
}

let pw;
try { pw = await import("playwright"); }
catch { log("falta playwright: npm i -D playwright && npx playwright install chromium"); process.exit(2); }

// Hijo con su salida guardada y su codigo de salida a la vista: next sale con
// 1 si ve el lockfile de otro next de la carpeta (spec 005).
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

let server = null;
let browser = null;
let code = 0;
try {
  if (localProd) {
    rule(`next build --no-mangling + next start en :${PORT}`);
    if (await fetch(BASE, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)) {
      log(`el puerto ${PORT} ya esta ocupado (servidor huerfano de un run anterior?). Cierralo y repite.`);
      process.exit(2);
    }
    const build = child(["next", "build", "--no-mangling"]);
    while (build.exit === null) await new Promise((r) => setTimeout(r, 500));
    if (build.exit !== 0) { log(`next build salio con ${build.exit}. Su salida:`); log(build.out.slice(-2000)); process.exit(2); }
    log("build ok");
    server = child(["next", "start", "-p", String(PORT)]);
    const t0 = Date.now();
    let ready = false;
    while (!ready && Date.now() - t0 < 60000) {
      if (server.exit !== null) { log(`next start salio (codigo ${server.exit}) antes de responder. Su salida:`); log(server.out.slice(-1500)); process.exit(2); }
      ready = await fetch(BASE, { signal: AbortSignal.timeout(4000) }).then((r) => r.status < 500, () => false);
      if (!ready) await new Promise((r) => setTimeout(r, 1000));
    }
    // process.exit no pasa por el finally: aqui el servidor sigue vivo.
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
      log("Usa el dominio publico de produccion, el que ven los visitantes.");
      process.exit(2);
    }
    log(`ok · http ${r.status}`);
  }

  browser = await pw.chromium.launch();
  const results = [];
  for (let k = 1; k <= reps; k++) {
    const clean = await load(browser, null);
    const tracePath = join(traceDir, `perfil-${Date.now()}-${k}.json`);
    const traced = await load(browser, tracePath);
    if (clean.frame === null || traced.frame === null) {
      log(`repeticion ${k}: no aparecio [entrance] start en ${MAX_MS} ms`);
      code = 2;
      break;
    }
    const a = analyse(JSON.parse(readFileSync(tracePath, "utf8")));
    if (!a) { log(`repeticion ${k}: el trace no trae las marcas del harness`); code = 2; break; }
    await attachPackages(a.top);
    results.push({ clean: clean.frame, traced: traced.frame, a, tracePath });
    report(k, results[results.length - 1]);
  }
  if (results.length > 1) summary(results);
} finally {
  await browser?.close();
  if (server) killTree(server);
}
process.exit(code);

// --- carga y muestreo --------------------------------------------------------

function sampler({ maxMs, afterMs }) {
  const rec = { frames: [], start: null, done: false };
  window.__perfil = rec;
  const orig = console.log;
  console.log = function (...a) {
    if (a[0] === "[entrance] start" && rec.start === null) { rec.start = performance.now(); performance.mark("perfil:start"); }
    return orig.apply(this, a);
  };
  function tick(now) {
    performance.mark("perfil:f");
    rec.frames.push(now);
    if ((rec.start !== null && now - rec.start > afterMs) || now > maxMs) { rec.done = true; return; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function load(browser, tracePath) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(sampler, { maxMs: MAX_MS, afterMs: AFTER_START_MS });
  if (tracePath) {
    await browser.startTracing(page, {
      path: tracePath,
      categories: ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "v8.execute",
        "disabled-by-default-v8.cpu_profiler", "blink.user_timing", "loading"],
    });
  }
  await page.goto(BASE + "/", { waitUntil: "commit" });
  await page.waitForFunction(() => window.__perfil?.done, null, { timeout: MAX_MS + 5000, polling: 250 }).catch(() => {});
  const rec = await page.evaluate(() => window.__perfil);
  if (tracePath) await browser.stopTracing();
  await ctx.close();
  if (!rec || rec.start === null) return { frame: null };
  const before = rec.frames.filter((t) => t <= rec.start).pop();
  const after = rec.frames.find((t) => t > rec.start);
  return { frame: before !== undefined && after !== undefined ? after - before : null };
}

// --- analisis del trace -------------------------------------------------------


function analyse(trace) {
  const ev = trace.traceEvents ?? trace;
  const st = ev.find((e) => e.name === "perfil:start");
  if (!st) return null;
  const fs = ev.filter((e) => e.name === "perfil:f" && e.pid === st.pid && e.tid === st.tid).map((e) => e.ts).sort((x, y) => x - y);
  const a = fs.filter((t) => t <= st.ts).pop();
  const b = fs.find((t) => t > st.ts);
  if (a === undefined || b === undefined) return null;
  const win = (b - a) / 1000;

  // Tiempo propio por categoria: cada evento recortado a la ventana, menos sus
  // hijos directos (anidados por contencion en el mismo hilo).
  const X = ev
    .filter((e) => e.pid === st.pid && e.tid === st.tid && e.ph === "X" && e.dur > 0 && e.ts < b && e.ts + e.dur > a)
    .map((e) => ({ name: e.name, s: Math.max(e.ts, a), e: Math.min(e.ts + e.dur, b) }))
    .sort((x, y) => x.s - y.s || y.e - x.e);
  const byCat = Object.fromEntries([...CATS.map(([c]) => [c, 0]), ["otros", 0]]);
  const byName = {};
  const stack = [];
  let busy = 0;
  const close = (n) => {
    const self = (n.e - n.s - n.kids) / 1000;
    byCat[catOf(n.name)] += self;
    byName[n.name] = (byName[n.name] || 0) + self;
  };
  for (const e of X) {
    while (stack.length && stack[stack.length - 1].e <= e.s) close(stack.pop());
    const parent = stack[stack.length - 1];
    const node = { ...e, kids: 0 };
    if (parent) { node.e = Math.min(node.e, parent.e); parent.kids += node.e - node.s; }
    else busy += node.e - node.s;
    stack.push(node);
  }
  while (stack.length) close(stack.pop());
  byCat["red/espera"] = win - busy / 1000;

  // Top de tiempo propio desde las muestras del perfil de CPU de V8.
  const prof = ev.find((e) => e.name === "Profile" && e.pid === st.pid && e.tid === st.tid);
  const top = [];
  if (prof) {
    const nodes = new Map();
    let t = prof.args.data.startTime;
    const samples = [];
    for (const c of ev.filter((e) => e.name === "ProfileChunk" && e.pid === st.pid && e.id === prof.id)) {
      const d = c.args.data;
      for (const n of d.cpuProfile?.nodes || []) nodes.set(n.id, n);
      const s = d.cpuProfile?.samples || [];
      const dt = d.timeDeltas || [];
      for (let i = 0; i < s.length; i++) { t += dt[i]; samples.push([t, s[i]]); }
    }
    const self = new Map();
    for (let i = 0; i < samples.length - 1; i++) {
      const [ts, id] = samples[i];
      if (ts < a || ts >= b) continue;
      const n = nodes.get(id);
      if (!n) continue;
      const f = n.callFrame;
      // Una funcion nativa (sin url) se identifica tambien por su primer
      // llamador con codigo, que es lo que habria que cambiar.
      let caller = null;
      if (!f.url) {
        let p = nodes.get(n.parent);
        while (p && !p.callFrame.url) p = nodes.get(p.parent);
        if (p) caller = p.callFrame;
      }
      const key = [f.functionName || "(anonima)", f.url, f.lineNumber, f.columnNumber, caller?.functionName, caller?.url, caller?.lineNumber, caller?.columnNumber].join("|");
      const cur = self.get(key) || { fn: f.functionName || "(anonima)", url: f.url, line: f.lineNumber, col: f.columnNumber, caller, ms: 0 };
      cur.ms += (samples[i + 1][0] - ts) / 1000;
      self.set(key, cur);
    }
    top.push(...[...self.values()].sort((x, y) => y.ms - x.ms).slice(0, TOP_N));
  }
  const events = Object.entries(byName).sort((x, y) => y[1] - x[1]).slice(0, 5);
  return { win, byCat, top, events };
}

// Que paquetes contiene cada chunk del top, buscando rutas node_modules/<pkg>
// en su contenido. Si el build no las deja, se dice y no se adivina.
async function attachPackages(top) {
  for (const t of top) {
    for (const url of [t.url, t.caller?.url]) {
      if (!url || pkgCache.has(url)) continue;
      const text = await fetch(url, { signal: AbortSignal.timeout(15000) }).then((r) => r.text(), () => "");
      const counts = {};
      for (const m of text.matchAll(/node_modules\/((?:@[\w.-]+\/)?[\w.-]+)/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
      const pk = Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([p]) => p);
      pkgCache.set(url, pk.length ? pk.slice(0, 3).join(", ") : "paquete desconocido");
    }
  }
}

// --- salida -------------------------------------------------------------------


function report(k, { clean, traced, a, tracePath }) {
  rule(`perfil arranque / · repeticion ${k}`);
  log(`frame del arranque: sin trace ${r0(clean)} ms · con trace ${r0(traced)} ms (ventana del trace ${r0(a.win)} ms)`);
  const infl = clean > 0 ? (traced - clean) / clean : 0;
  if (Math.abs(infl) > INFLATE_WARN) log(`AVISO: el trace cambia el frame un ${r0(infl * 100)} % (mas del ${INFLATE_WARN * 100} %): los ms del reparto valen como proporcion, no como cifra`);
  log("reparto (tiempo propio en el hilo principal):");
  const named = Object.entries(a.byCat).filter(([c]) => c !== "otros").reduce((s, [, v]) => s + v, 0);
  for (const [c, v] of Object.entries(a.byCat).sort((x, y) => y[1] - x[1])) {
    log(`  ${c.padEnd(18)} ${String(r0(v)).padStart(5)} ms  ${String(r0((v / a.win) * 100)).padStart(3)} %`);
  }
  log(`  con nombre: ${r0((named / a.win) * 100)} % del frame${named / a.win < 0.9 ? " · AVISO: menos del 90 %" : ""}`);
  log(`eventos con mas tiempo propio: ${a.events.map(([n, v]) => `${n} ${r0(v)}`).join(" · ")}`);
  log(`top ${TOP_N} por tiempo propio (muestras de CPU de V8):`);
  for (const t of a.top) {
    const pk = t.url ? pkgCache.get(t.url) : t.caller?.url ? pkgCache.get(t.caller.url) : "";
    const via = t.caller ? ` <- ${t.caller.functionName || "(anonima)"} ${where(t.caller)}` : "";
    log(`  ${String(r0(t.ms)).padStart(5)} ms  ${t.fn} ${where(t)}${via}${pk ? `  [${pk}]` : ""}`);
  }
  log(`trace: ${tracePath}`);
}

function summary(results) {
  rule(`medianas de ${results.length}`);
  log(`frame del arranque: sin trace ${r0(median(results.map((r) => r.clean)))} ms · con trace ${r0(median(results.map((r) => r.traced)))} ms`);
  const cats = Object.keys(results[0].a.byCat);
  for (const c of cats) {
    const v = median(results.map((r) => r.a.byCat[c]));
    const p = median(results.map((r) => (r.a.byCat[c] / r.a.win) * 100));
    log(`  ${c.padEnd(18)} ${String(r0(v)).padStart(5)} ms  ${String(r0(p)).padStart(3)} %`);
  }
}

#!/usr/bin/env node
// Diagnostico del sitio. Mide; no arregla nada.
//   node scripts/diagnostico.mjs                 run completo
//   node scripts/diagnostico.mjs --skip-build     sin next build (mas rapido)
//   node scripts/diagnostico.mjs --medir /atlas   solo mide una ruta
//   node scripts/diagnostico.mjs --url https://x.vercel.app
//                                                 mide una web desplegada: sin
//                                                 tsc/lint/build ni next dev
//   --repeticiones N                              mide la entrada del landing N
//                                                 veces, con la cache vacia
// Requiere: npm i -D playwright && npx playwright install chromium

import { spawn, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const PORT = 3100;
// localhost, no 127.0.0.1: next dev solo admite los origenes localhost y
// **.localhost para /_next/* y responde 403 a los chunks JS pedidos desde
// cualquier otro (node_modules/next/dist/server/lib/router-utils/
// block-cross-site-dev.js), con lo que el cliente nunca se hidrata.
const SETTLE_MS = 3500;
const args = process.argv.slice(2);
// --url: una web ya desplegada. Se valida antes de abrir nada.
const urlArg = args.includes("--url") ? args[args.indexOf("--url") + 1] ?? "" : null;
let remote = null;
if (urlArg !== null) {
  try {
    const u = new URL(urlArg);
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocolo");
    remote = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    console.log(`URL invalida: ${JSON.stringify(urlArg)}. Ejemplo: --url https://dominio.vercel.app`);
    process.exit(2);
  }
}
const BASE = remote ?? `http://localhost:${PORT}`;
const repsArg = args.includes("--repeticiones") ? args[args.indexOf("--repeticiones") + 1] ?? "" : "1";
const reps = /^\d+$/.test(repsArg) ? Number(repsArg) : 0;
if (reps < 1) {
  console.log(`--repeticiones invalido: ${JSON.stringify(repsArg)}. Tiene que ser un entero >= 1`);
  process.exit(2);
}
const only = args.includes("--medir") ? args[args.indexOf("--medir") + 1] || "/" : null;
// Git Bash convierte "/atlas" en "C:/Program Files/Git/atlas" antes de que
// llegue aqui; mediriamos una ruta inexistente sin enterarnos.
if (only && !only.startsWith("/")) {
  console.log(`ruta invalida: ${JSON.stringify(only)}. En Git Bash: MSYS_NO_PATHCONV=1 node scripts/diagnostico.mjs --medir /ruta`);
  process.exit(2);
}
const skipBuild = args.includes("--skip-build") || !!only;
// tsc/lint/build miden el arbol local: con --url no dicen nada de lo desplegado.
const skipStatic = !!only || !!remote;

const out = [];
const log = (s = "") => { out.push(s); console.log(s); };
const rule = (t) => log(`\n=== ${t} ===`);

function sh(cmd) {
  try { return { code: 0, out: execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` }; }
}

const git = {
  branch: sh("git branch --show-current").out.trim(),
  head: sh("git rev-parse --short HEAD").out.trim(),
  dirty: sh("git status --short").out.trim().split("\n").filter(Boolean).length,
};

log(`DIAGNOSTICO ${new Date().toISOString().slice(0, 10)} · ${git.branch} · ${git.head} · ${git.dirty} ficheros sin commit`);
if (remote) log(`contra ${BASE}`);

const results = { tsc: null, lint: null, build: null, console: {}, invariants: [], entrance: [] };

// ---------- estatico ----------
if (remote) {
  for (const t of ["tsc --noEmit", "eslint", "next build"]) { rule(t); log("omitido (--url)"); }
  results.build = "omitido";
}
if (!skipStatic) {
  rule("tsc --noEmit");
  const r = sh("npx tsc --noEmit");
  const errs = (r.out.match(/error TS\d+/g) || []).length;
  results.tsc = errs;
  log(errs ? r.out.trim() : "ok");

  rule("eslint");
  const l = sh("npx eslint src --max-warnings=0");
  const m = l.out.match(/(\d+) errors?, (\d+) warnings?/) || l.out.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
  results.lint = m ? l.out.trim() : (l.code === 0 ? "ok" : l.out.trim());
  log(typeof results.lint === "string" ? results.lint || "ok" : "ok");

  if (!skipBuild) {
    rule("next build");
    const b = sh("npx next build");
    results.build = b.code === 0 ? "ok" : "falla";
    log(b.code === 0 ? "ok" : b.out.trim().slice(-3000));
  } else {
    rule("next build"); log("omitido (--skip-build)"); results.build = "omitido";
  }
}

// ---------- navegador ----------
let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  log("\nFALTA PLAYWRIGHT. Instala con:");
  log("  npm i -D playwright && npx playwright install chromium");
  process.exit(2);
}

let killDev = () => {};
if (remote) {
  rule("servidor remoto");
  // La Deployment Protection de Vercel redirige a vercel.com/login, que
  // responde 200: sin comparar el origen final mediriamos su pagina de login,
  // no el sitio (paso el 2026-10-18 con una URL de despliegue). Un 401/403
  // directo es lo mismo.
  const r = await fetch(BASE, { signal: AbortSignal.timeout(15000) }).catch((e) => ({ error: e.message }));
  if (r.error || r.status >= 400) {
    log(`${BASE} no responde bien: ${r.error ?? `http ${r.status}`}`);
    process.exit(2);
  }
  if (new URL(r.url).origin !== new URL(BASE).origin) {
    log(`${BASE} redirige a otro origen (${new URL(r.url).origin}): seguramente esta protegido con login.`);
    log("Usa el dominio publico de produccion, el que ven los visitantes.");
    process.exit(2);
  }
  log(`ok · http ${r.status}`);
} else {
  rule(`next dev en :${PORT}`);
  // Un servidor que ya escucha en el puerto es un huerfano de un run anterior:
  // mediriamos contra el, no contra el que arrancamos.
  if (await fetch(BASE, { signal: AbortSignal.timeout(2000) }).then(() => true, () => false)) {
    log(`el puerto ${PORT} ya esta ocupado (servidor huerfano de un run anterior?). Cierralo y repite.`);
    process.exit(2);
  }
  const dev = spawn("npx", ["next", "dev", "-p", String(PORT)], { shell: true, stdio: ["ignore", "pipe", "pipe"] });
  let devLog = "";
  dev.stdout.on("data", (d) => { devLog += d; });
  dev.stderr.on("data", (d) => { devLog += d; });
  // next dev sale con 1 en cuanto ve el lockfile de otro next dev de la
  // carpeta (node_modules/next/dist/build/lockfile.js:166-211). Sin esto,
  // esperariamos los 90 s enteros a un proceso que ya no existe.
  let devExit = null;
  dev.once("exit", (code) => { devExit = code ?? "senal"; });
  // Con shell:true, dev.kill() en Windows mata solo la shell y deja next dev
  // vivo en el puerto; hay que matar el arbol entero.
  killDev = () => (process.platform === "win32" ? sh(`taskkill /PID ${dev.pid} /T /F`) : dev.kill("SIGTERM"));

  async function waitForServer(ms = 90000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (devExit !== null) return "exit";
      try { const r = await fetch(BASE, { signal: AbortSignal.timeout(4000) }); if (r.ok || r.status < 500) return "ok"; }
      catch { /* todavia no */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return "timeout";
  }
  const ready = await waitForServer();
  if (ready === "exit") { log(`next dev salio (codigo ${devExit}) antes de responder. Su salida:`); log(devLog.slice(-1500)); process.exit(2); }
  if (ready === "timeout") { log("el servidor de desarrollo no respondio en 90 s"); log(devLog.slice(-1500)); killDev(); process.exit(2); }
  log("ok");
}

const IGNORE = [/_next\/hmr/i, /websocket/i, /favicon/i, /Download the React DevTools/i, /npm notice/i];
const noise = (t) => IGNORE.some((re) => re.test(t));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const msgs = [];
page.on("console", (m) => {
  if (!["error", "warning"].includes(m.type()) || noise(m.text())) return;
  // El listener de "response" ya cuenta ese fallo, con su URL.
  if (m.text().startsWith("Failed to load resource")) return;
  const url = m.location()?.url;
  msgs.push({ type: m.type(), text: url ? `${m.text()} · ${url}` : m.text() });
});
page.on("pageerror", (e) => msgs.push({ type: "error", text: `pageerror: ${e.message}` }));
// Un "Failed to load resource" de consola no dice que recurso fallo; la respuesta si.
page.on("response", (r) => {
  if (r.status() >= 400 && !noise(r.url())) msgs.push({ type: "error", text: `[http ${r.status()}] ${r.url()}` });
});

// rutas
let routes = only ? [only] : ["/", "/albums", "/about", "/credits", "/atlas"];
if (!only) {
  await page.goto(`${BASE}/albums`, { waitUntil: "domcontentloaded" }).catch(() => {});
  const slug = await page.evaluate(() => {
    const a = document.querySelector('a[href^="/album/"]');
    return a ? a.getAttribute("href") : null;
  }).catch(() => null);
  if (slug) routes.splice(3, 0, slug);
}

function addInv(route, name, ok, detail) {
  results.invariants.push({ route, name, ok, detail });
  log(`  ${ok ? "ok  " : "FALLA"} ${name}${ok ? "" : ` · ${detail}`}`);
}

for (const route of routes) {
  rule(`ruta ${route}`);
  msgs.length = 0;
  await page.goto(BASE + route, { waitUntil: "load" }).catch((e) => msgs.push({ type: "error", text: `goto: ${e.message}` }));
  await page.waitForTimeout(SETTLE_MS);

  const m = await page.evaluate(() => {
    const vis = (el) => getComputedStyle(el).display !== "none";
    const r = { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio };
    r.mains = document.querySelectorAll("main").length;
    r.visibleMains = [...document.querySelectorAll("main")].filter(vis).length;
    r.scrollWidth = document.documentElement.scrollWidth;
    r.clientWidth = document.documentElement.clientWidth;
    // wordmark + blend
    const blended = [...document.querySelectorAll("*")].find((e) => getComputedStyle(e).mixBlendMode === "difference");
    if (blended) {
      const bad = [];
      let el = blended.parentElement;
      while (el && el !== document.documentElement) {
        const c = getComputedStyle(el);
        const flags = [];
        if (c.transform !== "none") flags.push(`transform:${c.transform}`);
        if (+c.opacity < 1) flags.push(`opacity:${c.opacity}`);
        if (c.filter !== "none") flags.push(`filter:${c.filter}`);
        if (c.perspective !== "none") flags.push(`perspective:${c.perspective}`);
        if (c.isolation === "isolate") flags.push("isolation:isolate");
        if (c.willChange !== "auto") flags.push(`will-change:${c.willChange}`);
        if (flags.length) bad.push(`${el.tagName}.${(el.className || "").toString().slice(0, 30)} → ${flags.join(" ")}`);
        el = el.parentElement;
      }
      r.blendAncestorsBad = bad;
    }
    // El h1 del <main> visible (fuera de / el primero del documento es el del
    // landing oculto). Sin nodos aria-hidden: el pie de hover del wordmark
    // vive dentro del h1 a opacity 0, e innerText no excluye la opacidad.
    const main = [...document.querySelectorAll("main")].filter(vis)[0];
    const h1 = main?.querySelector("h1");
    if (h1) {
      const c = h1.cloneNode(true);
      c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
      r.h1Text = c.textContent.trim().slice(0, 40);
    } else r.h1Text = null;
    // landing
    const lp = [...document.querySelectorAll(".landing-photo")];
    r.landingPhotos = lp.length;
    r.landingHidden = lp.filter((w) => w.firstElementChild && +getComputedStyle(w.firstElementChild).opacity < 1)
                        .map((w, i) => i).length;
    // canvas del <main> visible. Un canvas fijo (GLSurface, position:fixed
    // inset-0) cubre el viewport; uno en flujo (atlas) cubre su propia caja.
    // GLSurface limita el dpr a 2 (GLSurface.tsx:219), el atlas no
    // (Atlas.tsx:505); el harness corre a dpr 1, asi que hoy da igual.
    const cv = main?.querySelector("canvas");
    if (cv) {
      const fixed = getComputedStyle(cv).position === "fixed";
      const d = fixed ? Math.min(devicePixelRatio || 1, 2) : devicePixelRatio || 1;
      const box = fixed ? [innerWidth, innerHeight] : [cv.clientWidth, cv.clientHeight];
      r.canvas = { fixed, buffer: [cv.width, cv.height], css: [cv.clientWidth, cv.clientHeight],
                   expected: box.map((v) => Math.round(v * d)) };
    }
    return r;
  }).catch((e) => ({ evalError: e.message }));

  log(JSON.stringify(m, null, 2));
  results.console[route] = msgs.filter((x) => x.type === "error").length;
  if (msgs.length) { log("  consola:"); msgs.forEach((x) => log(`    [${x.type}] ${x.text}`)); }
  else log("  consola limpia");

  addInv(route, "sin errores de consola", results.console[route] === 0, `${results.console[route]} errores`);
  addInv(route, "un solo <main> visible", m.visibleMains === 1, `visibles: ${m.visibleMains} de ${m.mains}`);
  addInv(route, "sin scroll horizontal", m.scrollWidth <= m.clientWidth + 1, `${m.scrollWidth} > ${m.clientWidth}`);
  if (m.blendAncestorsBad) addInv(route, "blend difference sin ancestros que lo rompan", m.blendAncestorsBad.length === 0, m.blendAncestorsBad.join(" | "));
  if (route === "/") {
    addInv(route, "wordmark dice SUQUIA", m.h1Text === "SUQUIA", `dice: ${JSON.stringify(m.h1Text)}`);
    addInv(route, "ninguna landing-photo invisible en reposo", m.landingHidden === 0, `${m.landingHidden} de ${m.landingPhotos} con opacity < 1`);
  }
  if (m.canvas) {
    const okb = Math.abs(m.canvas.buffer[0] - m.canvas.expected[0]) <= 1 && Math.abs(m.canvas.buffer[1] - m.canvas.expected[1]) <= 1;
    addInv(route, "buffer del canvas = caja * dpr", okb, `buffer ${m.canvas.buffer} vs esperado ${m.canvas.expected}`);
  }
}

// ---------- barra de scroll ----------
// Playwright arranca Chromium headless con --hide-scrollbars: con ese flag
// innerWidth - clientWidth da 0 aunque la pagina pinte barra (spec 009).
// Esta seccion abre su propio navegador sin el flag; las invariantes de
// arriba siguen midiendose como siempre, para no mover su linea base.
// Cada medida de scroll va en un contexto nuevo, con scrollY en 0.
const SCROLL_STEP_PX = 600;
const SCROLL_WAIT_MS = 1000;
const MAX_RATIO_DEVIATION = 0.01;
rule("barra de scroll");
const sbBrowser = await chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] });
async function sbOpen(route, ctxOpts = {}) {
  const ctx = await sbBrowser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...ctxOpts });
  const p = await ctx.newPage();
  await p.goto(BASE + route, { waitUntil: "load" }).catch(() => {});
  await p.waitForTimeout(SETTLE_MS);
  return { ctx, p };
}
async function sbScrolled(route, ctxOpts, act) {
  const { ctx, p } = await sbOpen(route, ctxOpts);
  const before = await p.evaluate(() => scrollY).catch(() => null);
  await act(p);
  await p.waitForTimeout(SCROLL_WAIT_MS);
  const after = await p.evaluate(() => scrollY).catch(() => null);
  await ctx.close();
  return { before, after, ok: before !== null && after !== null && after > before };
}
for (const route of routes) {
  const isAlbum = route.startsWith("/album/");
  const { ctx, p } = await sbOpen(route);
  const m = await p.evaluate(() => {
    const main = [...document.querySelectorAll("main")].filter((el) => getComputedStyle(el).display !== "none")[0];
    const r = { gutter: innerWidth - document.documentElement.clientWidth, scrollHeight: document.documentElement.scrollHeight, vh: innerHeight };
    // Proporcion de la caja frente a la del fichero. Cuenta tambien las
    // <img> ocultas tras GLSurface (visibility: hidden): su caja es la que
    // GLSurface copia para pintar cada plano.
    const devs = [...(main?.querySelectorAll("img") ?? [])]
      .filter((img) => img.naturalWidth > 0 && img.naturalHeight > 0)
      .map((img) => {
        const b = img.getBoundingClientRect();
        if (b.width < 1 || b.height < 1) return null;
        return { src: img.currentSrc.split("/").slice(-1)[0].slice(0, 60), dev: Math.abs(b.width / b.height / (img.naturalWidth / img.naturalHeight) - 1) };
      })
      .filter(Boolean);
    r.photos = devs.length;
    r.worst = devs.sort((a, b) => b.dev - a.dev)[0] ?? null;
    const cv = main?.querySelector("canvas");
    if (cv && getComputedStyle(cv).position === "fixed") {
      const b = cv.getBoundingClientRect();
      r.canvas = { css: [Math.round(b.width), Math.round(b.height)], viewport: [innerWidth, innerHeight] };
    }
    return r;
  }).catch((e) => ({ evalError: e.message }));
  await ctx.close();
  log(`  ${route}: ${JSON.stringify(m)}`);
  addInv(route, "sin barra de scroll", m.gutter === 0, `innerWidth - clientWidth = ${m.gutter}`);
  if (route === "/" || isAlbum) {
    addInv(route, "proporcion de las fotos", m.photos > 0 && m.worst.dev < MAX_RATIO_DEVIATION,
      m.photos ? `${m.photos} fotos, desvio max ${m.worst.dev.toFixed(4)} (${m.worst.src})` : "ninguna foto medida");
    if (m.canvas) addInv(route, "canvas GL = viewport",
      Math.abs(m.canvas.css[0] - m.canvas.viewport[0]) <= 1 && Math.abs(m.canvas.css[1] - m.canvas.viewport[1]) <= 1,
      `caja ${m.canvas.css} vs viewport ${m.canvas.viewport}`);
    const wheel = await sbScrolled(route, {}, async (pg) => { await pg.mouse.move(720, 450); await pg.mouse.wheel(0, SCROLL_STEP_PX); });
    log(`    rueda: scrollY ${wheel.before} -> ${wheel.after}`);
    addInv(route, "scroll con rueda", wheel.ok, `scrollY ${wheel.before} -> ${wheel.after}`);
  }
  if (isAlbum) {
    for (const [label, opts] of [["", {}], [" (reduced motion)", { reducedMotion: "reduce" }]]) {
      const key = await sbScrolled(route, opts, (pg) => pg.keyboard.press("PageDown"));
      log(`    teclado${label}: scrollY ${key.before} -> ${key.after}`);
      addInv(route, `scroll con teclado${label}`, key.ok, `scrollY ${key.before} -> ${key.after}`);
    }
  }
}
await sbBrowser.close();

// ---------- llegada al album ----------
// Spec 013. Al llegar a /album/<slug>, GLSurface oculta las <img> en cuanto
// tiene contexto, antes de tener texturas: el hueco de la foto 1 se veia en
// blanco. El DOM no ve el canvas, asi que se graba la pantalla (screencast) y
// se clasifica cada fotograma por los pixeles del interior de la caja de la
// foto 1: "en blanco" si casi todo es el fondo. A la vez se muestrea por rAF
// la opacity inline de su fila (la que GLSurface lee) y su caja.
const ARRIVAL_WAIT_MS = 3000;
const ARRIVAL_BG = [250, 250, 250];
const ARRIVAL_BG_TOL = 2;
const ARRIVAL_INSET_PX = 8;
// Fraccion de pixeles distintos del fondo por debajo de la cual el fotograma
// cuenta como en blanco (ruido de la compresion JPEG del screencast).
const ARRIVAL_BLANK_MAX_FRACTION = 0.005;
function arrivalSampler() {
  window.__llegada = { samples: [] };
  const tick = () => {
    const main = [...document.querySelectorAll("main")].find((el) => getComputedStyle(el).display !== "none");
    const row = main?.querySelector('[data-photo-index="0"]');
    const img = row?.querySelector("img");
    if (img) {
      const r = img.getBoundingClientRect();
      const op = parseFloat(row.style.opacity);
      window.__llegada.samples.push({
        t: performance.timeOrigin + performance.now(), path: location.pathname,
        op: Number.isFinite(op) ? op : 1, vis: getComputedStyle(img).visibility,
        complete: img.complete && img.naturalWidth > 0,
        box: [r.left, r.top, r.right, r.bottom],
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
if (!only || only.startsWith("/album/")) {
  rule("llegada al album");
  const slugs = [...readFileSync(new URL("../src/data/photos.ts", import.meta.url), "utf8").matchAll(/^\s*slug: "([^"]+)",$/gm)].map((x) => x[1]);
  const direct = only ?? `/album/${slugs[1] ?? slugs[0]}`;
  log(`ms desde el clic (carga directa: desde el inicio de la navegacion) · ${reps} repeticion${reps > 1 ? "es" : ""} · cache vacia en cada una`);
  // Una pagina en blanco del mismo navegador decodifica los fotogramas.
  const decoder = await browser.newPage();
  async function classify(frames, samples, target, t0) {
    const own = samples.filter((s) => s.path === target);
    const out = [];
    for (const f of frames) {
      if (f.t < t0) continue;
      // La muestra de rAF mas reciente anterior al fotograma (o la primera).
      const prev = own.filter((s) => s.t <= f.t).pop();
      if (!prev) continue;
      const res = await decoder.evaluate(async ({ data, box, deviceWidth, vh, bg, tol, inset }) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${data}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const scale = img.width / deviceWidth;
        const x0 = Math.max(0, Math.round((box[0] + inset) * scale)), x1 = Math.min(img.width, Math.round((box[2] - inset) * scale));
        const y0 = Math.max(0, Math.round((box[1] + inset) * scale)), y1 = Math.min(img.height, Math.round((Math.min(box[3], vh) - inset) * scale));
        if (x1 - x0 < 4 || y1 - y0 < 4) return null;
        const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
        let off = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (Math.abs(d[i] - bg[0]) > tol || Math.abs(d[i + 1] - bg[1]) > tol || Math.abs(d[i + 2] - bg[2]) > tol) off++;
        }
        return off / (d.length / 4);
      }, { data: f.data, box: prev.box, deviceWidth: f.deviceWidth, vh: 900, bg: ARRIVAL_BG, tol: ARRIVAL_BG_TOL, inset: ARRIVAL_INSET_PX });
      if (res === null) continue;
      out.push({ t: f.t, blank: res < ARRIVAL_BLANK_MAX_FRACTION, op: prev.op, frac: res });
    }
    return out;
  }
  async function arrivalRun({ kind, reduced = false, noGl = false }) {
    const br = noGl ? await chromium.launch({ args: ["--disable-3d-apis"] }) : browser;
    const ctx = await br.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...(reduced ? { reducedMotion: "reduce" } : {}) });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript(arrivalSampler);
    const cdp = await ctx.newCDPSession(p);
    const frames = [];
    cdp.on("Page.screencastFrame", (f) => {
      frames.push({ t: f.metadata.timestamp * 1000, data: f.data, deviceWidth: f.metadata.deviceWidth });
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    });
    const startCast = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: 1440, maxHeight: 900, everyNthFrame: 1 });
    let target = direct, t0;
    try {
      if (kind === "directa") {
        await p.goto("about:blank");
        await startCast();
        t0 = Date.now();
        await p.goto(BASE + direct, { waitUntil: "commit" });
      } else {
        const start = kind === "carrusel" ? "/albums" : `/album/${slugs[0]}`;
        await p.goto(BASE + start, { waitUntil: "load" });
        await p.waitForTimeout(SETTLE_MS);
        const links = p.locator('main:visible a[href^="/album/"]');
        const link = kind === "carrusel" ? links.first() : links.last();
        target = await link.getAttribute("href");
        if (kind === "next") { await link.scrollIntoViewIfNeeded(); await p.waitForTimeout(800); }
        await startCast();
        t0 = await p.evaluate(() => performance.timeOrigin + performance.now());
        await link.click();
        await p.waitForURL(BASE + target);
      }
    } catch (e) { errs.push(`pasos: ${e.message}`); }
    await p.waitForTimeout(ARRIVAL_WAIT_MS);
    await cdp.send("Page.stopScreencast").catch(() => {});
    const rec = await p.evaluate(() => window.__llegada).catch(() => null);
    const webgl = noGl ? await p.evaluate(() => { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); }).catch(() => null) : null;
    await ctx.close();
    if (noGl) await br.close();
    const samples = (rec?.samples ?? []).filter((s) => s.path === target && s.t >= t0);
    const cls = t0 === undefined ? [] : await classify(frames, samples, target, t0);
    return { target, t0, samples, cls, errs, webgl };
  }
  function report(label, r, route) {
    const rel = (t) => (t === undefined ? "—" : Math.round(t - r.t0));
    const gaps = r.cls.filter((f) => f.blank && f.op >= 1);
    const firstPhoto = r.cls.findIndex((f) => !f.blank);
    // Parpadeo: la foto se vio y despues su hueco quedo en blanco con la
    // fila a opacity 1. Un blanco con la fila transparente es el fundido de
    // entrada, no un parpadeo. Al venir del carrusel o de NEXT ALBUM, el
    // primer fotograma aun puede ser la pagina anterior, ya compuesta.
    const flicker = firstPhoto >= 0 && r.cls.slice(firstPhoto).some((f) => f.blank && f.op >= 1);
    const full = r.cls.find((f) => !f.blank && f.op >= 1);
    const tLoaded = r.samples.find((s) => s.complete)?.t;
    const tHidden = r.samples.find((s) => s.vis === "hidden")?.t;
    log(`  ${label} → ${r.target} · ${r.cls.length} fotogramas · en blanco con opacity 1: ${gaps.length} · parpadeo: ${flicker ? "si" : "no"}`);
    log(`     foto 1 cargada ${rel(tLoaded)} · <img> oculta ${rel(tHidden)} · primer fotograma con foto entera ${rel(full?.t)}`);
    // Un caracter por fotograma: "_" en blanco con opacity 1 (el hueco),
    // "." en blanco con la fila aun transparente, "#" con foto.
    log(`     secuencia ${r.cls.map((f) => (!f.blank ? "#" : f.op >= 1 ? "_" : ".")).join("")}`);
    if (r.errs.length) log(`     errores: ${r.errs.join(" | ")}`);
    addInv(route, "foto 1 medible", r.cls.length > 0, "ningun fotograma con la foto 1 en pantalla");
    if (!r.cls.length) return null;
    addInv(route, "sin hueco en blanco", gaps.length === 0, `${gaps.length} fotogramas en blanco con opacity 1 (${gaps.slice(0, 5).map((f) => rel(f.t)).join(" ")} ms)`);
    addInv(route, "sin parpadeo", !flicker, "la foto 1 se vio y despues desaparecio");
    return full ? full.t - r.t0 : null;
  }
  const fullTimes = { carrusel: [], next: [], directa: [] };
  for (let k = 1; k <= reps; k++) {
    for (const [kind, label] of [["carrusel", "carrusel → album"], ["next", "NEXT ALBUM"], ["directa", "carga directa"]]) {
      const r = await arrivalRun({ kind });
      const t = report(`${k}: ${label}`, r, `llegada (${kind}) ${k}`);
      // Enmienda 2 de la spec 013: la foto 1 aparece de golpe, sin fundido.
      const fade = r.samples.filter((s) => s.op > 0 && s.op < 1).length;
      addInv(`llegada (${kind}) ${k}`, "sin fundido", fade === 0, `${fade} muestras con opacity entre 0 y 1`);
      if (t !== null) fullTimes[kind].push(t);
    }
  }
  for (const [kind, v] of Object.entries(fullTimes)) {
    if (v.length < 2) continue;
    v.sort((a, b) => a - b);
    log(`  foto entera, ${kind}: mediana ${Math.round(v[Math.floor((v.length - 1) / 2)])} · max ${Math.round(v[v.length - 1])} ms`);
  }
  // Reduced motion: igual que sin el, de 0 a 1 en un frame.
  const rm = await arrivalRun({ kind: "carrusel", reduced: true });
  report("reduced motion, carrusel → album", rm, "llegada (reduced motion)");
  const mid = rm.samples.filter((s) => s.op > 0 && s.op < 1);
  addInv("llegada (reduced motion)", "sin fundido", mid.length === 0, `${mid.length} muestras con opacity entre 0 y 1`);
  // Sin WebGL: la foto se muestra en cuanto la pagina sabe que no hay GL, de
  // golpe. Un fundido aqui querria decir que llego por el tiempo maximo de
  // espera, no por la salida sin GL. (Antes de hidratar, la fila esta a 0
  // desde el HTML del servidor: eso no cuenta.)
  const ng = await arrivalRun({ kind: "directa", noGl: true });
  const last = ng.samples[ng.samples.length - 1];
  const ngMid = ng.samples.filter((s) => s.op > 0 && s.op < 1).length;
  const ngShown = ng.samples.find((s) => s.op >= 1);
  log(`  sin WebGL (--disable-3d-apis, webgl ${ng.webgl ? "disponible" : "no disponible"}), carga directa → ${ng.target} · opacity 1 a ${ngShown ? Math.round(ngShown.t - ng.t0) : "—"} ms · muestras a medio fundido ${ngMid} · al final ${last ? `opacity ${last.op}, ${last.vis}` : "—"}`);
  addInv("llegada (sin WebGL)", "WebGL desactivado de verdad", ng.webgl === false, `webgl ${ng.webgl}`);
  addInv("llegada (sin WebGL)", "foto 1 visible sin esperar a GL", !!last && last.op >= 1 && last.vis === "visible" && ngMid === 0,
    last ? `opacity ${last.op}, ${last.vis}, ${ngMid} muestras a medio fundido` : "sin muestras");
  // Prioridad de carga: la foto 1 eager y fetchpriority high, el resto lazy.
  const ap = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  for (const slug of only ? [only.slice("/album/".length)] : slugs) {
    await ap.goto(`${BASE}/album/${slug}`, { waitUntil: "load" }).catch(() => {});
    const a = await ap.evaluate(() => {
      const main = [...document.querySelectorAll("main")].find((el) => getComputedStyle(el).display !== "none");
      const imgs = [...main.querySelectorAll("[data-photo-index] img")];
      return { first: imgs[0] ? [imgs[0].getAttribute("loading"), imgs[0].getAttribute("fetchpriority")] : null, restLazy: imgs.slice(1).every((i) => i.getAttribute("loading") === "lazy") };
    }).catch((e) => ({ evalError: e.message }));
    const route = `llegada /album/${slug}`;
    log(`  /album/${slug}: foto 1 loading=${a.first?.[0]} fetchpriority=${a.first?.[1]} · resto lazy: ${a.restLazy ? "si" : "no"}`);
    addInv(route, "foto 1 eager y fetchpriority high", !!a.first && a.first[0] === "eager" && a.first[1] === "high", a.evalError ?? `loading=${a.first?.[0]} fetchpriority=${a.first?.[1]}`);
    addInv(route, "resto de fotos lazy", !!a.restLazy, "alguna foto despues de la 1 no es lazy");
  }
  await ap.close();
  await decoder.close();
}

// ---------- scroll del album ----------
// Spec 015. El album usa Lenis, que suaviza el scroll: la pagina va por
// detras de la rueda, y al bajar rapido se nota como un freno. Una rafaga
// de rueda, y por rAF scrollY: cuanto falta por recorrer al soltar la
// rueda, cuanto tarda en llegar, y la velocidad maxima por frame (la que
// GLSurface normaliza con velocityNormalize = 40 para la curva). Despues,
// B10: NEXT ALBUM con el clic en plena inercia, y donde empieza el nuevo.
const BURST_STEPS = 20;
const BURST_DELTA_PX = 400;
const BURST_GAP_MS = 16;
const BURST_SETTLE_MS = 3000;
const ALBUM_VELOCITY_NORMALIZE = 40;
const B10_CHECK_MS = [500, 1500];
function scrollSampler() {
  window.__scroll = { samples: [] };
  const tick = () => {
    window.__scroll.samples.push([performance.now(), scrollY, location.pathname]);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
if (!only || only.startsWith("/album/")) {
  rule("scroll del album");
  const slugs = [...readFileSync(new URL("../src/data/photos.ts", import.meta.url), "utf8").matchAll(/^\s*slug: "([^"]+)",$/gm)].map((x) => x[1]);
  const burstRoute = only ?? `/album/${slugs[0]}`;
  async function scrollPage(route, ctxOpts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...ctxOpts });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript(scrollSampler);
    await p.goto(BASE + route, { waitUntil: "load" }).catch((e) => errs.push(`goto: ${e.message}`));
    await p.waitForTimeout(SETTLE_MS);
    await p.mouse.move(720, 450);
    return { ctx, p, errs };
  }
  async function burst(p, steps = BURST_STEPS) {
    for (let i = 0; i < steps; i++) { await p.mouse.wheel(0, BURST_DELTA_PX); await p.waitForTimeout(BURST_GAP_MS); }
    return p.evaluate(() => performance.now());
  }
  // Rafaga: recorrido pedido, lo que falta al soltar, tiempo hasta llegar.
  const bm = await scrollPage(burstRoute);
  const t0 = await bm.p.evaluate(() => { window.__scroll.samples = []; return performance.now(); });
  const tEnd = await burst(bm.p);
  await bm.p.waitForTimeout(BURST_SETTLE_MS);
  const S = await bm.p.evaluate(() => window.__scroll.samples);
  await bm.ctx.close();
  const final = S[S.length - 1][1];
  const atRelease = S.filter(([t]) => t <= tEnd).pop()?.[1] ?? 0;
  const arrived = S.find(([t, y]) => t >= tEnd && Math.abs(final - y) <= 2)?.[0];
  let maxV = 0;
  for (let k = 1; k < S.length; k++) maxV = Math.max(maxV, Math.abs(S[k][1] - S[k - 1][1]));
  const rr = (v) => Math.round(v);
  log(`  rafaga en ${burstRoute}: ${BURST_STEPS} x ${BURST_DELTA_PX} px cada ${BURST_GAP_MS} ms, en ${rr(tEnd - t0)} ms`);
  log(`     recorrido ${rr(final)} px · al soltar la rueda iba por ${rr(atRelease)} px (faltaban ${rr(final - atRelease)}) · llega ${arrived ? rr(arrived - tEnd) : "—"} ms despues de soltar`);
  log(`     velocidad maxima ${rr(maxV)} px/frame · normalizada ${(maxV / ALBUM_VELOCITY_NORMALIZE).toFixed(2)} (curva GL a tope desde 1)`);
  if (bm.errs.length) log(`     errores: ${bm.errs.join(" | ")}`);
  addInv(`scroll ${burstRoute}`, "la rafaga mueve la pagina", final > 0, "scrollY sigue en 0");
  // B10: clic en NEXT ALBUM en plena inercia (el.click(), para que
  // Playwright no haga scroll hasta el enlace antes de pulsarlo).
  for (const slug of slugs) {
    const from = `/album/${slug}`;
    const nm = await scrollPage(from);
    // La rafaga de page.mouse.wheel tarda ~68 ms por paso: cuando acaba,
    // Lenis ya ha llegado y no queda inercia. Aqui la rueda se lanza desde
    // la pagina, de golpe, hasta el final, y el clic llega a los 250 ms,
    // con Lenis aun recorriendo el camino.
    const r = await nm.p.evaluate(async () => {
      const main = [...document.querySelectorAll("main")].find((el) => getComputedStyle(el).display !== "none");
      const a = [...main.querySelectorAll('a[href^="/album/"]')].pop();
      const need = document.documentElement.scrollHeight - innerHeight;
      for (let y = 0; y < need + 2000; y += 400) {
        window.dispatchEvent(new WheelEvent("wheel", { deltaY: 400, clientX: 720, clientY: 450, bubbles: true, cancelable: true }));
      }
      await new Promise((res) => setTimeout(res, 250));
      const s = window.__scroll.samples;
      const moving = s.length > 2 ? Math.abs(s[s.length - 1][1] - s[s.length - 3][1]) : 0;
      const tClick = performance.now();
      a.click();
      return { href: a.getAttribute("href"), moving, tClick };
    }).catch((e) => ({ evalError: e.message }));
    if (r.evalError) { addInv(`B10 ${from}`, "NEXT ALBUM medible", false, r.evalError); await nm.ctx.close(); continue; }
    await nm.p.waitForURL(BASE + r.href).catch(() => {});
    await nm.p.waitForTimeout(Math.max(...B10_CHECK_MS) + 200);
    const S2 = await nm.p.evaluate(() => window.__scroll.samples);
    await nm.ctx.close();
    const on = S2.filter(([, , path]) => path === r.href);
    const at = B10_CHECK_MS.map((ms) => on.filter(([t]) => t <= r.tClick + ms).pop()?.[1]);
    const maxNew = on.reduce((m, [, y]) => Math.max(m, y), 0);
    log(`  B10 ${from} → ${r.href}: clic con la pagina moviendose ${rr(r.moving)} px en 2 frames · scrollY en el nuevo a ${B10_CHECK_MS.join(" y ")} ms: ${at.map((y) => (y === undefined ? "—" : rr(y))).join(" y ")} · max ${rr(maxNew)}`);
    if (nm.errs.length) log(`     errores: ${nm.errs.join(" | ")}`);
    addInv(`B10 ${from}`, "NEXT ALBUM empieza arriba", at.every((y) => y === 0) && maxNew === 0, `scrollY ${at.map((y) => (y === undefined ? "—" : rr(y))).join("/")}, max ${rr(maxNew)}`);
  }
}

// ---------- textos del album ----------
// Spec 010. Recorre todos los albumes de src/data/photos.ts y mide cada
// [data-album-text] y [data-photo-quote] a 1440x900 contra su <img>.
// En local se pintan tambien los [PLACEHOLDER] (solo en next dev); con
// --url se comprueba que no llegue ninguno a produccion (CA8).
const TEXT_MIN_GAP_PX = 64;
const SIDE_TOP_MAX_PX = 100;
const QUOTE_CENTER_MAX_PX = 24;
// Enmienda 1 de la spec 010: hasta 1,1 de ancho por alto cuenta como cuadrada.
const NEAR_SQUARE_MAX_RATIO = 1.1;
const SIGNATURE = "JAVIER SUÁREZ SUQUÍA";
if (!only || only.startsWith("/album/")) {
  rule("textos del album");
  const txCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const tp = await txCtx.newPage();
  // /albums solo enlaza la diapositiva abierta del carrusel: la lista de
  // albumes sale de src/data/photos.ts, que es la fuente unica.
  const albumRoutes = only
    ? [only]
    : [...readFileSync(new URL("../src/data/photos.ts", import.meta.url), "utf8").matchAll(/^\s*slug: "([^"]+)",$/gm)].map((x) => `/album/${x[1]}`);
  for (const route of albumRoutes) {
    await tp.goto(BASE + route, { waitUntil: "load" }).catch(() => {});
    await tp.waitForTimeout(SETTLE_MS);
    const m = await tp.evaluate((nearSquare) => {
      const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
      const grey = (el) => { const c = getComputedStyle(el).color.match(/[\d.]+/g).map(Number); return c[0] === c[1] && c[1] === c[2]; };
      const main = [...document.querySelectorAll("main")].find((el) => getComputedStyle(el).display !== "none");
      const rows = [...main.querySelectorAll("[data-photo-index]")];
      const titleCount = Number((main.textContent.match(/(\d+)\s*Photos/i) || [])[1]);
      const texts = [...main.querySelectorAll("[data-album-text],[data-photo-quote]")].map((t) => {
        const kind = t.hasAttribute("data-photo-quote") ? "cita" : t.dataset.textKind;
        const row = t.closest("[data-photo-index]");
        const img = row?.querySelector("img");
        const idx = row ? Number(row.dataset.photoIndex) : null;
        // Para "entre fotos": las <img> de la fila anterior y la siguiente en el DOM.
        let prev = null, next = null;
        if (!row) {
          const all = rows.map((r) => r.querySelector("img"));
          prev = all.filter((i) => i.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING).pop() ?? null;
          next = all.find((i) => i.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_PRECEDING) ?? null;
        }
        const ps = [...t.querySelectorAll("p")];
        const greyBg = (el) => { const c = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number); return c[0] === c[1] && c[1] === c[2]; };
        // Bordes del contenido de la fila (sin su padding): el hueco libre
        // va de la foto al borde del contenido del lado contrario.
        const rb = row?.getBoundingClientRect();
        const content = row ? [rb.left + parseFloat(getComputedStyle(row).paddingLeft), rb.right - parseFloat(getComputedStyle(row).paddingRight)] : null;
        return {
          kind, lang: t.lang, idx, text: t.innerText, content,
          box: box(t), img: img ? box(img) : null,
          landscape: img ? img.naturalWidth > nearSquare * img.naturalHeight : null,
          ratioDev: img ? Math.abs(img.getBoundingClientRect().width / img.getBoundingClientRect().height / (img.naturalWidth / img.naturalHeight) - 1) : null,
          prev: prev ? box(prev) : null, next: next ? box(next) : null,
          greys: ps.every(grey) && [...t.querySelectorAll("span[aria-hidden]")].every(greyBg),
          // Fila de la primera foto despues de un texto "entre fotos".
          nextIdx: next ? Number(next.closest("[data-photo-index]").dataset.photoIndex) : null,
          sig: kind === "cita" ? null : (ps[1]?.innerText.trim() ?? ""),
        };
      });
      return { rows: rows.length, titleCount, texts, vw: innerWidth, vh: innerHeight };
    }, NEAR_SQUARE_MAX_RATIO).catch((e) => ({ evalError: e.message }));
    if (m.evalError) { addInv(route, "textos del album medibles", false, m.evalError); continue; }
    if (remote) {
      const ph = m.texts.filter((t) => t.text.includes("[PLACEHOLDER]")).length;
      addInv(route, "sin textos [PLACEHOLDER] en produccion", ph === 0, `${ph} textos de prueba publicados`);
      continue;
    }
    log(`  ${route}: ${m.texts.length} textos, ${m.rows} filas de foto`);
    addInv(route, "filas de foto = fotos del titulo", m.rows === m.titleCount, `${m.rows} filas, el titulo dice ${m.titleCount}`);
    const longs = m.texts.filter((t) => t.kind !== "cita").length;
    if (m.texts.length) addInv(route, "como mucho un texto largo", longs <= 1, `${longs} textos largos`);
    for (const t of m.texts) {
      const tag = `${t.kind}${t.idx !== null ? ` foto ${t.idx + 1}` : ""}`;
      const f1 = (v) => Math.round(v * 10) / 10;
      if (t.kind === "between") {
        const cx = f1(t.box.l + t.box.w / 2 - m.vw / 2);
        log(`    ${tag}: caja ${f1(t.box.w)}x${f1(t.box.h)}, desvio del centro ${cx} px`);
        addInv(route, `${tag}: centrado y entre dos fotos`,
          Math.abs(cx) <= 2 && !!t.prev && !!t.next && t.box.t >= t.prev.b && t.box.b <= t.next.t,
          `desvio ${cx} px, anterior ${t.prev ? "si" : "no"}, siguiente ${t.next ? "si" : "no"}`);
      } else {
        const left = t.box.l >= t.img.r;
        const gap = f1(left ? t.box.l - t.img.r : t.img.l - t.box.r);
        const overlap = Math.max(0, Math.min(t.box.r, t.img.r) - Math.max(t.box.l, t.img.l)) * Math.max(0, Math.min(t.box.b, t.img.b) - Math.max(t.box.t, t.img.t));
        const offset = t.idx % 3;
        const sideOk = offset === 1 ? t.box.l >= t.img.r : offset === 2 ? t.box.r <= t.img.l : false;
        log(`    ${tag}: hueco ${gap} px, arriba ${f1(t.box.t - t.img.t)} px, centro ${f1(t.box.t + t.box.h / 2 - (t.img.t + t.img.h / 2))} px`);
        addInv(route, `${tag}: sin solaparse y en el lado libre`, overlap === 0 && gap >= TEXT_MIN_GAP_PX && sideOk,
          `solape ${overlap}, hueco ${gap} px, fila ${["centrada", "izquierda", "derecha"][offset]}`);
        addInv(route, `${tag}: foto vertical o cuadrada en fila desplazada`, !t.landscape && offset !== 0,
          `${t.landscape ? "foto horizontal" : "foto vertical"}, fila ${["centrada", "izquierda", "derecha"][offset]}`);
        // Enmienda 1 de la spec 010: la ultima foto si puede llevar texto.
        addInv(route, `${tag}: no es la primera foto`, t.idx !== 0, `foto ${t.idx + 1} de ${m.rows}`);
        if (t.kind === "cita") {
          // La cita se centra en el hueco libre entero, no pegada a la foto.
          const [fl, fr] = offset === 1 ? [t.img.r, t.content[1]] : [t.content[0], t.img.l];
          const dx = f1(t.box.l + t.box.w / 2 - (fl + fr) / 2);
          log(`      hueco libre ${f1(fl)}-${f1(fr)} px, desvio del centro ${dx} px`);
          addInv(route, `${tag}: centrada en el hueco libre`, Math.abs(dx) <= QUOTE_CENTER_MAX_PX, `desvio ${dx} px`);
        }
        addInv(route, `${tag}: foto entera y sin deformar`,
          t.img.h <= 0.85 * m.vh + 1 && t.ratioDev < MAX_RATIO_DEVIATION && t.box.l >= 0 && t.box.r <= m.vw && t.img.l >= 0 && t.img.r <= m.vw,
          `alto ${f1(t.img.h)}, desvio ${t.ratioDev.toFixed(4)}`);
        addInv(route, `${tag}: alineacion vertical`,
          t.kind === "cita" ? Math.abs(t.box.t + t.box.h / 2 - (t.img.t + t.img.h / 2)) <= QUOTE_CENTER_MAX_PX : Math.abs(t.box.t - t.img.t) <= SIDE_TOP_MAX_PX,
          t.kind === "cita" ? `centro a ${f1(t.box.t + t.box.h / 2 - (t.img.t + t.img.h / 2))} px` : `arriba a ${f1(t.box.t - t.img.t)} px`);
      }
      addInv(route, `${tag}: escala de grises`, t.greys, "algun color no es gris");
      if (t.kind !== "cita") addInv(route, `${tag}: firma`, t.sig === SIGNATURE, `dice ${JSON.stringify(t.sig)}`);
    }
    // Un texto entre fotos no lleva data-photo-index: el enlace #photo-N
    // del atlas tiene que seguir centrando la foto N+1, no el texto.
    const target = m.texts.find((t) => t.kind === "between")?.nextIdx;
    if (Number.isInteger(target)) {
      const lc = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const lp = await lc.newPage();
      await lp.goto(`${BASE}${route}#photo-${target}`, { waitUntil: "load" }).catch(() => {});
      await lp.waitForTimeout(SETTLE_MS);
      const d = await lp.evaluate((i) => { const r = document.querySelector(`[data-photo-index="${i}"]`).getBoundingClientRect(); return Math.round(r.top + r.height / 2 - innerHeight / 2); }, target).catch(() => null);
      await lc.close();
      addInv(route, `#photo-${target} centra la foto ${target + 1}, despues del texto`, d !== null && Math.abs(d) <= 50, `desvio ${d} px`);
    }
  }
  await txCtx.close();
}

// ---------- entrada del landing ----------
// Mide desde fuera, sin tocar el sitio. Cada repeticion abre un contexto
// nuevo (cache vacia, como un visitante nuevo) e instala, antes de cualquier
// script del sitio, un muestreo por frame del opacity/transform INLINE de
// cada .landing-photo-entrance: es lo que escribe la entrada
// (src/motion/LandingComposition.tsx:690-737). Solo estilos inline, sin
// getComputedStyle ni layout, para no provocar el jank que se mide.
// Informativo: no es una invariante, todavia no hay umbral decidido.
const ENTRANCE_MAX_MS = 15000;
const ENTRANCE_REST_HOLD_MS = 500;
const LONG_FRAME_MS = 50;
const near0 = (t) => !t || (t.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || []).every((n) => Math.abs(+n) < 0.5);

function sampler({ maxMs, holdMs }) {
  const near0 = (t) => !t || (t.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi) || []).every((n) => Math.abs(+n) < 0.5);
  const rec = { frames: [], starts: [], longTasks: [], done: false };
  window.__entrada = rec;
  const orig = console.log;
  console.log = function (...a) {
    if (a[0] === "[entrance] start") rec.starts.push(performance.now());
    return orig.apply(this, a);
  };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) rec.longTasks.push([e.startTime, e.duration]); })
      .observe({ type: "longtask", buffered: true });
  } catch { /* sin longtask en este navegador */ }
  let restSince = null;
  function tick(now) {
    const s = [];
    let allRest = true;
    document.querySelectorAll(".landing-photo-entrance").forEach((el) => {
      const o = el.style.opacity, t = el.style.transform;
      s.push([o, t]);
      if (!((o === "" || o === "1") && near0(t))) allRest = false;
    });
    rec.frames.push([now, s]);
    if (allRest && s.length && rec.starts.length) restSince ??= now; else restSince = null;
    if ((restSince !== null && now - restSince >= holdMs) || now >= maxMs) { rec.done = true; return; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function analyse(rec) {
  const F = rec.frames;
  const at = (f, i) => f[1][i] || ["", ""];
  const n = F.reduce((m, f) => Math.max(m, f[1].length), 0);
  const isOffset = (t) => !!t && !near0(t);
  // Participante: a opacity < 1 inline DESPUES de [entrance] start. Todo
  // copy-0 nace a 0 (LandingComposition.tsx:849), pero la entrada pone a 1
  // a los que no participan en la misma tarea que el log (:429,464-472).
  // copy-1 no lleva opacidad inline.
  const start = rec.starts[0] ?? null;
  const after = start === null ? [] : F.filter((f) => f[0] > start);
  const parts = [];
  for (let i = 0; i < n; i++) if (after.some((f) => at(f, i)[0] !== "" && +at(f, i)[0] < 1)) parts.push(i);
  // Union al monton: primer frame visible y desplazado (fase A, :690-700).
  const joins = new Map();
  for (const i of parts) {
    const f = F.find((f) => +at(f, i)[0] > 0 && isOffset(at(f, i)[1]));
    if (f) joins.set(i, { t: f[0], tf: at(f, i)[1] });
  }
  // Fase B: primer frame en que cambia el transform de una foto ya unida (:701-724).
  let phaseB = null;
  for (const f of F) {
    for (const [i, j] of joins) if (f[0] > j.t && at(f, i)[1] !== j.tf) { phaseB = f[0]; break; }
    if (phaseB !== null) break;
  }
  const stragglers = parts.filter((i) => !joins.has(i) || (phaseB !== null && joins.get(i).t >= phaseB)).length;
  // Reposo: primer frame desde el que todo queda a opacity 1 y sin desplazamiento.
  const restAt = (f) => f[1].length > 0 && f[1].every(([o, t]) => (o === "" || o === "1") && near0(t));
  let lastBusy = -1;
  F.forEach((f, k) => { if (!restAt(f)) lastBusy = k; });
  const rest = rec.done && lastBusy + 1 < F.length ? F[lastBusy + 1][0] : null;
  const end = rest ?? (F.length ? F[F.length - 1][0] : 0);
  // El intervalo que contiene [entrance] start es la tarea de hidratacion en
  // la que arranca la entrada (un layout effect): se da aparte, porque en
  // ese momento aun no se ve ninguna foto. Los frames largos cuentan solo
  // los intervalos enteros despues del inicio, con fotos ya en movimiento.
  let longFrames = 0, maxFrame = 0, startFrame = null;
  for (let k = 1; k < F.length; k++) {
    if (start === null || F[k][0] < start || F[k][0] > end) continue;
    const d = F[k][0] - F[k - 1][0];
    if (F[k - 1][0] < start) { startFrame = d; continue; }
    if (d > LONG_FRAME_MS) longFrames++;
    if (d > maxFrame) maxFrame = d;
  }
  const lt = rec.longTasks.filter(([s]) => s <= end);
  const r0 = (v) => (v === null ? null : Math.round(v));
  return {
    start: r0(start), participants: parts.length,
    joins: [...joins.values()].map((j) => r0(j.t)).sort((a, b) => a - b),
    phaseB: r0(phaseB), stragglers, rest: r0(rest),
    longFrames, maxFrame: r0(maxFrame), startFrame: r0(startFrame),
    longTasks: lt.length, longTaskMs: r0(lt.reduce((a, [, d]) => a + d, 0)),
    startCount: rec.starts.length,
  };
}

if (!only || only === "/") {
  rule("entrada /");
  log(`ms desde el inicio de la navegacion · ${reps} repeticion${reps > 1 ? "es" : ""} · cache vacia en cada una`);
  for (let k = 1; k <= reps; k++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript(sampler, { maxMs: ENTRANCE_MAX_MS, holdMs: ENTRANCE_REST_HOLD_MS });
    await p.goto(BASE + "/", { waitUntil: "commit" }).catch((e) => errs.push(`goto: ${e.message}`));
    await p.waitForFunction(() => window.__entrada?.done, null, { timeout: ENTRANCE_MAX_MS + 5000, polling: 250 }).catch(() => {});
    const rec = await p.evaluate(() => window.__entrada).catch(() => null);
    await ctx.close();
    if (!rec) { log(`  ${k}: sin datos (${errs.join(" | ") || "el muestreo no llego a correr"})`); continue; }
    const a = analyse(rec);
    results.entrance.push(a);
    const fmt = (v) => (v === null ? "—" : v);
    log(`  ${k}: inicio ${fmt(a.start)} · participantes ${a.participants} · fase B ${fmt(a.phaseB)} · rezagadas ${a.stragglers} · reposo ${fmt(a.rest)}`);
    log(`     frame del arranque ${fmt(a.startFrame)} ms · despues: frames >${LONG_FRAME_MS} ms ${a.longFrames}, frame max ${a.maxFrame} ms · long tasks ${a.longTasks} (${a.longTaskMs} ms) · [entrance] start x${a.startCount}`);
    log(`     al monton: ${a.joins.join(" ") || "—"}`);
    if (errs.length) log(`     errores de pagina: ${errs.join(" | ")}`);
  }
  if (results.entrance.length > 1) {
    const stat = (key) => {
      const v = results.entrance.map((e) => e[key]).filter((x) => x !== null).sort((x, y) => x - y);
      return v.length ? `mediana ${v[Math.floor((v.length - 1) / 2)]} · max ${v[v.length - 1]}` : "—";
    };
    log(`  fase B      ${stat("phaseB")}`);
    log(`  reposo      ${stat("rest")}`);
    log(`  frames >${LONG_FRAME_MS} ${stat("longFrames")}`);
    log(`  frame max   ${stat("maxFrame")}`);
    log(`  arranque    ${stat("startFrame")}`);
  }
}

// ---------- descifrado del wordmark ----------
// Spec 014. Fuera de / el landing sigue montado con display: none, y todo lo
// que mida ahi da 0: si el wordmark guarda esos anchos, al entrar en / las
// seis letras se apilan durante el descifrado. En reposo es un nodo de texto
// y "wordmark dice SUQUIA" no lo ve, asi que aqui se muestrea por rAF el
// ancho de cada columna de [data-decipher-live] mientras descifra, segun por
// donde se llegue a /.
const DECIPHER_WAIT_MS = 8000;
const DECIPHER_SUM_TOL_PX = 2;
const DECIPHER_COL_TOL_PX = 1;
const DECIPHER_REDUCED_WAIT_MS = 2500;
function decipherSampler() {
  window.__descifrado = { samples: [] };
  const tick = () => {
    const live = document.querySelector("[data-decipher-live]");
    if (live) window.__descifrado.samples.push([...live.children].map((c) => c.getBoundingClientRect().width));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
if (!only || only === "/") {
  rule("descifrado del wordmark");
  const visibleLink = (p, href) => p.locator(`main:visible a[href="${href}"]`).first();
  const waitDecipher = (p) => p.waitForFunction(
    () => window.__descifrado.samples.length > 0 && !document.querySelector("[data-decipher-live]"),
    null, { timeout: DECIPHER_WAIT_MS, polling: 100 },
  ).catch(() => {});
  // Navegacion de cliente a /, con el muestreo puesto a cero justo antes.
  async function softToLanding(p) {
    await p.waitForTimeout(SETTLE_MS);
    await p.evaluate(() => { window.__descifrado.samples = []; });
    await visibleLink(p, "/").click();
    await p.waitForURL(BASE + "/");
  }
  async function decipherRun({ start, reduced = false, steps = softToLanding }) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...(reduced ? { reducedMotion: "reduce" } : {}) });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript(decipherSampler);
    await p.goto(BASE + start, { waitUntil: "load" }).catch((e) => errs.push(`goto: ${e.message}`));
    await steps(p).catch((e) => errs.push(`pasos: ${e.message}`));
    if (reduced) await p.waitForTimeout(DECIPHER_REDUCED_WAIT_MS);
    else await waitDecipher(p);
    const r = await p.evaluate(() => {
      const main = [...document.querySelectorAll("main")].filter((el) => getComputedStyle(el).display !== "none")[0];
      const h1 = main?.querySelector("h1");
      let h1Text = null;
      if (h1) {
        const c = h1.cloneNode(true);
        c.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
        h1Text = c.textContent.trim().slice(0, 40);
      }
      const root = main?.querySelector(".wordmark-hover-target");
      return { samples: window.__descifrado.samples, rest: root ? root.getBoundingClientRect().width : null, h1Text };
    }).catch((e) => ({ samples: [], rest: null, h1Text: null, evalError: e.message }));
    await ctx.close();
    return { ...r, errs };
  }

  const r1 = (v) => Math.round(v * 10) / 10;
  const scenarios = [
    ["a", "carga directa en /", { start: "/", steps: async () => {} }],
    ["b", "carga en /about, clic a /", { start: "/about" }],
    ["c", "carga en /albums, clic a /", { start: "/albums" }],
    ["d", "/ -> /about, resize alli, -> /", {
      start: "/",
      steps: async (p) => {
        await waitDecipher(p);
        await visibleLink(p, "/about").click();
        await p.waitForURL(BASE + "/about");
        await p.waitForTimeout(500);
        await p.setViewportSize({ width: 1300, height: 900 });
        await p.waitForTimeout(300);
        await p.setViewportSize({ width: 1440, height: 900 });
        await softToLanding(p);
      },
    }],
  ];
  let ref = null;
  for (const [id, label, opts] of scenarios) {
    const r = await decipherRun(opts);
    const uniq = [...new Set(r.samples.map((s) => s.map(r1).join(", ")))];
    log(`  (${id}) ${label} · ${r.samples.length} muestras · reposo ${r.rest === null ? "—" : r1(r.rest)} px`);
    log(`      columnas: ${uniq.slice(0, 3).join(" | ") || "—"}${uniq.length > 3 ? ` (+${uniq.length - 3})` : ""}`);
    if (r.errs.length || r.evalError) log(`      errores: ${[...r.errs, r.evalError].filter(Boolean).join(" | ")}`);
    const route = `descifrado (${id})`;
    addInv(route, "hubo descifrado", r.samples.length > 0, "ninguna muestra con [data-decipher-live]");
    if (!r.samples.length) continue;
    const zero = r.samples.find((s) => s.some((w) => w < 0.5));
    addInv(route, "ninguna columna a 0", !zero, `columnas ${zero?.map(r1).join(", ")}`);
    const off = r.rest === null ? null : r.samples.find((s) => Math.abs(s.reduce((a, b) => a + b, 0) - r.rest) > DECIPHER_SUM_TOL_PX);
    addInv(route, `suma de columnas = SUQUIA en reposo (±${DECIPHER_SUM_TOL_PX} px)`, r.rest !== null && !off,
      r.rest === null ? "sin wordmark en reposo" : off ? `suma ${r1(off.reduce((a, b) => a + b, 0))} vs reposo ${r1(r.rest)}` : "");
    if (id === "a") ref = r.samples[0];
    else if (ref) {
      const s = r.samples[0];
      const same = s.length === ref.length && s.every((w, i) => Math.abs(w - ref[i]) <= DECIPHER_COL_TOL_PX);
      addInv(route, `columnas = carga directa (±${DECIPHER_COL_TOL_PX} px)`, same, `${s.map(r1).join(", ")} vs ${ref.map(r1).join(", ")}`);
    }
  }
  const rm = await decipherRun({ start: "/about", reduced: true });
  log(`  (e) reduced motion, carga en /about, clic a / · ${rm.samples.length} muestras · h1 ${JSON.stringify(rm.h1Text)}`);
  if (rm.errs.length) log(`      errores: ${rm.errs.join(" | ")}`);
  addInv("descifrado (e)", "reduced motion sin descifrado", rm.samples.length === 0, `${rm.samples.length} muestras`);
  addInv("descifrado (e)", "reduced motion: wordmark dice SUQUIA", rm.h1Text === "SUQUIA", `dice: ${JSON.stringify(rm.h1Text)}`);
}

// ---------- atlas ----------
// Spec 016. El globo es un canvas sin DOM que medir: se lee la sonda de solo
// lectura window.__atlas (src/motion/Atlas.tsx). Las coordenadas de los
// grupos que da son relativas a la caja del canvas.
const ATLAS_CLUSTER_PX = 14; // CLUSTER_THRESHOLD_PX, src/motion/Atlas.tsx
const ATLAS_WORLD_MAX_R = 4563; // la mascara del mundo, 2048 px, a 14 px por pixel (spec 016, enmienda 1)
const ATLAS_ZONE_MARGIN = 1.5;
const ATLAS_VIEWER_MAX_COVER = 0.4; // CA6, fijado en plan.md
const ATLAS_WHEEL_DELTA = -100;
const ATLAS_WHEEL_MAX_STEPS = 400;
const ATLAS_RECENTER_WAIT_MS = 1000;
const ATLAS_OPEN_MAX_CLICKS = 8; // CA4: clics en el grupo hasta que se abre
const ATLAS_FLIGHT_WAIT_MS = 1900; // FLY_MAX_MS (1400) + margen
const DMS_RE = /\d+°\d+'\d+"/;
function atlasPhotos() {
  // Una linea src y, mas abajo, su linea place (formato de src/data/photos.ts).
  const lines = readFileSync(new URL("../src/data/photos.ts", import.meta.url), "utf8").split("\n");
  const P = [];
  let src = null;
  for (const l of lines) {
    const s = l.match(/src: "(\/photos[^"]+)"/);
    if (s) src = s[1];
    const m = l.match(/place: \{ city: "([^"]+)", country: "[^"]+", lat: *([-\d.]+|null), *lng: *([-\d.]+|null), *precision: "(\w+)"/);
    if (m && src) P.push({ src, city: m[1], lat: m[2] === "null" ? null : +m[2], lng: m[3] === "null" ? null : +m[3], precision: m[4] });
  }
  return P;
}
function angDist(a, b) {
  const D = Math.PI / 180;
  const c = Math.sin(a.lat * D) * Math.sin(b.lat * D) + Math.cos(a.lat * D) * Math.cos(b.lat * D) * Math.cos((a.lng - b.lng) * D);
  return Math.acos(Math.min(1, Math.max(-1, c)));
}
function atlasSampler() {
  // Frames por rAF y, en cada frame, el estado del visor si existe.
  window.__atlasRec = { frames: [], viewer: [] };
  const tick = (t) => {
    window.__atlasRec.frames.push(t);
    const v = document.querySelector("[data-atlas-viewer]");
    if (v) {
      const c = getComputedStyle(v);
      window.__atlasRec.viewer.push([t, c.opacity, c.transform]);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
if (!only || only === "/atlas") {
  rule("atlas");
  const AP = atlasPhotos();
  const withCoords = AP.filter((p) => p.lat !== null && p.lng !== null);
  log(`  fotos: ${AP.length} · con coordenadas: ${withCoords.length} · exact: ${withCoords.filter((p) => p.precision === "exact").length}`);
  // Par exact con coordenadas distintas mas cercano de una misma ciudad (CA2).
  const exact = withCoords.filter((p) => p.precision === "exact");
  let pair = null;
  for (let i = 0; i < exact.length; i++) for (let j = i + 1; j < exact.length; j++) {
    if (exact[i].city !== exact[j].city) continue;
    const a = angDist(exact[i], exact[j]);
    if (a > 1e-9 && (!pair || a < pair.a)) pair = { a, p: exact[i], q: exact[j] };
  }
  const rr = (v) => Math.round(v);
  async function atlasPage(ctxOpts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, ...ctxOpts });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript(atlasSampler);
    await p.goto(BASE + "/atlas", { waitUntil: "load" }).catch((e) => errs.push(`goto: ${e.message}`));
    await p.waitForTimeout(SETTLE_MS);
    const box = await p.evaluate(() => {
      // El landing sigue montado y oculto: su <main> es el primero del
      // documento y su canvas mide 0. Hay que tomar el del <main> visible.
      const main = [...document.querySelectorAll("main")].find((el) => getComputedStyle(el).display !== "none");
      const b = main?.querySelector("canvas")?.getBoundingClientRect();
      return b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null;
    });
    // Un movimiento en una esquina del canvas reinicia la cuenta de la deriva.
    if (box) await p.mouse.move(box.x + 5, box.y + box.h - 5);
    return { ctx, p, errs, box };
  }
  const probe = (p, expr) => p.evaluate(expr).catch(() => null);
  async function clickCluster(p, box, pick) {
    const cl = await probe(p, () => window.__atlas?.clusters() ?? null);
    if (!cl) return null;
    const c = pick(cl.filter((x) => x.opacity > 0));
    if (!c) return null;
    await p.mouse.click(box.x + c.x, box.y + c.y);
    await p.waitForTimeout(ATLAS_RECENTER_WAIT_MS);
    return c;
  }
  async function zoomToMax(p, box) {
    // El zoom va hacia el centro del globo, no hacia el raton: se rueda en el
    // cuarto izquierdo del canvas, libre tambien con el visor abierto.
    await p.mouse.move(box.x + box.w * 0.25, box.y + box.h / 2);
    const t0 = await p.evaluate(() => performance.now());
    let last = -1, same = 0, steps = 0;
    while (same < 3 && steps < ATLAS_WHEEL_MAX_STEPS) {
      await p.mouse.wheel(0, ATLAS_WHEEL_DELTA);
      steps++;
      const R = (await probe(p, () => window.__atlas?.state().R)) ?? -1;
      same = Math.abs(R - last) < 1e-6 ? same + 1 : 0;
      last = R;
    }
    await p.waitForTimeout(300);
    const t1 = await p.evaluate(() => performance.now());
    const fr = await p.evaluate(() => window.__atlasRec.frames);
    const inWin = fr.filter((t) => t >= t0 && t <= t1);
    const deltas = inWin.slice(1).map((t, k) => t - inWin[k]);
    return { R: last, steps, frames: inWin.length, long: deltas.slice(1).filter((d) => d > LONG_FRAME_MS).length, worst: Math.max(0, ...deltas.slice(1)) };
  }
  async function zoomFollowing(p, box, src) {
    const t0 = await p.evaluate(() => performance.now());
    const clicks = [];
    const clickGroup = async () => {
      // Solo grupos: el clic en una foto suelta navega a su album (o, con el
      // visor, lo abre), y la medida dejaria de ser la del globo.
      const tc = await p.evaluate(() => performance.now());
      const c = await clickCluster(p, box, (cl) => cl.find((x) => x.srcs.length > 1 && x.srcs.includes(src) && x.x >= 0 && x.y >= 0 && x.x <= box.w && x.y <= box.h));
      if (!c) return null;
      // El clic en un grupo abre el panel de lista (o el visor): se cierra para seguir.
      await p.keyboard.press("Escape");
      await p.evaluate(() => [...document.querySelectorAll('main button[aria-label="Close"]')].forEach((b) => b.click())).catch(() => {});
      await p.mouse.move(box.x + box.w * 0.25, box.y + box.h / 2);
      const t1 = await p.evaluate(() => performance.now());
      clicks.push({ n: c.srcs.length, R: (await probe(p, () => window.__atlas.state().R)) ?? 0, t0: tc, t1 });
      return c;
    };
    let group = await clickGroup();
    let last = -1, same = 0, steps = 0;
    while (same < 3 && steps < ATLAS_WHEEL_MAX_STEPS) {
      await p.mouse.wheel(0, ATLAS_WHEEL_DELTA);
      steps++;
      const R = (await probe(p, () => window.__atlas?.state().R)) ?? -1;
      same = Math.abs(R - last) < 1e-6 ? same + 1 : 0;
      last = R;
      const cur = ((await probe(p, () => window.__atlas.clusters())) ?? []).find((x) => x.srcs.includes(src));
      if (group && cur && cur.srcs.length < group.srcs.length) {
        const c = await clickGroup();
        if (c) { group = c; same = 0; }
      }
    }
    await p.waitForTimeout(300);
    const t1 = await p.evaluate(() => performance.now());
    const fr = await p.evaluate(() => window.__atlasRec.frames);
    // CA3 mide el zoom del globo: se descartan los frames de cada clic (el
    // recentrado y el panel o el visor que abre, que tienen su propia medida).
    const inWin = fr.filter((t) => t >= t0 && t <= t1);
    const inClick = (a, b) => clicks.some((c) => b >= c.t0 && a <= c.t1);
    const deltas = inWin.slice(1).map((t, k) => (inClick(inWin[k], t) ? null : t - inWin[k])).filter((d) => d !== null);
    return { R: last, steps, clicks, frames: deltas.length, long: deltas.slice(1).filter((d) => d > LONG_FRAME_MS).length, worst: Math.max(0, ...deltas.slice(1)) };
  }
  const cssImpl = async (p) => probe(p, () => window.__atlas?.state() ?? null);

  // CA2 y CA3: clic en el grupo del par, rueda hasta el maximo.
  {
    const { ctx, p, errs, box } = await atlasPage();
    const st0 = await cssImpl(p);
    log(`  sonda: ${st0 ? `R ${rr(st0.R)} · minR ${rr(st0.minR)} · maxR ${rr(st0.maxR)} · caja ${rr(st0.width)}x${rr(st0.height)}` : "NO HAY window.__atlas"}`);
    addInv("atlas", "sonda window.__atlas presente", !!st0, "sin sonda: el resto de la seccion no mide nada");
    if (st0 && box && pair) {
      log(`  par exact mas cercano (coordenadas distintas): ${pair.p.src} y ${pair.q.src} · ${pair.p.city} · ${rr(pair.a * 6371000)} m · separarlo a ${ATLAS_CLUSTER_PX} px pide R ≈ ${rr(ATLAS_CLUSTER_PX / pair.a)}`);
      const lc0 = await probe(p, () => window.__atlas.latticeCount());
      log(`  reticula en el encuadre por defecto: ${lc0?.visited} puntos recorridos · ${lc0?.drawn} pintados`);
      // El zoom va hacia el centro del globo y el techo depende del nivel de
      // mascara bajo el centro (spec 016). Un grupo se recentra en la media
      // de sus fotos, que puede caer lejos del par, asi que se hace lo que
      // haria un visitante: rodar y, cada vez que el grupo del par se parte,
      // pulsar el subgrupo que lo contiene (lo recentra) y seguir rodando.
      const z = await zoomFollowing(p, box, pair.p.src);
      const cl = (await probe(p, () => window.__atlas.clusters())) ?? [];
      const cp = cl.find((x) => x.srcs.includes(pair.p.src));
      const cq = cl.find((x) => x.srcs.includes(pair.q.src));
      const apart = !!cp && !!cq && cp !== cq && !cp.srcs.includes(pair.q.src);
      log(`  clics en el grupo del par durante el zoom: ${z.clicks.map((c) => `${c.n} fotos a R ${rr(c.R)}`).join(" → ")}`);
      const sep = apart ? Math.hypot(cp.x - cq.x, cp.y - cq.y) : pair.a * z.R;
      const lc1 = await probe(p, () => window.__atlas.latticeCount());
      log(`  rueda hasta el maximo: ${z.steps} pasos · R final ${rr(z.R)} · separacion del par ${sep.toFixed(1)} px${apart ? "" : " (estimada: siguen agrupadas)"}`);
      log(`  frames durante la rueda (sin los clics): ${z.frames} · > ${LONG_FRAME_MS} ms despues del primero: ${z.long} · peor ${rr(z.worst)} ms · reticula al maximo: ${lc1?.visited} recorridos, ${lc1?.drawn} pintados`);
      addInv("atlas", `CA2 par mas cercano separado (> ${ATLAS_CLUSTER_PX} px) al zoom maximo`, apart && sep > ATLAS_CLUSTER_PX, `R ${rr(z.R)}, separacion ${sep.toFixed(1)} px`);
      addInv("atlas", `CA3 0 frames > ${LONG_FRAME_MS} ms en la rueda hasta el maximo`, z.long === 0, `${z.long} frames, peor ${rr(z.worst)} ms`);
    }
    if (errs.length) log(`  errores: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // CA13: clic en el grupo mas grande del encuadre por defecto (spec 016, enmienda 2).
  {
    const { ctx, p, errs, box } = await atlasPage();
    if (box && (await cssImpl(p))) {
      const cl0 = (await probe(p, () => window.__atlas.clusters())) ?? [];
      const g = cl0.filter((x) => x.srcs.length > 1 && x.opacity > 0).sort((a, b) => b.srcs.length - a.srcs.length)[0];
      const R0 = (await cssImpl(p))?.R;
      const t0 = await p.evaluate(() => performance.now());
      if (g) await p.mouse.click(box.x + g.x, box.y + g.y);
      await p.waitForTimeout(ATLAS_RECENTER_WAIT_MS);
      const t1 = await p.evaluate(() => performance.now());
      const st = await cssImpl(p);
      const cl1 = (await probe(p, () => window.__atlas.clusters())) ?? [];
      const parts = g ? cl1.filter((c) => c.srcs.some((s) => g.srcs.includes(s))) : [];
      const n = parts.reduce((a, c) => a + c.srcs.length, 0);
      const mx = n ? parts.reduce((a, c) => a + c.x * c.srcs.length, 0) / n : NaN;
      const my = n ? parts.reduce((a, c) => a + c.y * c.srcs.length, 0) / n : NaN;
      const off = Math.hypot(mx - (st?.width ?? 0) / 2, my - (st?.height ?? 0) / 2);
      const fr = (await p.evaluate(() => window.__atlasRec.frames)).filter((t) => t >= t0 && t <= t1);
      const deltas = fr.slice(1).map((t, k) => t - fr[k]);
      const long = deltas.slice(1).filter((d) => d > LONG_FRAME_MS).length;
      const panel = await p.evaluate(() => !!document.querySelector("[data-atlas-viewer]") || [...document.querySelectorAll("main span")].some((s) => /\d+ Photographs/.test(s.textContent) && s.closest("div.absolute")));
      log(`  clic en el grupo mas grande (${g?.srcs.length ?? 0} fotos): R ${rr(R0)} → ${rr(st?.R)} · queda en ${parts.length} grupos (${parts.map((c) => c.srcs.length).join("+")}) · media a ${off.toFixed(2)} px del centro · frames > ${LONG_FRAME_MS} ms: ${long}, peor ${rr(Math.max(0, ...deltas.slice(1)))} ms${panel ? " · se abrio el visor o la lista" : ""}`);
      addInv("atlas", "CA13 clic en un grupo: acerca hasta partirlo, centrado, sin frames > 50 ms", !!g && parts.length >= 2 && off < 2 && long === 0 && !panel,
        `${parts.length} grupos, ${off.toFixed(2)} px del centro, ${long} frames largos${panel ? ", se abrio el visor o la lista" : ""}`);
    }
    if (errs.length) log(`  errores: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // CA4 a CA7: un grupo que acabe en fotos que no se pueden partir (mismo
  // punto), con una foto city si la hay. Desde la enmienda 2 el clic en un
  // grupo acerca hasta partirlo, asi que se sigue pulsando el grupo de esa
  // foto hasta que se abre.
  const precisionOf = Object.fromEntries(AP.map((x) => [x.src, x.precision]));
  const coordOf = Object.fromEntries(AP.map((x) => [x.src, `${x.lat},${x.lng}`]));
  const twinIn = (g) => g.srcs.filter((s) => g.srcs.some((t) => t !== s && coordOf[t] === coordOf[s]));
  const pickGroup = (cl) => {
    const groups = cl.filter((x) => x.srcs.length > 1 && x.opacity > 0).sort((a, b) => b.srcs.length - a.srcs.length);
    return groups.find((x) => twinIn(x).some((s) => precisionOf[s] === "city")) ?? groups.find((x) => twinIn(x).length) ?? groups[0];
  };
  const groupOpen = (p) => p.evaluate(() => !!document.querySelector("[data-atlas-viewer]") || [...document.querySelectorAll("main span")].some((s) => /\d+ Photographs/.test(s.textContent) && s.closest("div.absolute"))).catch(() => false);
  async function openGroup(p, box) {
    let g = await clickCluster(p, box, pickGroup);
    if (!g) return null;
    const twins = twinIn(g);
    const anchor = twins.find((s) => precisionOf[s] === "city") ?? twins[0] ?? g.srcs[0];
    for (let k = 0; k < ATLAS_OPEN_MAX_CLICKS && !(await groupOpen(p)); k++) {
      const next = await clickCluster(p, box, (cl) => cl.find((x) => x.srcs.length > 1 && x.srcs.includes(anchor)));
      if (!next) break;
      g = next;
    }
    return g;
  }
  const viewerState = (p) => p.evaluate(() => {
    const v = document.querySelector("[data-atlas-viewer]");
    if (!v) return null;
    const ph = v.querySelector("[data-atlas-viewer-photo]");
    const img = ph?.querySelector("img");
    const b = img?.getBoundingClientRect();
    const vb = v.getBoundingClientRect();
    return {
      src: ph?.getAttribute("data-src") ?? null,
      text: v.innerText,
      thumbs: v.querySelectorAll("[data-atlas-viewer-thumb]").length,
      photo: b && img.naturalWidth ? { box: [b.left, b.top, b.right, b.bottom], dev: Math.abs(b.width / b.height / (img.naturalWidth / img.naturalHeight) - 1) } : null,
      rect: [vb.left, vb.top, vb.right, vb.bottom],
      vw: innerWidth,
      vh: innerHeight,
    };
  }).catch(() => null);
  {
    const { ctx, p, errs, box } = await atlasPage();
    if (box && (await cssImpl(p))) {
      const g = await openGroup(p, box);
      const Rg = (await cssImpl(p))?.R;
      log(`  grupo elegido: R al abrirlo ${rr(Rg)} · ${g ? `${g.srcs.length} fotos (${g.srcs.map((s) => `${s.split("/").slice(-2).join("/")}${precisionOf[s] === "city" ? "·c" : ""}`).join(", ")})` : "ninguno"}`);
      const v = await viewerState(p);
      const panel = await p.evaluate(() => [...document.querySelectorAll("main span")].some((s) => /\d+ Photographs/.test(s.textContent) && s.closest("div.absolute")));
      // Desde la enmienda 3 el visor recorre todo el atlas, en el orden del recorrido.
      const tour = (await probe(p, () => window.__atlas.tour?.() ?? null)) ?? [];
      log(`  visor: ${v ? `abierto · foto ${v.src} · ${v.thumbs} miniaturas · recorrido de ${tour.length} fotos` : "no hay [data-atlas-viewer]"}${panel ? " · sigue saliendo el panel de lista" : ""}`);
      const fits = !!v?.photo && v.photo.box[0] >= 0 && v.photo.box[1] >= 0 && v.photo.box[2] <= v.vw + 0.5 && v.photo.box[3] <= v.vh + 0.5;
      addInv("atlas", "CA4 clic en grupo abre el visor, no la lista", !!v && !panel, v ? "sigue el panel de lista" : "sin [data-atlas-viewer]");
      addInv("atlas", "CA4 foto grande entera en el viewport, proporcion < 1 %", fits && v.photo.dev < MAX_RATIO_DEVIATION,
        v?.photo ? `caja ${v.photo.box.map(rr)}, desvio ${v.photo.dev.toFixed(4)}` : "sin foto medible");
      addInv("atlas", "CA4 se abre en la primera foto del grupo pulsado", !!v && !!g && v.src === g.srcs[0], `abierto en ${v?.src}, primera del grupo ${g?.srcs[0]}`);
      addInv("atlas", "CA4 tira con una miniatura por foto del atlas", !!v && tour.length > 0 && v.thumbs === tour.length, `${v?.thumbs ?? 0} miniaturas, ${tour.length} fotos`);
      // CA5 y CA7: recorrer TODO el atlas con la flecha siguiente.
      if (v && g && tour.length) {
        const start = tour.indexOf(v.src);
        const expected = tour.map((_, k) => tour[(start + k) % tour.length]);
        const seen = [v.src];
        const dmsBad = [];
        const check = (st) => { if (st && precisionOf[st.src] === "city" && DMS_RE.test(st.text)) dmsBad.push(st.src); };
        check(v);
        for (let k = 1; k < tour.length; k++) {
          await p.click("[data-atlas-viewer-next]").catch(() => {});
          await p.waitForTimeout(250);
          const st = await viewerState(p);
          seen.push(st?.src ?? null);
          check(st);
        }
        const inOrder = seen.length === expected.length && seen.every((s, k) => s === expected[k]);
        log(`  recorrido con la flecha (${seen.length} fotos): ${seen.map((s) => (s ? s.split("/").slice(-2).join("/") : "—")).join(" → ")}`);
        addInv("atlas", "CA5 la flecha pasa por todas las fotos del atlas, en el orden del recorrido, sin repetir", inOrder, `visto ${seen.join(", ")}`);
        const hasCity = seen.some((s) => precisionOf[s] === "city");
        addInv("atlas", "CA7 sin coordenadas DMS en fotos city", hasCity && dmsBad.length === 0, hasCity ? `DMS en ${dmsBad.join(", ")}` : "el recorrido no tiene fotos city");
        // CA6: el globo sigue visible y responde a un arrastre.
        const cover = Math.max(0, Math.min(box.x + box.w, v.rect[2]) - Math.max(box.x, v.rect[0])) * Math.max(0, Math.min(box.y + box.h, v.rect[3]) - Math.max(box.y, v.rect[1])) / (box.w * box.h);
        const l0 = (await cssImpl(p))?.lambda0;
        const sx = box.x + box.w * 0.15, sy = box.y + box.h * 0.3;
        await p.mouse.move(sx, sy);
        await p.mouse.down();
        for (let k = 1; k <= 10; k++) await p.mouse.move(sx + k * 12, sy);
        await p.mouse.up();
        await p.waitForTimeout(200);
        const l1 = (await cssImpl(p))?.lambda0;
        log(`  globo con el visor abierto: tapado ${(cover * 100).toFixed(1)} % · lambda0 ${l0?.toFixed(4)} → ${l1?.toFixed(4)}`);
        addInv("atlas", `CA6 visor tapa <= ${ATLAS_VIEWER_MAX_COVER * 100} % del canvas`, cover <= ATLAS_VIEWER_MAX_COVER, `${(cover * 100).toFixed(1)} %`);
        addInv("atlas", "CA6 el globo responde a un arrastre con el visor abierto", l0 !== undefined && l1 !== undefined && Math.abs(l1 - l0) > 1e-4, `lambda0 ${l0} → ${l1}`);
      } else {
        for (const n of ["CA5 la flecha pasa por todas las fotos del atlas, en el orden del recorrido, sin repetir", "CA7 sin coordenadas DMS en fotos city", `CA6 visor tapa <= ${ATLAS_VIEWER_MAX_COVER * 100} % del canvas`, "CA6 el globo responde a un arrastre con el visor abierto"]) addInv("atlas", n, false, "sin visor");
      }
    }
    if (errs.length) log(`  errores: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // CA14 a CA16: el recorrido por todo el atlas (spec 016, enmienda 3).
  {
    const { ctx, p, errs, box } = await atlasPage();
    const tour = box ? (await probe(p, () => window.__atlas.tour?.() ?? null)) ?? [] : [];
    if (box && tour.length) {
      const bySrc = Object.fromEntries(AP.map((x) => [x.src, x]));
      const pts = tour.map((s) => bySrc[s]);
      const cityOf = (x) => `${x.city}`;
      // CA14: cada ciudad en un solo tramo, y mas corto que el orden de los albumes.
      const runs = [];
      for (const x of pts) if (!runs.length || runs[runs.length - 1] !== cityOf(x)) runs.push(cityOf(x));
      const contiguous = new Set(runs).size === runs.length;
      const len = (arr) => arr.slice(1).reduce((a, x, k) => a + angDist(arr[k], x), 0);
      const albumOrder = AP.filter((x) => tour.includes(x.src));
      const tourKm = len(pts) * 6371, albumKm = len(albumOrder) * 6371;
      log(`  recorrido: ${runs.join(" → ")} · ${rr(tourKm)} km (en orden de albumes: ${rr(albumKm)} km)`);
      addInv("atlas", "CA14 recorrido: cada ciudad en un tramo, mas corto que el orden de los albumes", contiguous && tourKm < albumKm, `${contiguous ? "" : "ciudades partidas; "}${rr(tourKm)} km frente a ${rr(albumKm)} km`);
      // CA16: el boton abre el visor en la primera foto del recorrido.
      await p.click("[data-atlas-tour]").catch(() => {});
      await p.waitForTimeout(ATLAS_FLIGHT_WAIT_MS);
      const v0 = await viewerState(p);
      log(`  boton de entrada: ${v0 ? `visor en ${v0.src}` : "no abre el visor"}`);
      addInv("atlas", "CA16 el boton abre el visor en la primera foto del recorrido", v0?.src === tour[0], `visor en ${v0?.src ?? "—"}, primera ${tour[0]}`);
      // CA15: el salto mas largo entre lugares seguidos del recorrido.
      let far = -1, farD = 0;
      for (let k = 0; k + 1 < pts.length; k++) {
        const dd = angDist(pts[k], pts[k + 1]);
        if (dd > farD) { farD = dd; far = k; }
      }
      if (v0 && far >= 0) {
        for (let k = 0; k < far; k++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60); }
        await p.waitForTimeout(ATLAS_FLIGHT_WAIT_MS);
        const t0 = await p.evaluate(() => performance.now());
        await p.keyboard.press("ArrowRight");
        await p.waitForTimeout(ATLAS_FLIGHT_WAIT_MS);
        const t1 = await p.evaluate(() => performance.now());
        const st = await cssImpl(p);
        const target = pts[far + 1];
        const centre = { lat: (st.phi0 * 180) / Math.PI, lng: (st.lambda0 * 180) / Math.PI };
        const offPx = angDist(centre, target) * st.R;
        const regionR = Math.min(st.width, st.height) / (2500 / 6371);
        const fr = (await p.evaluate(() => window.__atlasRec.frames)).filter((t) => t >= t0 && t <= t1);
        const deltas = fr.slice(1).map((t, k) => t - fr[k]);
        const long = deltas.slice(1).filter((d) => d > LONG_FRAME_MS).length;
        const vNow = await viewerState(p);
        log(`  vuelo ${pts[far].city} → ${target.city} (${rr(farD * 6371)} km): centro a ${offPx.toFixed(2)} px de la foto · R ${rr(st.R)} (regional ${rr(regionR)}) · frames > ${LONG_FRAME_MS} ms: ${long}, peor ${rr(Math.max(0, ...deltas.slice(1)))} ms · visor en ${vNow?.src}`);
        addInv("atlas", "CA15 vuelo al lugar siguiente: centrado, en vista regional, sin frames > 50 ms",
          offPx < 2 && Math.abs(st.R / regionR - 1) < 0.01 && long === 0 && vNow?.src === target.src,
          `${offPx.toFixed(2)} px, R ${rr(st.R)} frente a ${rr(regionR)}, ${long} frames largos, visor en ${vNow?.src}`);
      } else {
        addInv("atlas", "CA15 vuelo al lugar siguiente: centrado, en vista regional, sin frames > 50 ms", false, "sin visor o sin recorrido");
      }
    } else {
      for (const n of ["CA14 recorrido: cada ciudad en un tramo, mas corto que el orden de los albumes", "CA16 el boton abre el visor en la primera foto del recorrido", "CA15 vuelo al lugar siguiente: centrado, en vista regional, sin frames > 50 ms"]) addInv("atlas", n, false, "la sonda no expone el recorrido");
    }
    if (errs.length) log(`  errores: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // CA8: reduced motion, el visor aparece ya en su estado final.
  {
    const { ctx, p, errs, box } = await atlasPage({ reducedMotion: "reduce" });
    if (box && (await cssImpl(p))) {
      await openGroup(p, box);
      const first = await p.evaluate(() => window.__atlasRec.viewer[0] ?? null);
      const flat = first && +first[1] === 1 && (first[2] === "none" || first[2] === "matrix(1, 0, 0, 1, 0, 0)");
      log(`  reduced motion: primera muestra del visor ${first ? `opacity ${first[1]} · transform ${first[2]}` : "—"}`);
      addInv("atlas", "CA8 reduced motion: visor sin fundido ni desplazamiento", !!flat, first ? `opacity ${first[1]}, transform ${first[2]}` : "sin visor");
    }
    if (errs.length) log(`  errores: ${errs.join(" | ")}`);
    await ctx.close();
  }

  // CA10: toda pareja exact distinta que no se separa a R = 4563 cae en una zona.
  {
    const zonesUrl = new URL("../src/data/atlas-zones.json", import.meta.url);
    const zonesJson = existsSync(zonesUrl) ? JSON.parse(readFileSync(zonesUrl, "utf8")) : null;
    const zones = zonesJson ? zonesJson.zones ?? [] : null;
    // Ciudades sin zona por decision de Javi (spec 016, enmienda 2): se quedan agrupadas.
    const excluded = zonesJson?.excludedCities ?? [];
    const inBox = (pt, b) => pt.lat >= b[0] && pt.lng >= b[1] && pt.lat <= b[2] && pt.lng <= b[3];
    const need = [];
    for (let i = 0; i < exact.length; i++) for (let j = i + 1; j < exact.length; j++) {
      const a = angDist(exact[i], exact[j]);
      if (excluded.includes(exact[i].city) || excluded.includes(exact[j].city)) continue;
      if (a > 1e-9 && a * ATLAS_WORLD_MAX_R < ATLAS_CLUSTER_PX * ATLAS_ZONE_MARGIN) need.push([exact[i], exact[j]]);
    }
    const out = zones === null ? need : need.filter(([a, b]) => !zones.some((z) => inBox(a, z.bbox) && inBox(b, z.bbox)));
    log(`  zonas: ${zones === null ? "no existe src/data/atlas-zones.json" : `${zones.length} (${zones.map((z) => z.name).join(", ")})${excluded.length ? ` · excluidas: ${excluded.join(", ")}` : ""}`} · parejas que necesitan zona: ${need.length} · fuera de zona: ${out.length}`);
    addInv("atlas", "CA10 toda pareja exact sin separar a R 4563 cae en una zona (salvo ciudades excluidas)", out.length === 0, `${out.length} parejas fuera${zones === null ? " (sin atlas-zones.json)" : ""}`);
  }

  // CA11 y CA12: zoom con el centro fuera de toda zona, y la cita de OSM.
  {
    const { ctx, p, errs, box } = await atlasPage();
    if (box && (await cssImpl(p))) {
      const z = await zoomToMax(p, box);
      log(`  fuera de zona (encuadre por defecto): ${z.steps} pasos · R final ${rr(z.R)}`);
      addInv("atlas", `CA11 fuera de zona el zoom se para en R <= ${ATLAS_WORLD_MAX_R}`, z.R > 0 && z.R <= ATLAS_WORLD_MAX_R + 0.5, `R ${rr(z.R)}`);
    }
    const osm = await p.evaluate(() => {
      const main = [...document.querySelectorAll("main")].find((el) => getComputedStyle(el).display !== "none");
      return !!main && main.innerText.includes("OpenStreetMap");
    }).catch(() => false);
    addInv("atlas", "CA12 cita de OpenStreetMap visible", osm, "no esta en el texto visible de /atlas");
    if (errs.length) log(`  errores: ${errs.join(" | ")}`);
    await ctx.close();
  }
}

await browser.close();
killDev();

// ---------- resumen ----------
const failed = results.invariants.filter((i) => !i.ok);
const totalConsole = Object.values(results.console).reduce((a, b) => a + b, 0);
rule("RESUMEN");
log(`tsc          ${skipStatic ? "omitido" : results.tsc === 0 ? "ok" : `${results.tsc} errores`}`);
log(`lint         ${skipStatic ? "omitido" : results.lint === "ok" || results.lint === "" ? "ok" : String(results.lint).split("\n").pop()}`);
log(`build        ${skipStatic ? "omitido" : results.build}`);
log(`consola      ${totalConsole} errores en ${Object.keys(results.console).length} rutas`);
log(`invariantes  ${results.invariants.length - failed.length} de ${results.invariants.length}`);
if (results.entrance.length) {
  const med = (key) => {
    const v = results.entrance.map((e) => e[key]).filter((x) => x !== null).sort((x, y) => x - y);
    return v.length ? v[Math.floor((v.length - 1) / 2)] : "—";
  };
  log(`entrada      arranque ${med("startFrame")} ms · fase B ${med("phaseB")} ms · reposo ${med("rest")} ms · frames >${LONG_FRAME_MS} ms: ${med("longFrames")}${results.entrance.length > 1 ? ` (medianas de ${results.entrance.length})` : ""}`);
}
if (failed.length) { log("\nFALLOS"); failed.forEach((f) => log(`- ${f.route} · ${f.name} · ${f.detail}`)); }
log("");
const lintFailed = !skipStatic && results.lint !== "ok" && results.lint !== "";
process.exit(failed.length || totalConsole || results.tsc || lintFailed ? 1 : 0);

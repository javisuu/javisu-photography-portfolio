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

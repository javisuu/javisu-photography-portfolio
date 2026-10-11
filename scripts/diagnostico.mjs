#!/usr/bin/env node
// Diagnostico del sitio. Mide; no arregla nada.
//   node scripts/diagnostico.mjs                 run completo
//   node scripts/diagnostico.mjs --skip-build     sin next build (mas rapido)
//   node scripts/diagnostico.mjs --medir /atlas   solo mide una ruta
// Requiere: npm i -D playwright && npx playwright install chromium

import { spawn, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const PORT = 3100;
// localhost, no 127.0.0.1: next dev solo admite los origenes localhost y
// **.localhost para /_next/* y responde 403 a los chunks JS pedidos desde
// cualquier otro (node_modules/next/dist/server/lib/router-utils/
// block-cross-site-dev.js), con lo que el cliente nunca se hidrata.
const BASE = `http://localhost:${PORT}`;
const SETTLE_MS = 3500;
const args = process.argv.slice(2);
const only = args.includes("--medir") ? args[args.indexOf("--medir") + 1] || "/" : null;
// Git Bash convierte "/atlas" en "C:/Program Files/Git/atlas" antes de que
// llegue aqui; mediriamos una ruta inexistente sin enterarnos.
if (only && !only.startsWith("/")) {
  console.log(`ruta invalida: ${JSON.stringify(only)}. En Git Bash: MSYS_NO_PATHCONV=1 node scripts/diagnostico.mjs --medir /ruta`);
  process.exit(2);
}
const skipBuild = args.includes("--skip-build") || !!only;

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

const results = { tsc: null, lint: null, build: null, console: {}, invariants: [] };

// ---------- estatico ----------
if (!only) {
  rule("tsc --noEmit");
  const r = sh("npx tsc --noEmit");
  const errs = (r.out.match(/error TS\d+/g) || []).length;
  results.tsc = errs;
  log(errs ? r.out.trim() : "ok");

  rule("eslint");
  const l = sh("npx eslint src");
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
// Con shell:true, dev.kill() en Windows mata solo la shell y deja next dev
// vivo en el puerto; hay que matar el arbol entero.
const killDev = () => (process.platform === "win32" ? sh(`taskkill /PID ${dev.pid} /T /F`) : dev.kill("SIGTERM"));

async function waitForServer(ms = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE, { signal: AbortSignal.timeout(4000) }); if (r.ok || r.status < 500) return true; }
    catch { /* todavia no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
if (!(await waitForServer())) { log("el servidor de desarrollo no respondio en 90 s"); log(devLog.slice(-1500)); killDev(); process.exit(2); }
log("ok");

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

await browser.close();
killDev();

// ---------- resumen ----------
const failed = results.invariants.filter((i) => !i.ok);
const totalConsole = Object.values(results.console).reduce((a, b) => a + b, 0);
rule("RESUMEN");
log(`tsc          ${only ? "omitido" : results.tsc === 0 ? "ok" : `${results.tsc} errores`}`);
log(`lint         ${only ? "omitido" : results.lint === "ok" || results.lint === "" ? "ok" : String(results.lint).split("\n").pop()}`);
log(`build        ${only ? "omitido" : results.build}`);
log(`consola      ${totalConsole} errores en ${Object.keys(results.console).length} rutas`);
log(`invariantes  ${results.invariants.length - failed.length} de ${results.invariants.length}`);
if (failed.length) { log("\nFALLOS"); failed.forEach((f) => log(`- ${f.route} · ${f.name} · ${f.detail}`)); }
log("");
process.exit(failed.length || totalConsole || results.tsc ? 1 : 0);

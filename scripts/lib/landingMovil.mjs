// Seccion `landing-movil` del diagnostico (spec 021): el landing en movil.
// Composicion (fotos enteras a lo ancho y a lo alto, 40-65 % del ancho en el
// telefono en vertical, <= 300 px de alto en horizontal), sin GL ni Lenis,
// scroll nativo y finito, parallax 0,9-1,1, wordmark y descriptor a su
// tamaño movil y el panel que salta una vez al llegar al final.
//
// Solo en modo dispositivo, y solo si el perfil es movil (la misma media
// query que la variante `movil:`, MOVIL de ./navegacion.mjs).
//
// Arrastres: toques reales por CDP (solo chromium), sin inercia: el dedo se
// queda quieto antes de soltar, asi el scroll recorre exactamente lo que se
// arrastra (CA8) y cada paso deja la pagina en un sitio medible. En webkit no
// hay CDP: la geometria se mide con scrollTo y lo tactil sale NO MEDIBLE.

import { MOVIL, MOVIL_H } from "./navegacion.mjs";
import { applyCpu, frameRecorder, frameStats } from "./dispositivo.mjs";

const ESPERA_LANDING = 3500;
const ALTO_BARRA = 78, ALTO_BARRA_H = 57, MARGEN_H = 47;
const ALTO_MAX_H = 300;
const ANCHO_MIN = 0.40, ANCHO_MAX = 0.65;
const PASO = 0.4; // fraccion del alto del viewport por arrastre
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => (x == null ? "—" : Math.round(x * 10) / 10);

// Un dedo de (x, y0) a (x, y1), y quieto 160 ms antes de soltar: sin inercia.
async function arrastre(cdp, x, y0, y1, pasos = 14) {
  const pt = (y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(y0) });
  for (let i = 1; i <= pasos; i++) {
    await wait(16);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(y0 + (y1 - y0) * (i / pasos)) });
  }
  for (let i = 0; i < 10; i++) {
    await wait(16);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(y1) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(120);
}

// CA8 dentro de un solo toque: el navegador no empieza a desplazar hasta que
// el dedo pasa su umbral de arrastre (~15 px en Chromium emulado; T0 y T3
// dieron 14,6-15,8 px de diferencia con y sin Lenis). El dedo baja primero
// 30 px, se mide scrollY, y solo entonces se arrastran los N px que cuentan.
const UMBRAL_DEDO = 30;
async function arrastreMedido(cdp, p, x, y0, dy, pasos = 14) {
  const pt = (y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
  const mover = async (y) => { await wait(16); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(y) }); };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(y0) });
  for (let i = 1; i <= 4; i++) await mover(y0 - (UMBRAL_DEDO * i) / 4);
  for (let i = 0; i < 4; i++) await mover(y0 - UMBRAL_DEDO);
  await wait(60);
  const antes = await p.evaluate(() => window.scrollY);
  const yA = y0 - UMBRAL_DEDO;
  for (let i = 1; i <= pasos; i++) await mover(yA - (dy * i) / pasos);
  for (let i = 0; i < 10; i++) await mover(yA - dy);
  await wait(60);
  const despues = await p.evaluate(() => window.scrollY);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await wait(120);
  return despues - antes;
}

// En la pagina: las fotos del landing, el wordmark, el descriptor, el panel.
function medirLanding() {
  const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
  const fotos = [...(main?.querySelectorAll(".landing-photo") ?? [])]
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => {
      const img = el.querySelector("img");
      const b = (img ?? el).getBoundingClientRect();
      const nw = img?.naturalWidth || +img?.getAttribute("width") || 0;
      const nh = img?.naturalHeight || +img?.getAttribute("height") || 0;
      const src = (img?.currentSrc || img?.src || "").split("url=").pop().split("&")[0].split("%2F").slice(-2).join("/").slice(0, 40);
      return { src, l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height, nw, nh, oculta: img ? getComputedStyle(img).visibility === "hidden" : false };
    });
  const lienzos = [...(main?.querySelectorAll("canvas") ?? [])].filter((c) => getComputedStyle(c).display !== "none" && c.getBoundingClientRect().width > 0).length;
  const h1 = [...document.querySelectorAll("h1")].find((h) => getComputedStyle(h).mixBlendMode === "difference");
  let texto = null;
  if (h1) {
    // La tinta del nombre, no la caja del texto: un Range sobre el <h1> mete
    // el pie "JAVIER SUAREZ SUQUIA" (absoluto, mas ancho) y el area de
    // contenido de la fuente (125 px para 78 px). Ancho: la caja inline-block
    // de las letras (la raiz de DecipherWordmark). Alto: measureText de las
    // letras desde su linea base, que da un span de 0x0 metido un instante.
    const raiz = h1.firstElementChild ?? h1;
    const rr = raiz.getBoundingClientRect();
    const cs = getComputedStyle(h1);
    const base = document.createElement("span");
    base.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    raiz.appendChild(base);
    const yBase = base.getBoundingClientRect().top;
    base.remove();
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ("fontKerning" in ctx) ctx.fontKerning = "none";
    const mt = ctx.measureText((raiz.textContent || "SUQUIA").trim().slice(0, 6));
    texto = { l: rr.left, r: rr.right, t: yBase - mt.actualBoundingBoxAscent, b: yBase + mt.actualBoundingBoxDescent, w: rr.width };
    texto.h = texto.b - texto.t;
  }
  const desc = [...document.querySelectorAll("p")].find((p) => /selected photographs/i.test(p.textContent) && getComputedStyle(p).position === "fixed");
  const db = desc?.getBoundingClientRect();
  const disparador = document.querySelector("[data-panel-disparador]");
  return {
    vw: innerWidth, vh: innerHeight, y: scrollY, fin: document.documentElement.scrollHeight - innerHeight,
    lenis: document.documentElement.classList.contains("lenis"),
    fotos, lienzos,
    h1: h1 ? { fs: parseFloat(getComputedStyle(h1).fontSize), texto } : null,
    desc: desc ? { fs: parseFloat(getComputedStyle(desc).fontSize), l: db.left, t: db.top, r: db.right, b: db.bottom, h: db.height } : null,
    panel: disparador?.getAttribute("aria-expanded") === "true",
  };
}

export async function seccionLandingMovil({ browser, BASE, CTX, log, rule, addInv, motor, cpu, noMedible }) {
  rule("landing-movil");
  const nuevo = async (opts = {}) => {
    const ctx = await browser.newContext({ ...CTX, ...opts });
    await ctx.addInitScript(() => {
      const ocultar = () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.documentElement.appendChild(st); };
      if (document.documentElement) ocultar(); else document.addEventListener("DOMContentLoaded", ocultar);
    });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
    await p.goto(BASE + "/", { waitUntil: "load", timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(ESPERA_LANDING);
    const cdp = motor === "chromium" ? await ctx.newCDPSession(p) : null;
    return { ctx, p, cdp, errores };
  };

  const { ctx, p, cdp, errores } = await nuevo();
  const [movil, horizontal] = await p.evaluate(([a, b]) => [matchMedia(a).matches, matchMedia(b).matches], [MOVIL, MOVIL_H]);
  log(`  ${CTX.viewport.width}x${CTX.viewport.height} · movil ${movil} · horizontal ${horizontal}`);
  if (!movil) {
    log("  no es movil: seccion omitida");
    await ctx.close();
    return;
  }
  const telefono = !horizontal && CTX.viewport.width < 600;
  const tablet = !horizontal && !telefono;
  const altoBarra = horizontal ? ALTO_BARRA_H : ALTO_BARRA;
  const cpuOk = cpu > 1 ? await applyCpu(ctx, p, { motor, cpu }) : false;

  // ---- reposo: GL, Lenis, wordmark, descriptor ----
  let m = await p.evaluate(medirLanding);
  log(`  reposo · fotos visibles ${m.fotos.length} · lienzos ${m.lienzos} · lenis ${m.lenis} · h1 ${m.h1?.fs} px · descriptor ${m.desc?.fs} px, alto ${r1(m.desc?.h)}`);
  addInv("/", "landing-movil · CA7 sin canvas GL ni <img> ocultas", m.lienzos === 0 && m.fotos.every((f) => !f.oculta), `lienzos ${m.lienzos}, ocultas ${m.fotos.filter((f) => f.oculta).length}`);
  addInv("/", "landing-movil · CA8 sin Lenis (html sin .lenis)", !m.lenis, `lenis ${m.lenis}`);
  const fsEsperado = horizontal ? 96 : telefono ? 78 : null;
  if (fsEsperado) addInv("/", `landing-movil · CA11 wordmark a ${fsEsperado} px`, m.h1 && Math.abs(m.h1.fs - fsEsperado) <= 0.5, `${m.h1?.fs}`);
  if (!horizontal && m.h1?.texto) addInv("/", "landing-movil · CA11 wordmark con >= 40 px de margen a cada lado", m.h1.texto.l >= 40 && m.vw - m.h1.texto.r >= 40, `${r1(m.h1.texto.l)} / ${r1(m.vw - m.h1.texto.r)}`);
  if (m.desc) {
    const lineas = horizontal ? m.desc.h <= 17 : Math.abs(m.desc.h - 36) <= 1;
    const t = m.h1?.texto;
    const libre = !t || m.desc.t >= t.b - 0.5 || m.desc.b <= t.t + 0.5;
    addInv("/", `landing-movil · CA12 descriptor a 12 px en ${horizontal ? "una linea" : "dos lineas"}, sin cortar el nombre, encima de la barra`, Math.abs(m.desc.fs - 12) <= 0.25 && lineas && libre && m.desc.b <= m.vh - altoBarra + 0.5, `${m.desc.fs} px, alto ${r1(m.desc.h)}, ${r1(m.desc.t)}-${r1(m.desc.b)} frente al nombre ${r1(t?.t)}-${r1(t?.b)}`);
  } else addInv("/", "landing-movil · CA12 descriptor", false, "no encontrado");

  // ---- geometria por paso (CA3, CA4, CA5) y fluidez (CA14) ----
  const malos = { ancho: new Set(), fuera: new Set(), fraccion: new Set(), alto: new Set() };
  const fracciones = new Map();
  const revisar = (m) => {
    for (const f of m.fotos) {
      if (!(f.b > 0 && f.t < m.vh)) continue;
      if (f.h > m.vh + 0.5 || f.w > m.vw + 0.5) malos.ancho.add(`${f.src} ${Math.round(f.w)}x${Math.round(f.h)}`);
      if (f.l < -0.5 || f.r > m.vw + 0.5) malos.fuera.add(`${f.src} ${r1(f.l)}..${r1(f.r)}`);
      fracciones.set(f.src, f.w / m.vw);
      if (!horizontal && (f.w / m.vw < ANCHO_MIN - 0.005 || f.w / m.vw > ANCHO_MAX + 0.005)) malos.fraccion.add(`${f.src} ${(f.w / m.vw * 100).toFixed(1)} %`);
      if (horizontal && (f.h > ALTO_MAX_H + 0.5 || f.l < MARGEN_H - 0.5 || f.r > m.vw - MARGEN_H + 0.5)) malos.alto.add(`${f.src} ${Math.round(f.w)}x${Math.round(f.h)} en ${r1(f.l)}..${r1(f.r)}`);
    }
  };
  revisar(m);

  if (!cdp) {
    // webkit: geometria con scrollTo; lo tactil no se puede medir.
    for (let y = 0; y <= m.fin; y += m.vh * PASO) {
      await p.evaluate((y) => scrollTo(0, y), y);
      await p.waitForTimeout(80);
      revisar(await p.evaluate(medirLanding));
    }
    for (const c of ["CA8 arrastre", "CA9 final", "CA10 parallax", "CA13 panel al final", "CA14 fluidez"]) noMedible.push(`landing-movil · ${c} (${motor}: sin CDP)`);
  } else {
    const x = m.vw / 2;
    const dy = m.vh * PASO;
    const y0 = m.vh * 0.7, y1 = y0 - dy;
    await p.evaluate(frameRecorder);

    // CA8: un arrastre sin inercia mueve scrollY lo mismo que el dedo.
    const movido = await arrastreMedido(cdp, p, x, y0, dy);
    m = await p.evaluate(medirLanding);
    addInv("/", "landing-movil · CA8 arrastre de N px mueve scrollY N ± 2 px (pasado el umbral del dedo)", Math.abs(movido - dy) <= 2, `dedo ${r1(dy)}, scroll ${r1(movido)}`);
    revisar(m);

    // Hacia abajo hasta el final: geometria en cada paso, panel, monotonia.
    let panel = null, retrocesos = 0, quietos = 0, pasos = 0, ultimo = m.y;
    while (quietos < 2 && pasos < 120) {
      await arrastre(cdp, x, y0, y1);
      pasos++;
      m = await p.evaluate(medirLanding);
      if (m.panel && !panel) {
        panel = { y: m.y, paso: pasos };
        const ultima = m.fotos[m.fotos.length - 1];
        panel.centro = ultima ? (ultima.t + ultima.b) / 2 - m.vh / 2 : null;
        // Con el panel abierto, un arrastre de 1000 px no mueve el landing.
        await arrastre(cdp, x, m.vh * 0.9, m.vh * 0.9 - 1000, 20).catch(() => {});
        panel.yQuieto = await p.evaluate(() => scrollY);
        await p.evaluate(() => document.querySelector("[data-panel-cerrar]")?.click());
        await p.waitForTimeout(500);
        panel.yTras = await p.evaluate(() => scrollY);
        panel.cerrado = !(await p.evaluate(medirLanding)).panel;
        m = await p.evaluate(medirLanding);
      }
      revisar(m);
      if (m.y < ultimo - 0.5) retrocesos++;
      quietos = Math.abs(m.y - ultimo) < 0.5 ? quietos + 1 : 0;
      ultimo = m.y;
    }
    const fps = frameStats(await p.evaluate(() => { window.__framesOn = false; return window.__frames; }));
    log(`  hasta el final: ${pasos} arrastres · scrollY ${r1(m.y)} de ${r1(m.fin)} · fotos visibles ${m.fotos.length} · frames ${JSON.stringify(fps)}${cpuOk ? ` · cpu x${cpu}` : ""}`);

    // CA9: hay final, sin vuelta, 15 fotos, la ultima entera encima de la barra.
    const ultima = m.fotos[m.fotos.length - 1];
    const ultimaOk = !!ultima && ultima.t >= 0 && ultima.b <= m.vh - altoBarra + 0.5;
    addInv("/", "landing-movil · CA9 final sin vuelta, 15 fotos, la ultima entera encima de la barra",
      Math.abs(m.y - m.fin) <= 1 && retrocesos === 0 && m.fotos.length === 15 && ultimaOk,
      `scrollY ${r1(m.y)} / fin ${r1(m.fin)}, retrocesos ${retrocesos}, fotos ${m.fotos.length}, ultima ${ultima ? `${r1(ultima.t)}-${r1(ultima.b)}` : "—"} frente a la barra ${m.vh - altoBarra}`);

    // CA13: el panel salta una vez, cuando la ultima foto cruza el centro.
    addInv("/", "landing-movil · CA13 el panel salta al llegar al final, quieto mientras esta abierto, y Close vuelve al mismo sitio",
      !!panel && panel.centro !== null && panel.centro <= 0.5 && Math.abs(panel.yQuieto - panel.y) <= 1 && Math.abs(panel.yTras - panel.y) <= 1 && panel.cerrado,
      panel ? `paso ${panel.paso}, centro de la ultima ${r1(panel.centro)} px del centro, scrollY ${r1(panel.y)} → quieto ${r1(panel.yQuieto)} → tras Close ${r1(panel.yTras)}, cerrado ${panel.cerrado}` : "no salto");
    // Subir y volver a bajar: no vuelve a saltar.
    for (let i = 0; i < 4; i++) await arrastre(cdp, x, y1, y0);
    let otraVez = false;
    for (let i = 0; i < 8; i++) { await arrastre(cdp, x, y0, y1); if ((await p.evaluate(medirLanding)).panel) { otraVez = true; break; } }
    addInv("/", "landing-movil · CA13 una sola vez por visita", !otraVez, otraVez ? "salto otra vez" : "");

    if (cpu > 1) {
      if (cpuOk) addInv("/", `landing-movil · CA14 scroll sin frames > 50 ms (cpu x${cpu})`, fps && fps.long === 0, JSON.stringify(fps));
      else noMedible.push(`landing-movil · CA14 cpu x${cpu}`);
    }

    // CA10: parallax entre dos puntos a 200 px.
    const parallax = async (pg, c) => {
      await pg.evaluate(() => scrollTo(0, Math.round(innerHeight * 0.5)));
      await pg.waitForTimeout(200);
      const a = await pg.evaluate(medirLanding);
      await arrastre(c, x, y0, y0 - 200);
      await pg.waitForTimeout(100);
      const b = await pg.evaluate(medirLanding);
      const d = b.y - a.y;
      const ratios = a.fotos.map((f, i) => (f.t - b.fotos[i].t) / d).filter((v) => Number.isFinite(v));
      return { d, min: Math.min(...ratios), max: Math.max(...ratios) };
    };
    const pr = await parallax(p, cdp);
    addInv("/", "landing-movil · CA10 cada foto se mueve 0,9-1,1 veces el scroll", pr.min >= 0.9 && pr.max <= 1.1, `scroll ${r1(pr.d)}, de ${pr.min.toFixed(3)} a ${pr.max.toFixed(3)}`);
    const red = await nuevo({ reducedMotion: "reduce" });
    const rr = await parallax(red.p, red.cdp);
    addInv("/", "landing-movil · CA10 con reduced motion, todas 1,0 ± 0,01", rr.min >= 0.99 && rr.max <= 1.01, `scroll ${r1(rr.d)}, de ${rr.min.toFixed(3)} a ${rr.max.toFixed(3)}`);
    await red.ctx.close();

    // CA13: una carga nueva vuelve a saltar.
    const otra = await nuevo();
    let salto = false;
    for (let i = 0; i < 120 && !salto; i++) {
      await arrastre(otra.cdp, x, y0, y1);
      const mm = await otra.p.evaluate(medirLanding);
      salto = mm.panel;
      if (Math.abs(mm.y - mm.fin) <= 1) break;
    }
    addInv("/", "landing-movil · CA13 en una carga nueva salta otra vez", salto, salto ? "" : "no salto");
    await otra.ctx.close();
  }

  log(`  anchos (fraccion del viewport): ${[...fracciones].map(([s, f]) => `${s} ${(f * 100).toFixed(1)}`).join(" · ")}`);
  addInv("/", "landing-movil · CA3 cada foto en pantalla cabe a lo alto y a lo ancho", malos.ancho.size === 0, [...malos.ancho].slice(0, 4).join(" | "));
  addInv("/", "landing-movil · CA3 ninguna foto sale por los lados", malos.fuera.size === 0, `${malos.fuera.size}: ${[...malos.fuera].slice(0, 4).join(" | ")}`);
  if (!horizontal) addInv("/", `landing-movil · CA4 ancho de cada foto entre el 40 y el 65 %${tablet ? " (tablet)" : ""}`, malos.fraccion.size === 0, `${malos.fraccion.size}: ${[...malos.fraccion].slice(0, 4).join(" | ")}`);
  if (horizontal) addInv("/", `landing-movil · CA5 ninguna foto de mas de ${ALTO_MAX_H} px ni fuera de los ${MARGEN_H} px`, malos.alto.size === 0, `${malos.alto.size}: ${[...malos.alto].slice(0, 4).join(" | ")}`);

  // CA7: un iPad cargado en vertical que gira sigue sin canvas y sin errores.
  if (tablet) {
    await p.setViewportSize({ width: CTX.viewport.height, height: CTX.viewport.width });
    await p.waitForTimeout(1500);
    const g = await p.evaluate(medirLanding);
    addInv("/", "landing-movil · CA7 tras girar a horizontal, sin canvas y sin errores", g.lienzos === 0 && errores.length === 0, `lienzos ${g.lienzos}, errores ${errores.slice(0, 2).join(" | ")}`);
  }
  await ctx.close();
}

// Seccion `navegacion` del diagnostico (spec 020): la barra inferior, el
// panel de SUQUIA y la barra del album en movil, y que nada de eso exista
// fuera de movil. Corre con el contexto de la ejecucion (CTX): en escritorio
// o con --dispositivo. Movil es la misma condicion que la variante `movil:`
// de src/app/globals.css; si cambia alli, cambia aqui.
//
// Toques reales: page.touchscreen (CDP en chromium, nativo en webkit). El
// arrastre de 1000 px con el panel abierto necesita CDP: en webkit sale NO
// MEDIBLE. Las duraciones del panel se miden por frames en chromium; en
// webkit sin ventana el muestreo da 168-474 ms para la misma transicion
// (specs/020-navegacion-movil/tasks.md, T4), asi que alli se comprueba la
// duracion CSS declarada.
//
// WebKit (como iOS) reasigna un clic hasta ~15 px al boton mas cercano: los
// toques de CA6 van a >= 30 px de la banda de SUQUIA (tasks.md, T4).

export const MOVIL = "(pointer: coarse) and (orientation: portrait) and (max-width: 1024px), (pointer: coarse) and (orientation: landscape) and (max-height: 500px)";
export const MOVIL_H = "(pointer: coarse) and (orientation: landscape) and (max-height: 500px)";

const ALTO_BARRA = 78, ALTO_BARRA_H = 57, MARGEN_H = 47;
const DESTINOS = { "/about": "ABOUT ME", "/albums": "ALBUMS", "/atlas": "ATLAS" };
const ACTIVO = "rgb(17, 17, 17)", RESTO = "rgb(102, 102, 102)";
const APERTURA_MAX = 300, CIERRE_MAX = 260, REDUCIDA_MAX = 260;
const ESPERA_LANDING = 3500;

// En la pagina: barra, nav de escritorio, chrome del landing, atlas y carrusel.
function medirPagina() {
  const vis = (el) => {
    if (!el) return false;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const golpe = (el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return h === el || el.contains(h); };
  const barras = [...document.querySelectorAll("[data-barra-movil]")].filter((n) => getComputedStyle(n).display !== "none");
  const barra = barras[0];
  const br = barra?.getBoundingClientRect();
  const enlaces = barra ? [...barra.querySelectorAll("a")].map((a) => ({ ...rect(a), txt: a.textContent.trim().toUpperCase(), hit: golpe(a), color: getComputedStyle(a).color })) : [];
  const links = [...document.querySelectorAll("a")];
  // Not the "← Albums" of the album's title block (frame Album-top): a way back, not the nav.
  const navEscritorio = links.filter((a) => !a.closest("[data-barra-movil]") && !a.closest("[data-panel-movil]") && !a.textContent.trim().startsWith("←") && /^\/(about|albums|atlas)$/.test(a.getAttribute("href") ?? "") && vis(a)).length;
  const suquia = links.filter((a) => /^←\s*Suquia$/i.test(a.textContent.trim()) && vis(a)).length;
  const credits = links.find((a) => a.getAttribute("href") === "/credits" && !a.closest("[data-barra-movil]") && !a.closest("[data-panel-movil]"));
  const contador = [...document.querySelectorAll("span.tabular-nums")].find((s) => /^\d\d \/ \d\d$/.test(s.textContent.trim()));
  const osm = [...document.querySelectorAll("a, span")].find((n) => /OpenStreetMap/.test(n.textContent) && n.children.length === 0);
  const tour = document.querySelector("[data-atlas-tour]");
  const titulo = document.querySelector("p.album-title");
  const desc = titulo ? titulo.parentElement.querySelector("p.uppercase") : null;
  const contCarrusel = [...document.querySelectorAll("div.tabular-nums")].find((d) => getComputedStyle(d).position === "fixed");
  const panel = document.querySelector("[data-panel-movil]");
  const disparador = document.querySelector("[data-panel-disparador]");
  return {
    vh: innerHeight, vw: innerWidth, barras: barras.length,
    barra: br ? { pos: getComputedStyle(barra).position, t: br.top, b: br.bottom, h: br.height, modo: barra.dataset.barraModo, enes: /\b(EN|ES)\b/.test(barra.textContent) } : null,
    enlaces, navEscritorio, suquia,
    credits: credits && vis(credits) ? { ...rect(credits), hit: golpe(credits) } : null,
    contador: contador && vis(contador) ? rect(contador) : null,
    osm: osm && vis(osm) ? rect(osm) : null,
    controles: tour && vis(tour.parentElement) ? rect(tour.parentElement) : null,
    tourHit: tour && vis(tour) ? golpe(tour) : null,
    titulo: titulo && vis(titulo) ? rect(titulo) : null,
    desc: desc && vis(desc) ? rect(desc) : null,
    contCarrusel: contCarrusel && vis(contCarrusel) ? rect(contCarrusel) : null,
    panelDisplay: panel ? getComputedStyle(panel).display : null,
    disparadorVisible: !!(disparador && getComputedStyle(disparador).display !== "none"),
    escritorioAlbum: [...document.querySelectorAll('button[aria-label="Next photo"]')].filter((b) => !b.closest("[data-barra-movil]")).some(vis),
  };
}

// En la pagina: el <h1> del blend, sus ancestros y el disparador.
function medirBlend() {
  const h1 = [...document.querySelectorAll("h1")].find((h) => getComputedStyle(h).mixBlendMode === "difference");
  const malos = [];
  for (let n = h1?.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.transform !== "none" || cs.opacity !== "1" || cs.filter !== "none" || cs.perspective !== "none" || cs.isolation === "isolate" || (cs.willChange !== "auto" && cs.willChange !== "")) malos.push(`${n.tagName}.${String(n.className).slice(0, 30)}`);
  }
  const btn = document.querySelector("[data-panel-disparador]");
  const r = btn?.getBoundingClientRect();
  const cs = btn ? getComputedStyle(btn) : null;
  const mains = [...document.querySelectorAll("main")].filter((m) => getComputedStyle(m).display !== "none" && m.getBoundingClientRect().height > 0).length;
  return {
    malos, mains, hermano: !!(h1 && btn && !h1.contains(btn) && !btn.contains(h1)),
    btn: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, t: r.top, b: r.bottom, w: r.width, h: r.height, transform: cs.transform, opacity: cs.opacity } : null,
    expanded: btn?.getAttribute("aria-expanded") ?? null,
    opacidad: getComputedStyle(document.querySelector("[data-panel-movil]")).opacity,
    duracion: getComputedStyle(document.querySelector("[data-panel-movil]")).transitionDuration,
    scrollY: window.scrollY, vh: innerHeight, vw: innerWidth,
  };
}

// En la pagina: opacidad del panel y transform de sus enlaces cada frame.
function muestrearPanel(ms) {
  return new Promise((res) => {
    const panel = document.querySelector("[data-panel-movil]");
    const links = [...document.querySelectorAll("[data-panel-enlace]")];
    const t0 = performance.now();
    const out = [];
    const paso = () => {
      const t = performance.now() - t0;
      out.push({ t, o: parseFloat(getComputedStyle(panel).opacity), tr: links.map((a) => { const cs = getComputedStyle(a); return `${cs.translate}|${cs.transform}`; }).join(",") });
      if (t < ms) requestAnimationFrame(paso); else res(out);
    };
    requestAnimationFrame(paso);
  });
}

// En la pagina: barra del album y foto mas cerca del centro.
function medirAlbum() {
  const vis = (el) => { if (!el) return false; for (let n = el; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === "none" || cs.visibility === "hidden") return false; } const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
  const barra = [...document.querySelectorAll("[data-barra-movil]")].find((n) => getComputedStyle(n).display !== "none");
  let cerca = null, d = Infinity;
  for (const row of document.querySelectorAll("[data-photo-index]")) {
    const b = row.getBoundingClientRect();
    if (b.bottom < 0 || b.top > innerHeight) continue;
    const dd = Math.abs(b.top + b.height / 2 - innerHeight / 2);
    if (dd < d) { d = dd; cerca = Number(row.dataset.photoIndex); }
  }
  const caja = (sel) => { const el = barra?.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); const h = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, hit: h === el || el.contains(h), t: el.textContent.trim() }; };
  return {
    modo: barra?.dataset.barraModo ?? null,
    volver: caja("a"), ant: caja("[data-barra-anterior]"), sig: caja("[data-barra-siguiente]"), cont: caja("[data-barra-contador]"),
    cerca, total: document.querySelectorAll("[data-photo-index]").length,
    arriba: [...document.querySelectorAll("a")].filter((a) => /^←\s*Albums$/i.test(a.textContent.trim()) && !a.closest("[data-barra-movil]") && vis(a)).length,
    cabecera: document.querySelector("[data-album-cabecera]")?.getBoundingClientRect().bottom ?? null,
    path: location.pathname,
  };
}

const fmt = (r) => (r ? `${r.l.toFixed(0)},${r.t.toFixed(0)} ${r.w.toFixed(0)}x${r.h.toFixed(0)}` : "no visible");
const nn = (i, total) => `${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

export async function seccionNavegacion({ browser, BASE, CTX, log, rule, addInv, rutas, motor, noMedible }) {
  rule("navegacion");
  // next dev pinta su indicador (un "N" de 36 x 36 en un <nextjs-portal>)
  // abajo a la izquierda, encima de ABOUT ME (specs/020-navegacion-movil/
  // tasks.md, T6). Es herramienta de desarrollo, no el sitio: se oculta.
  const abrir = async (opts = {}) => {
    const ctx = await browser.newContext({ ...CTX, ...opts });
    await ctx.addInitScript(() => {
      const ocultar = () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.documentElement.appendChild(st); };
      if (document.documentElement) ocultar(); else document.addEventListener("DOMContentLoaded", ocultar);
    });
    const p = await ctx.newPage();
    return { ctx, p };
  };
  const ir = async (p, ruta, espera = 600) => {
    await p.goto(BASE + ruta, { waitUntil: "load", timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(espera);
  };

  const { ctx, p } = await abrir();
  await ir(p, "/", 0);
  const [movil, horizontal] = await p.evaluate(([a, b]) => [matchMedia(a).matches, matchMedia(b).matches], [MOVIL, MOVIL_H]);
  log(`  ${CTX.viewport.width}x${CTX.viewport.height} · movil ${movil} · horizontal ${horizontal}`);

  // Fuera de movil: nada de lo nuevo existe, y el chrome de escritorio sigue.
  if (!movil) {
    for (const ruta of rutas) {
      await ir(p, ruta, ruta === "/" ? ESPERA_LANDING : 600);
      const m = await p.evaluate(medirPagina);
      addInv(ruta, "navegacion · fuera de movil: sin barra, panel ni disparador", m.barras === 0 && m.panelDisplay === "none" && !m.disparadorVisible, `barras ${m.barras}, panel ${m.panelDisplay}, disparador ${m.disparadorVisible}`);
      if (ruta === "/") addInv(ruta, "navegacion · fuera de movil: nav de escritorio, contador y CREDITS", m.navEscritorio === 3 && !!m.contador && !!m.credits, `nav ${m.navEscritorio}, contador ${!!m.contador}, credits ${!!m.credits}`);
      else if (/^\/(about|albums|atlas|credits)$/.test(ruta)) addInv(ruta, "navegacion · fuera de movil: ← Suquia", m.suquia === 1, `${m.suquia}`);
    }
    await ctx.close();
    return;
  }

  const alto = horizontal ? ALTO_BARRA_H : ALTO_BARRA;

  // CA3, CA9, CA11, CA13: cada ruta.
  for (const ruta of rutas) {
    await ir(p, ruta, ruta === "/" ? ESPERA_LANDING : ruta === "/atlas" ? 1500 : 600);
    const m = await p.evaluate(medirPagina);
    const b = m.barra;
    addInv(ruta, "navegacion · CA3 una barra fija abajo", m.barras === 1 && b?.pos === "fixed" && Math.abs(b.b - m.vh) <= 0.5, `barras ${m.barras}, ${b?.pos}, abajo ${b?.b} vs vh ${m.vh}`);
    addInv(ruta, `navegacion · CA3/CA11 alto de la barra ${alto} px`, !!b && Math.abs(b.h - alto) <= 0.5, `${b?.h}`);
    addInv(ruta, "navegacion · CA3 tres enlaces de >= 44 px, dentro y sin tapar", m.enlaces.length === 3 && m.enlaces.every((l) => l.h >= 43.5 && l.l >= 0 && l.r <= m.vw && l.t >= 0 && l.b <= m.vh && l.hit), JSON.stringify(m.enlaces.map((l) => [l.txt, Math.round(l.h), l.hit])));
    addInv(ruta, "navegacion · CA3 sin EN/ES", !!b && !b.enes, "EN/ES visible");
    addInv(ruta, "navegacion · CA3 sin nav de escritorio", m.navEscritorio === 0 && (ruta === "/credits" ? m.suquia === 1 : m.suquia === 0), `nav ${m.navEscritorio}, ← Suquia ${m.suquia}`);
    const activoEsperado = DESTINOS[ruta.startsWith("/album/") ? "/albums" : ruta];
    addInv(ruta, "navegacion · CA4 colores activo/resto", m.enlaces.every((l) => l.color === (l.txt === activoEsperado ? ACTIVO : RESTO)), JSON.stringify(m.enlaces.map((l) => [l.txt, l.color])));
    if (horizontal) addInv(ruta, `navegacion · CA11 margen lateral >= ${MARGEN_H} px`, m.enlaces[0] && m.enlaces[0].l + 8 >= MARGEN_H - 0.5, `${m.enlaces[0]?.l + 8}`);
    const encima = (r) => !!r && r.t >= 0 && r.b <= b.t + 0.5 && r.l >= 0 && r.r <= m.vw;
    if (ruta === "/") {
      addInv(ruta, "navegacion · CA9 contador encima de la barra", encima(m.contador), `${fmt(m.contador)} vs barra ${b?.t}`);
      const c = m.credits;
      const sitio = c && (horizontal ? c.l + c.w / 2 >= MARGEN_H : c.t + c.h / 2 >= (2 * m.vh) / 3 - 40) && c.b <= b.t;
      addInv(ruta, "navegacion · CA9 CREDITS 40 x 120, sin tapar, en su sitio", !!c && Math.abs(c.w - 40) <= 1 && Math.abs(c.h - 120) <= 1 && c.hit && sitio, fmt(c));
    }
    if (ruta === "/atlas") {
      addInv(ruta, "navegacion · CA13 credito OSM encima de la barra", encima(m.osm), `${fmt(m.osm)} vs barra ${b?.t}`);
      addInv(ruta, "navegacion · CA13 controles del atlas encima de la barra y sin tapar", encima(m.controles) && m.tourHit === true, `${fmt(m.controles)}, tour ${m.tourHit}`);
    }
    if (ruta === "/albums") {
      addInv(ruta, "navegacion · CA13 titulo, descripcion y contador del carrusel encima de la barra", encima(m.titulo) && encima(m.desc) && encima(m.contCarrusel), `titulo ${fmt(m.titulo)}, desc ${fmt(m.desc)}, contador ${fmt(m.contCarrusel)} vs barra ${b?.t}`);
    }
    if (ruta.startsWith("/album/")) addInv(ruta, "navegacion · CA10 sin control del borde derecho", !m.escritorioAlbum, "visible");
  }

  // CA4: toques reales desde el album a cada destino.
  const album = rutas.find((r) => r.startsWith("/album/"));
  for (const [destino, texto] of Object.entries(DESTINOS)) {
    await ir(p, album);
    const c = await p.evaluate((t) => {
      const a = [...document.querySelectorAll("[data-barra-movil] a")].find((x) => x.textContent.trim().toUpperCase() === t);
      if (!a) return null;
      const r = a.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, texto);
    if (c) {
      await p.touchscreen.tap(c.x, c.y);
      await p.waitForURL((u) => new URL(u).pathname === destino, { timeout: 10000 }).catch(() => {});
      await p.waitForTimeout(400);
    }
    const fin = await p.evaluate((t) => {
      const a = [...document.querySelectorAll("[data-barra-movil] a")].find((x) => x.textContent.trim().toUpperCase() === t);
      return { path: location.pathname, color: a ? getComputedStyle(a).color : null };
    }, texto);
    addInv(album, `navegacion · CA4 toque en ${texto}`, !!c && fin.path === destino && fin.color === ACTIVO, `${c ? "" : "sin enlace; "}acaba en ${fin.path}, color ${fin.color}`);
  }

  // CA10: barra del album, en carga directa.
  await ir(p, album, 1500);
  let a = await p.evaluate(medirAlbum);
  addInv(album, "navegacion · CA10 arriba: barra general y ← Albums en el bloque de titulo", a.modo === "general" && a.arriba === 1, `modo ${a.modo}, ← Albums ${a.arriba}`);
  await p.evaluate(() => { const c = document.querySelector("[data-album-cabecera]"); window.scrollTo(0, scrollY + c.getBoundingClientRect().bottom + innerHeight * 0.3); });
  await p.waitForTimeout(900);
  a = await p.evaluate(medirAlbum);
  const botones = [a.volver, a.ant, a.sig].every((x) => x && x.h >= 43.5 && x.hit) && a.ant.w >= 43.5 && a.sig.w >= 43.5 && /^←\s*Albums$/i.test(a.volver.t);
  addInv(album, "navegacion · CA10 tras el bloque: barra del album con ← ALBUMS y flechas de 44 px", a.modo === "album" && botones, `modo ${a.modo}, ${JSON.stringify([a.volver, a.ant, a.sig])}`);
  addInv(album, "navegacion · CA10 contador = foto en el centro", a.cerca !== null && a.cont?.t === nn(a.cerca, a.total), `${a.cont?.t} vs ${a.cerca !== null ? nn(a.cerca, a.total) : "—"}`);
  if (a.modo === "album" && a.sig) {
    const antes = a.cerca;
    await p.touchscreen.tap(a.sig.x, a.sig.y);
    await p.waitForTimeout(1600);
    a = await p.evaluate(medirAlbum);
    addInv(album, "navegacion · CA10 flecha siguiente lleva a la foto siguiente", a.cerca === (antes + 1) % a.total && a.cont?.t === nn(a.cerca, a.total), `${antes + 1} -> ${a.cerca + 1}, contador ${a.cont?.t}`);
  }
  await ctx.close();

  // CA5-CA8: el panel, sin y con reduced motion.
  for (const reduced of [false, true]) {
    const etq = reduced ? " (reduced motion)" : "";
    const { ctx: c2, p: q } = await abrir(reduced ? { reducedMotion: "reduce" } : {});
    await ir(q, "/", ESPERA_LANDING);
    let e = await q.evaluate(medirBlend);
    addInv("/", `navegacion · CA8 disparador hermano del <h1>, 80 px, sin transform ni opacity${etq}`, e.hermano && !!e.btn && Math.abs(e.btn.h - 80) <= 0.5 && e.btn.transform === "none" && e.btn.opacity === "1", JSON.stringify(e.btn));
    addInv("/", `navegacion · CA8 blend sin ancestros, panel cerrado${etq}`, e.malos.length === 0, e.malos.join(", "));
    // CA6: toques fuera de la banda.
    const fuera = await q.evaluate(() => {
      const btn = document.querySelector("[data-panel-disparador]").getBoundingClientRect();
      const f = [...document.querySelectorAll(".landing-photo")].map((x) => x.getBoundingClientRect())
        .find((r) => r.width > 40 && r.top > 0 && r.bottom < innerHeight - 100 && (r.bottom < btn.top - 30 || r.top > btn.bottom + 30));
      return [
        f ? { x: f.left + f.width / 2, y: f.top + Math.min(f.height / 2, 30), q: "una foto" } : null,
        { x: innerWidth / 2, y: Math.min(btn.bottom + 40, innerHeight - 90), q: "el centro bajo la banda" },
        { x: innerWidth / 2, y: Math.max(btn.top - 40, 30), q: "el centro sobre la banda" },
      ].filter(Boolean);
    });
    for (const t of fuera) {
      const antes = q.url();
      await q.touchscreen.tap(t.x, t.y);
      await q.waitForTimeout(400);
      const s = await q.evaluate(medirBlend);
      addInv("/", `navegacion · CA6 tocar ${t.q} no abre el panel${etq}`, s.expanded === "false" && s.opacidad === "0", `expanded ${s.expanded}, opacidad ${s.opacidad} en ${t.x.toFixed(0)},${t.y.toFixed(0)}`);
      if (s.expanded === "true") { await q.evaluate(() => document.querySelector("[data-panel-cerrar]").click()); await q.waitForTimeout(400); }
      if (q.url() !== antes) await ir(q, "/", ESPERA_LANDING);
    }
    // CA5: abrir.
    e = await q.evaluate(medirBlend);
    const y0 = e.scrollY;
    const mA = q.evaluate(muestrearPanel, 700);
    await q.touchscreen.tap(e.btn.x, e.btn.y);
    const ma = await mA;
    const iniA = ma.find((s) => s.o > 0.001), finA = ma.find((s) => s.o >= 0.999);
    const durA = iniA && finA ? finA.t - iniA.t : null;
    e = await q.evaluate(medirBlend);
    const topeA = reduced ? REDUCIDA_MAX : APERTURA_MAX;
    if (motor === "chromium") addInv("/", `navegacion · CA5 apertura <= ${topeA} ms${etq}`, durA !== null && durA <= topeA, `${durA?.toFixed(0)} ms`);
    else addInv("/", `navegacion · CA5 apertura declarada ${reduced ? "0.2s" : "0.24s"}${etq} (${motor}: el muestreo no vale)`, e.duracion.split(",").every((d) => d.trim() === (reduced ? "0.2s" : "0.24s")), e.duracion);
    addInv("/", `navegacion · CA5 aria-expanded true y un solo <main>${etq}`, e.expanded === "true" && e.mains === 1, `expanded ${e.expanded}, mains ${e.mains}`);
    addInv("/", `navegacion · CA8 blend sin ancestros, panel abierto${etq}`, e.malos.length === 0, e.malos.join(", "));
    const enl = await q.evaluate(() => [...document.querySelectorAll("[data-panel-enlace]")].map((x) => { const r = x.getBoundingClientRect(); const h = document.elementFromPoint(r.left + 10, r.top + r.height / 2); return { t: x.textContent, cy: r.top + r.height / 2, b: r.bottom, r: r.right, hit: h === x || x.contains(h) }; }));
    addInv("/", `navegacion · CA5 cuatro enlaces en la mitad inferior, sin tapar${etq}`, enl.length === 4 && enl.every((l) => l.cy >= e.vh / 2 && l.b <= e.vh && l.r <= e.vw && l.hit), JSON.stringify(enl.map((l) => [l.t, Math.round(l.cy), l.hit])));
    if (reduced) addInv("/", "navegacion · CA7 los enlaces no se mueven al abrir", new Set(ma.map((s) => s.tr)).size === 1, [...new Set(ma.map((s) => s.tr))].slice(0, 3).join(" / "));
    if (motor === "chromium") {
      const cdp = await c2.newCDPSession(q);
      const x = e.vw / 2, tramo = Math.floor(e.vh * 0.6);
      for (let total = 0; total < 1000;) {
        const d = Math.min(tramo, 1000 - total), yA = e.vh * 0.8, yB = yA - d;
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: yA }] });
        for (let k = 1; k <= 10; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: yA + ((yB - yA) * k) / 10 }] });
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        total += d;
      }
      await cdp.detach();
      await q.waitForTimeout(600);
      const y1 = await q.evaluate(() => window.scrollY);
      addInv("/", `navegacion · CA5 arrastre de 1000 px con el panel abierto no mueve el landing${etq}`, Math.abs(y1 - y0) <= 1, `scrollY ${y0} -> ${y1}`);
    } else {
      log(`  NO MEDIBLE CA5 arrastre de 1000 px con el panel abierto${etq} · ${motor}: sin CDP para toques reales`);
      noMedible.push(`navegacion · CA5 arrastre${etq}`);
    }
    // CA5: cerrar.
    const cz = await q.evaluate(() => { const r = document.querySelector("[data-panel-cerrar]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height }; });
    const mC = q.evaluate(muestrearPanel, 700);
    await q.touchscreen.tap(cz.x, cz.y);
    const mc = await mC;
    const iniC = mc.find((s) => s.o < 0.999), finC = mc.find((s) => s.o <= 0.001);
    const durC = iniC && finC ? finC.t - iniC.t : null;
    await q.waitForTimeout(200);
    e = await q.evaluate(medirBlend);
    if (motor === "chromium") addInv("/", `navegacion · CA5 Close cierra en <= ${CIERRE_MAX} ms${etq}`, cz.h >= 43.5 && durC !== null && durC <= CIERRE_MAX, `${durC?.toFixed(0)} ms, Close ${cz.h} px`);
    else addInv("/", `navegacion · CA5 Close, cierre declarado 0.2s${etq} (${motor}: el muestreo no vale)`, cz.h >= 43.5 && e.duracion.split(",").every((d) => d.trim() === "0.2s"), `${e.duracion}, Close ${cz.h} px`);
    addInv("/", `navegacion · CA5 tras cerrar, scrollY igual y aria-expanded false${etq}`, Math.abs(e.scrollY - y0) <= 1 && e.expanded === "false", `scrollY ${y0} -> ${e.scrollY}, expanded ${e.expanded}`);
    if (reduced) addInv("/", "navegacion · CA7 los enlaces no se mueven al cerrar", new Set(mc.map((s) => s.tr)).size === 1, "cambian");
    addInv("/", `navegacion · CA8 blend sin ancestros, panel cerrado de nuevo${etq}`, e.malos.length === 0, e.malos.join(", "));
    await c2.close();
  }
}

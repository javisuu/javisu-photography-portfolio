// Seccion `album-movil` del diagnostico (spec 023): la pagina de album en
// movil, segun el lienzo «Album A · Alternada» (docs/referencias/movil/).
//
// Solo en modo dispositivo. Si el perfil no es movil (iPad en horizontal),
// comprueba solo CA4: que alli siguen GLSurface y Lenis.
//
// Las medidas del lienzo son a 390 px de ancho. En vertical se escalan por
// u = ancho / 390 (respuesta 1 de Javi: tablets escaladas); la tipografia no.
// En horizontal (movil-h) van en px, como en el frame de 844 x 390.
//
// Lee la maqueta por atributos `data-*` que no cambian nada visible:
// data-album-cabecera, data-photo-index, data-album-pie y data-pie=numero|
// titulo|lugar|camara, data-album-siguiente, data-album-portada,
// data-pie-pagina. De un mismo `data-pie` puede haber dos (escritorio y
// movil): cuenta el que se ve.

import { MOVIL, MOVIL_H } from "./navegacion.mjs";

const LIENZO = 390;
const ESPERA_ALBUM = 3000;
const ESPERA_FILA = 500;
const ESPERA_LLEGADA = 2600;
const TOPE_LLEGADA = 1500;
const TOL = 1, TOL_FS = 0.5;
const ALTO_MAX_H = 300, COLUMNA_H = 200, HUECO_H = 24, AIRE_NOTA = 48;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => (x == null || Number.isNaN(x) ? "—" : Math.round(x * 10) / 10);
const cerca = (a, b, t = TOL) => a != null && b != null && Math.abs(a - b) <= t;

async function abrir(browser, CTX, BASE, ruta, extra = {}) {
  const ctx = await browser.newContext({ ...CTX, ...extra });
  const p = await ctx.newPage();
  await p.goto(BASE + ruta, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(ESPERA_ALBUM);
  return { ctx, p };
}

// ---------- maqueta ----------
// Todo en coordenadas de pagina (rect + scrollY): no depende del scroll.
async function medirMaqueta(p) {
  const base = await p.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
    return { n: main ? main.querySelectorAll("[data-photo-index]").length : 0 };
  });
  const filas = [];
  for (let i = 0; i < base.n; i++) {
    await p.evaluate(async (i) => {
      const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
      const row = main.querySelectorAll("[data-photo-index]")[i];
      row.scrollIntoView({ block: "center" });
      const img = row.querySelector("img");
      for (let k = 0; k < 50 && !(img.complete && img.naturalWidth > 0); k++) await new Promise((r) => setTimeout(r, 100));
    }, i);
    await p.waitForTimeout(ESPERA_FILA);
    filas.push(await p.evaluate((i) => {
      const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
      const rows = [...main.querySelectorAll("[data-photo-index]")];
      const row = rows[i];
      const caja = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width < 0.5 && b.height < 0.5 ? null : { l: b.left, t: b.top + scrollY, r: b.right, b: b.bottom + scrollY, w: b.width, h: b.height }; };
      const visible = (sel, raiz) => [...raiz.querySelectorAll(sel)].find((e) => caja(e));
      const estilo = (e) => { if (!e) return null; const s = getComputedStyle(e); return { fs: parseFloat(s.fontSize), lh: s.lineHeight, estilo: s.fontStyle, color: s.color, tt: s.textTransform, texto: e.textContent.trim().replace(/\s+/g, " ") }; };
      const img = row.querySelector("img");
      const pie = visible("[data-album-pie]", row);
      const parte = (k) => { const e = pie && visible(`[data-pie="${k}"]`, pie); return e ? { caja: caja(e), ...estilo(e) } : null; };
      const nota = row.querySelector("[data-album-text][data-text-kind=beside], [data-photo-quote]");
      // Un texto «between» entre esta fila y la siguiente rompe la cuenta del
      // hueco entre filas: se marca y no se mide ese hueco.
      let sig = row.nextElementSibling, interludio = false;
      while (sig && !sig.hasAttribute("data-photo-index")) { if (caja(sig)) interludio = true; sig = sig.nextElementSibling; }
      return {
        i, foto: i + 1, colocacion: ["centro", "izquierda", "derecha"][i % 3],
        ratio: (+img.getAttribute("width")) / (+img.getAttribute("height")),
        img: caja(img), imgVisible: getComputedStyle(img).visibility,
        pie: caja(pie), numero: parte("numero"), titulo: parte("titulo"), lugar: parte("lugar"), camara: parte("camara"),
        nota: caja(nota), interludio, ultima: i === rows.length - 1,
      };
    }, i));
  }
  const resto = await p.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
    const caja = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width < 0.5 && b.height < 0.5 ? null : { l: b.left, t: b.top + scrollY, r: b.right, b: b.bottom + scrollY, w: b.width, h: b.height }; };
    const estilo = (e) => { if (!e) return null; const s = getComputedStyle(e); return { fs: parseFloat(s.fontSize), lh: s.lineHeight, peso: s.fontWeight, color: s.color, tt: s.textTransform, texto: e.textContent.trim().replace(/\s+/g, " ") }; };
    const cab = main?.querySelector("[data-album-cabecera]");
    const ps = cab ? [...cab.querySelectorAll("p")].filter((e) => caja(e)) : [];
    const h1 = cab?.querySelector("h1");
    const sig = main?.querySelector("[data-album-siguiente]");
    const portada = sig?.querySelector("[data-album-portada]");
    const sigTextos = sig ? [...sig.querySelectorAll("p")].filter((e) => caja(e)) : [];
    const titSig = sigTextos.find((e) => parseFloat(getComputedStyle(e).fontSize) >= 20);
    const pp = main?.querySelector("[data-pie-pagina]");
    const hojas = pp ? [...pp.querySelectorAll("*")].filter((e) => !e.children.length && caja(e) && e.textContent.trim()) : [];
    const ppS = pp ? getComputedStyle(pp) : null;
    return {
      vw: innerWidth, vh: innerHeight,
      lenis: document.documentElement.classList.contains("lenis"),
      glAlbum: !!window.__glDiag?.album,
      canvas: main ? [...main.querySelectorAll("canvas")].filter((c) => caja(c)).length : 0,
      cab: { etiqueta: ps[0] ? { caja: caja(ps[0]), ...estilo(ps[0]) } : null, h1: h1 ? { caja: caja(h1), ...estilo(h1) } : null, lugar: ps.length > 1 ? { caja: caja(ps[ps.length - 1]), ...estilo(ps[ps.length - 1]) } : null },
      sig: sig ? {
        caja: caja(sig), tag: sig.tagName, dentro: { etiqueta: sigTextos.some((e) => /next album/i.test(e.textContent)), portada: !!portada, titulo: !!titSig, lugar: sigTextos.length >= 3 },
        portada: portada ? { caja: caja(portada), ratio: (+portada.getAttribute("width")) / (+portada.getAttribute("height")) } : null,
        titulo: titSig ? estilo(titSig) : null,
      } : null,
      piePagina: pp ? {
        lineas: [...new Set(hojas.map((e) => Math.round(caja(e).t)))].length,
        // Centro de cada linea (de su primera hoja a la ultima), no de cada
        // hoja: la linea 2 es `Instagram · Email`.
        centros: [...new Set(hojas.map((e) => Math.round(caja(e).t)))].map((t) => {
          const bs = hojas.filter((e) => Math.round(caja(e).t) === t).map((e) => e.getBoundingClientRect());
          return Math.round((Math.min(...bs.map((b) => b.left)) + Math.max(...bs.map((b) => b.right))) / 2);
        }),
        borde: ppS.borderTopWidth, bordeColor: ppS.borderTopColor,
      } : null,
    };
  });
  return { ...resto, filas };
}

// ---------- fundido de la portada de NEXT ALBUM (CA11) ----------
async function medirFundido(p) {
  const pos = async (frac) => {
    await p.evaluate((frac) => {
      const el = document.querySelector("main [data-album-portada]");
      if (!el) return;
      const b = el.getBoundingClientRect();
      window.scrollTo(0, scrollY + b.top - innerHeight * frac);
    }, frac);
  };
  const leer = () => p.evaluate(() => {
    const el = document.querySelector("main [data-album-portada]");
    if (!el) return null;
    // La opacidad puede ir en la portada o en su envoltorio.
    let op = 1, e = el, prop = "", dur = "";
    while (e && e.tagName !== "A") { const s = getComputedStyle(e); op *= +s.opacity; if (s.transitionProperty.includes("opacity")) { prop = s.transitionProperty; dur = s.transitionDuration; } e = e.parentElement; }
    return { op, prop, dur };
  });
  await pos(0.95); await wait(600);
  const antes = await leer();
  await pos(0.6); await wait(80);
  const durante = await leer();
  await wait(600);
  const despues = await leer();
  return { antes, durante, despues };
}

// ---------- llegada de la foto 1 (CA9) ----------
// Registra cada frame: opacidad de la fila 0 del <main> visible, si su <img>
// esta cargada, ruta y scrollY. Se instala antes de cargar y sigue tras una
// navegacion de cliente.
function registroLlegada() {
  window.__lleg = [];
  const t0 = performance.now();
  const tick = () => {
    const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
    const row = main?.querySelector('[data-photo-index="0"]');
    const img = row?.querySelector("img");
    if (row) window.__lleg.push({ t: performance.now() - t0, ruta: location.pathname, op: +getComputedStyle(row).opacity, lista: !!(img && img.complete && img.naturalWidth > 0), vis: img ? getComputedStyle(img).visibility : null, y: scrollY });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function analizarLlegada(frames, ruta, desde = 0) {
  const f = frames.filter((x) => x.ruta === ruta && x.t >= desde);
  if (!f.length) return { ok: false, detalle: "sin frames" };
  const t0 = f[0].t;
  const primero = f.find((x) => x.op >= 0.999);
  const intermedios = f.filter((x) => x.op > 0.001 && x.op < 0.999).length;
  const blancos = f.filter((x) => x.op > 0.001 && !x.lista).length;
  const tRev = primero ? primero.t - t0 : null;
  return { tRev, intermedios, blancos, ok: tRev != null && tRev <= TOPE_LLEGADA + 50 && intermedios === 0 && blancos === 0 };
}

async function medirLlegadas(browser, CTX, BASE, slugs, motor) {
  const out = [];
  // Directa.
  for (const slug of slugs) {
    const ctx = await browser.newContext({ ...CTX });
    await ctx.addInitScript(registroLlegada);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/album/${slug}`, { waitUntil: "commit" }).catch(() => {});
    await p.waitForTimeout(ESPERA_LLEGADA);
    const fr = await p.evaluate(() => window.__lleg).catch(() => []);
    out.push({ modo: "directa", slug, ...analizarLlegada(fr, `/album/${slug}`) });
    await ctx.close();
  }
  // Por NEXT ALBUM con la pagina moviendose: un dedo rapido hacia abajo
  // (la pagina sube) y el clic justo despues, con la inercia nativa en marcha.
  for (const slug of slugs) {
    const ctx = await browser.newContext({ ...CTX });
    await ctx.addInitScript(registroLlegada);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/album/${slug}`, { waitUntil: "load" }).catch(() => {});
    await p.waitForTimeout(ESPERA_ALBUM);
    const href = await p.evaluate(() => {
      const a = document.querySelector("main [data-album-siguiente]");
      if (!a) return null;
      a.scrollIntoView({ block: "center" });
      return a.getAttribute("href");
    }).catch(() => null);
    if (!href) { out.push({ modo: "next", slug, ok: false, detalle: "sin enlace NEXT ALBUM" }); await ctx.close(); continue; }
    await p.waitForTimeout(400);
    let fling = "sin dedo (webkit)";
    if (motor === "chromium") {
      const cdp = await ctx.newCDPSession(p);
      const { w, h } = await p.evaluate(() => ({ w: innerWidth, h: innerHeight }));
      const pt = (y) => [{ x: Math.round(w / 2), y: Math.round(y), id: 1 }];
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(h * 0.25) });
      for (let k = 1; k <= 5; k++) { await wait(16); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(h * 0.25 + h * 0.5 * (k / 5)) }); }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      fling = "dedo rapido";
    }
    const y0 = await p.evaluate(() => scrollY);
    await wait(60);
    const mov = await p.evaluate((y0) => Math.abs(scrollY - y0), y0);
    await p.evaluate(() => document.querySelector("main [data-album-siguiente]").click());
    await wait(500);
    const y500 = await p.evaluate(() => ({ ruta: location.pathname, y: scrollY }));
    await wait(1000);
    const y1500 = await p.evaluate(() => ({ ruta: location.pathname, y: scrollY }));
    const fr = await p.evaluate(() => window.__lleg).catch(() => []);
    const lleg = analizarLlegada(fr, href);
    out.push({ modo: "next", slug, destino: href, fling, mov, y500, y1500, ...lleg, ok: lleg.ok && y1500.ruta === href && y1500.y === 0 });
    await ctx.close();
  }
  return out;
}

// ---------- vuelo carrusel -> album (CA9, ultima frase) ----------
async function medirVuelo(browser, CTX, BASE) {
  const { ctx, p } = await abrir(browser, CTX, BASE, "/albums");
  // La lamina abierta es el enlace a un album mas cercano al centro del
  // viewport (en horizontal el primero visible puede ser una lateral).
  const box = await p.evaluate(() => {
    const cx = innerWidth / 2, cy = innerHeight / 2;
    let mejor = null, dMin = Infinity;
    for (const a of document.querySelectorAll("a[href^='/album/']")) {
      const r = a.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right < 0 || r.left > innerWidth) continue;
      const d = Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy);
      if (d < dMin) { dMin = d; mejor = { x: r.left, y: r.top, width: r.width, height: r.height, href: a.getAttribute("href") }; }
    }
    if (!mejor) return null;
    // En horizontal la lamina es mas alta que el viewport y su centro cae bajo
    // la barra inferior: se toca el primer punto de su parte visible que de
    // de verdad en el enlace.
    const t = Math.max(0, mejor.y), b = Math.min(innerHeight, mejor.y + mejor.height);
    const l = Math.max(0, mejor.x), rr = Math.min(innerWidth, mejor.x + mejor.width);
    for (const fy of [0.5, 0.35, 0.65, 0.2, 0.8]) for (const fx of [0.5, 0.35, 0.65]) {
      const px = l + (rr - l) * fx, py = t + (b - t) * fy;
      const el = document.elementFromPoint(px, py);
      if (el?.closest("a")?.getAttribute("href") === mejor.href) return { ...mejor, px, py, encima: "enlace" };
    }
    const el = document.elementFromPoint((l + rr) / 2, (t + b) / 2);
    return { ...mejor, px: (l + rr) / 2, py: (t + b) / 2, encima: el ? `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}` : "nada" };
  }).catch(() => null);
  if (!box) { await ctx.close(); return { ok: false, detalle: "sin lamina abierta" }; }
  const x = box.px, y = box.py;
  if (CTX.hasTouch) await p.touchscreen.tap(x, y).catch(() => {});
  else await p.mouse.click(x, y).catch(() => {});
  await p.waitForTimeout(3500);
  const sonda = `${box.href} ${Math.round(box.width)}x${Math.round(box.height)} en ${Math.round(x)},${Math.round(y)} · encima ${box.encima}`;
  const r = await p.evaluate(() => {
    const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
    const row = main?.querySelector('[data-photo-index="0"]');
    const img = row?.querySelector("img");
    return { ruta: location.pathname, gl: !!window.__glDiag?.album, op: row ? +getComputedStyle(row).opacity : null, vis: img ? getComputedStyle(img).visibility : null };
  }).catch(() => ({}));
  await ctx.close();
  const ok = r.ruta?.startsWith("/album/") && !r.gl && r.op === 1 && r.vis === "visible";
  return { ...r, ok, ...(ok ? {} : { detalle: sonda }) };
}

/** Modo dispositivo: CA3 a CA11 de la spec 023. */
export async function seccionAlbumMovil({ browser, BASE, CTX, log, rule, addInv, slugs, motor }) {
  rule("album-movil");
  const prueba = await abrir(browser, CTX, BASE, `/album/${slugs[0]}`);
  const [movil, horizontal] = await prueba.p.evaluate(([q, qh]) => [matchMedia(q).matches, matchMedia(qh).matches], [MOVIL, MOVIL_H]).catch(() => [false, false]);
  const control = movil ? null : await medirMaqueta(prueba.p).catch(() => null);
  await prueba.ctx.close();

  if (!movil) {
    log(`  no es movil: solo CA4 · GL album ${control?.glAlbum} · Lenis ${control?.lenis}`);
    addInv("album-movil", "CA4 fuera de movil siguen GLSurface y Lenis en el album", !!control?.glAlbum && !!control?.lenis, `GL ${control?.glAlbum}, Lenis ${control?.lenis}`);
    return;
  }
  log(`  perfil movil${horizontal ? " horizontal" : " vertical"}`);

  const medidas = [];
  for (const slug of slugs) {
    const { ctx, p } = await abrir(browser, CTX, BASE, `/album/${slug}`);
    const m = await medirMaqueta(p).catch((e) => { log(`  ${slug}: sin medida (${e.message.split("\n")[0]})`); return null; });
    await ctx.close();
    if (m) medidas.push({ slug, ...m });
  }
  if (!medidas.length) { addInv("album-movil", "pagina de album medible", false, "ninguna"); return; }

  const fallos = { ca3: [], ca5: [], ca6: [], ca7: [], ca8: [], ca10: [] };
  for (const m of medidas) {
    const u = m.vw / LIENZO;
    const s = m.slug;
    // CA3
    const imgsOcultas = m.filas.filter((f) => f.imgVisible !== "visible").length;
    log(`  ${s} · ${m.vw}x${m.vh} · u ${r1(u)} · GL album ${m.glAlbum} · Lenis ${m.lenis} · canvas ${m.canvas} · <img> ocultas ${imgsOcultas}`);
    if (m.glAlbum || m.lenis || m.canvas || imgsOcultas) fallos.ca3.push(`${s}: GL ${m.glAlbum}, Lenis ${m.lenis}, canvas ${m.canvas}, ocultas ${imgsOcultas}`);

    // CA5 (vertical)
    const c = m.cab;
    if (!horizontal) {
      const f1 = m.filas[0]?.img;
      const e = c.etiqueta, h = c.h1, l = c.lugar;
      log(`    cabecera · etiqueta ${e?.fs}px ${e?.color} x ${r1(e?.caja?.l)} · h1 ${h?.fs}/${h?.lh} ${h?.peso} x ${r1(h?.caja?.l)} · lugar ${l?.fs}px ${l?.tt} x ${r1(l?.caja?.l)} · huecos ${r1(h?.caja?.t - e?.caja?.b)} y ${r1(l?.caja?.t - h?.caja?.b)} · foto 1 a ${r1(f1?.t - l?.caja?.b)} del bloque, top ${r1(f1?.t)} de ${m.vh}`);
      const ok5 = e && h && l && cerca(e.fs, 12, TOL_FS) && e.color === "rgb(136, 136, 136)" && cerca(h.fs, 64, TOL_FS) && h.lh === "68px" && h.peso === "500"
        && cerca(l.fs, 12, TOL_FS) && l.tt === "uppercase" && [e, h, l].every((x) => cerca(x.caja.l, 16 * u))
        && cerca(h.caja.t - e.caja.b, 12 * u) && cerca(l.caja.t - h.caja.b, 10 * u) && f1 && f1.t < m.vh;
      if (!ok5) fallos.ca5.push(s);
    }

    for (const [k, f] of m.filas.entries()) {
      const sig = m.filas[k + 1];
      const tag = `${s} ${f.foto}`;
      const finPie = f.nota ? f.nota.b : f.pie?.b;
      log(`    foto ${f.foto} (${f.colocacion}) · img ${r1(f.img?.w)}x${r1(f.img?.h)} en x ${r1(f.img?.l)}-${r1(f.img?.r)} · pie ${r1(f.pie?.w)} en x ${r1(f.pie?.l)}, a ${r1(f.pie?.t - f.img?.b)} de la foto${f.nota ? ` · nota ${r1(f.nota.w)} en x ${r1(f.nota.l)}, a ${r1(f.nota.t - f.pie?.b)} del pie` : ""}${sig && !f.interludio ? ` · siguiente foto a ${r1(sig.img?.t - finPie)}` : ""} · camara "${f.camara?.texto ?? "—"}" ${f.camara?.fs}px ${f.camara?.tt}`);
      // CA7 (cinco perfiles)
      const t = f.titulo, n = f.numero, lu = f.lugar, ca = f.camara;
      const ok7 = t && n && lu && ca && f.pie
        && n.caja.t < t.caja.b && n.caja.b > t.caja.t
        && lu.caja.t >= t.caja.b - TOL && ca.caja.t >= lu.caja.b - TOL
        && cerca(lu.caja.l, t.caja.l) && cerca(ca.caja.l, t.caja.l)
        && cerca(t.fs, 18, TOL_FS) && t.estilo === "italic"
        && cerca(lu.fs, 14, TOL_FS) && lu.color === "rgb(102, 102, 102)"
        && cerca(ca.fs, 12, TOL_FS) && ca.color === "rgb(168, 168, 168)" && ca.tt === "none" && /^\S+ · f\/\S+ · ISO \d+$/.test(ca.texto) && ca.caja.h > 0
        && (horizontal || cerca(f.pie.l, f.img.l));
      if (!ok7) fallos.ca7.push(tag);

      if (!horizontal) {
        // CA6
        const util = m.vw - 32 * u;
        let okImg;
        if (f.colocacion === "centro") okImg = cerca(f.img.w, Math.min(util, 0.85 * m.vh * f.ratio));
        else {
          const esperado = Math.min(300 * u, 360 * u * f.ratio, 0.85 * m.vh * f.ratio);
          const lado = f.colocacion === "izquierda" ? cerca(f.img.l, 16 * u) : cerca(f.img.r, m.vw - 16 * u);
          okImg = lado && cerca(f.img.w, esperado);
        }
        const okPie = f.pie && cerca(f.pie.t - f.img.b, 14 * u);
        const okSig = !sig || f.interludio || cerca(sig.img.t - finPie, 54 * u);
        if (!(okImg && okPie && okSig)) fallos.ca6.push(`${tag}${okImg ? "" : " foto"}${okPie ? "" : " pie"}${okSig ? "" : " hueco"}`);
      } else {
        // CA8
        const okAlto = f.img.h <= ALTO_MAX_H + TOL;
        const okPie = f.pie && cerca(f.pie.l - f.img.r, HUECO_H) && cerca(f.pie.w, COLUMNA_H) && cerca(f.pie.b, f.img.b);
        const okNota = !f.nota || (cerca(f.nota.l, f.pie.l) && f.nota.w <= COLUMNA_H + TOL && cerca(f.nota.t - f.pie.b, AIRE_NOTA));
        const okSig = !sig || !f.nota || sig.img.t >= f.nota.b - TOL;
        if (!(okAlto && okPie && okNota && okSig)) fallos.ca8.push(`${tag}${okAlto ? "" : " alto"}${okPie ? "" : " pie"}${okNota ? "" : " nota"}${okSig ? "" : " siguiente"}`);
      }
    }

    // CA10 (vertical)
    if (!horizontal) {
      const g = m.sig, pp = m.piePagina;
      log(`    NEXT ALBUM · <${g?.tag}> ${r1(g?.caja?.w)}x${r1(g?.caja?.h)} · dentro ${JSON.stringify(g?.dentro)} · portada ${r1(g?.portada?.caja?.w)}x${r1(g?.portada?.caja?.h)} · titulo ${g?.titulo?.fs}/${g?.titulo?.lh} · pie de pagina ${pp?.lineas} lineas, centros ${pp?.centros?.join(",")}, borde ${pp?.borde} ${pp?.bordeColor}`);
      const okSig = g && g.tag === "A" && Object.values(g.dentro).every(Boolean) && g.caja.h >= 44
        && g.portada && cerca(g.portada.caja.w, 200 * u) && cerca(g.portada.caja.w / g.portada.caja.h, g.portada.ratio, 0.02)
        && cerca(g.titulo?.fs, 40, TOL_FS) && g.titulo?.lh === "44px";
      const okPp = pp && pp.lineas === 3 && pp.centros.every((x) => Math.abs(x - m.vw / 2) <= 2) && pp.borde === "1px" && pp.bordeColor === "rgb(228, 228, 228)";
      if (!(okSig && okPp)) fallos.ca10.push(`${s}${okSig ? "" : " enlace"}${okPp ? "" : " pie de pagina"}`);
    }
  }

  addInv("album-movil", "CA3 sin GLSurface ni Lenis, sin canvas, <img> visibles", !fallos.ca3.length, fallos.ca3.join("; "));
  if (!horizontal) {
    addInv("album-movil", "CA5 bloque de titulo del lienzo (12 / 64-68 / 12 px, margen 16u, huecos 12u y 10u, foto 1 asoma)", !fallos.ca5.length, fallos.ca5.join(", "));
    addInv("album-movil", "CA6 filas: anchos, margenes de 16u, pie a 14u, 54u hasta la foto siguiente", !fallos.ca6.length, fallos.ca6.slice(0, 12).join(", ") + (fallos.ca6.length > 12 ? ` (+${fallos.ca6.length - 12})` : ""));
    addInv("album-movil", "CA10 NEXT ALBUM un solo enlace con portada de 200u y titulo 40/44; pie de pagina en 3 lineas centradas con filete", !fallos.ca10.length, fallos.ca10.join(", "));
  } else {
    addInv("album-movil", "CA8 horizontal: fotos <= 300 px, pie a 24 px en columna de 200, base con base; nota en la columna a 48 px", !fallos.ca8.length, fallos.ca8.slice(0, 12).join(", ") + (fallos.ca8.length > 12 ? ` (+${fallos.ca8.length - 12})` : ""));
  }
  addInv("album-movil", "CA7 pie en tres lineas (18 italica / 14 #666 / 12 #A8A8A8 sin mayusculas, `a · b · ISO n`)", !fallos.ca7.length, fallos.ca7.slice(0, 12).join(", ") + (fallos.ca7.length > 12 ? ` (+${fallos.ca7.length - 12})` : ""));

  // CA9
  const lleg = await medirLlegadas(browser, CTX, BASE, slugs, motor);
  for (const x of lleg) log(`  llegada ${x.modo} ${x.slug}${x.destino ? ` -> ${x.destino}` : ""} · revelada a ${r1(x.tRev)} ms · intermedios ${x.intermedios ?? "—"} · blancos ${x.blancos ?? "—"}${x.y1500 ? ` · ${x.fling}, se movia ${r1(x.mov)} px · scrollY ${x.y500.y}/${x.y1500.y}` : ""}${x.detalle ? ` · ${x.detalle}` : ""}`);
  const malas = lleg.filter((x) => !x.ok).map((x) => `${x.modo} ${x.slug}`);
  addInv("album-movil", "CA9 foto 1 de golpe al estar lista, <= 1500 ms, sin blancos; NEXT ALBUM con scrollY 0 a 1500 ms", !malas.length, malas.join(", "));
  const vuelo = await medirVuelo(browser, CTX, BASE);
  log(`  vuelo carrusel -> album · ${vuelo.ruta ?? "—"} · GL album ${vuelo.gl} · fila 1 opacity ${vuelo.op} · <img> ${vuelo.vis}${vuelo.detalle ? ` · ${vuelo.detalle}` : ""}`);
  addInv("album-movil", "CA9 el vuelo carrusel -> album aterriza con la <img> visible y sin GL", !!vuelo.ok, JSON.stringify(vuelo));

  // CA11 (vertical), con y sin reduced motion
  if (!horizontal) {
    for (const rm of [false, true]) {
      const { ctx, p } = await abrir(browser, CTX, BASE, `/album/${slugs[0]}`, rm ? { reducedMotion: "reduce" } : {});
      const f = await medirFundido(p).catch(() => null);
      await ctx.close();
      log(`  fundido NEXT ALBUM${rm ? " (reduced motion)" : ""} · antes ${r1(f?.antes?.op)} · a 80 ms ${r1(f?.durante?.op)} · despues ${r1(f?.despues?.op)} · transition ${f?.despues?.prop || "—"} ${f?.despues?.dur || ""}`);
      const ok = f && f.antes?.op === 0 && f.despues?.op === 1 && f.despues.prop === "opacity" && f.despues.dur === "0.3s";
      addInv("album-movil", `CA11 portada de NEXT ALBUM con fundido de 300 ms al cruzar el 20 % inferior${rm ? " (reduced motion)" : ""}`, !!ok, JSON.stringify(f));
    }
  }
}

// ---------- escritorio: cajas de la pagina de album (CA2) ----------
// Cajas en coordenadas de pagina de cada pieza que esta spec toca, para
// guardarlas y compararlas junto a las capturas: el bloque de titulo, cada
// <img>, cada hoja de texto visible del pie, NEXT ALBUM y el pie de pagina.
export async function medirCajasAlbum({ browser, BASE, CTX, slugs }) {
  const res = {};
  for (const slug of slugs) {
    const { ctx, p } = await abrir(browser, CTX, BASE, `/album/${slug}`);
    const n = await p.evaluate(() => document.querySelectorAll("main [data-photo-index]").length).catch(() => 0);
    for (let i = 0; i < n; i++) {
      await p.evaluate(async (i) => {
        const row = document.querySelectorAll("main [data-photo-index]")[i];
        row.scrollIntoView({ block: "center" });
        const img = row.querySelector("img");
        for (let k = 0; k < 50 && !(img.complete && img.naturalWidth > 0); k++) await new Promise((r) => setTimeout(r, 100));
      }, i).catch(() => {});
    }
    await p.waitForTimeout(ESPERA_FILA);
    res[slug] = await p.evaluate(() => {
      const main = [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none");
      const out = {};
      const poner = (k, e) => { if (!e) return; const b = e.getBoundingClientRect(); if (b.width < 0.5 && b.height < 0.5) return; out[k] = [b.left, b.top + scrollY, b.width, b.height].map((x) => Math.round(x * 10) / 10); };
      const hojas = (pref, raiz) => [...(raiz?.querySelectorAll("*") ?? [])].filter((e) => !e.children.length && e.textContent.trim() && e.getBoundingClientRect().width > 0).forEach((e, j) => poner(`${pref}.${j}:${e.textContent.trim().slice(0, 24)}`, e));
      hojas("cabecera", main.querySelector("[data-album-cabecera]"));
      main.querySelectorAll("[data-photo-index]").forEach((row, i) => { poner(`img${i}`, row.querySelector("img")); hojas(`pie${i}`, [...row.querySelectorAll("[data-album-pie]")].find((e) => e.getBoundingClientRect().height > 0)); });
      poner("siguiente", main.querySelector("[data-album-siguiente]"));
      hojas("siguiente", main.querySelector("[data-album-siguiente]"));
      poner("portada", main.querySelector("[data-album-portada]"));
      poner("piePagina", main.querySelector("[data-pie-pagina]"));
      hojas("piePagina", main.querySelector("[data-pie-pagina]"));
      poner("main", main);
      return out;
    }).catch(() => null);
    await ctx.close();
  }
  return res;
}

/** Diferencias (> 0,5 px) entre dos medidas de medirCajasAlbum. */
export function compararCajasAlbum(ref, act) {
  const dif = [];
  for (const slug of Object.keys(ref ?? {})) {
    const a = ref[slug] ?? {}, b = act?.[slug] ?? {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (!a[k] || !b[k]) { dif.push(`${slug} ${k}: ${a[k] ? "falta ahora" : "nueva"}`); continue; }
      if (a[k].some((x, i) => Math.abs(x - b[k][i]) > 0.5)) dif.push(`${slug} ${k}: ${a[k].join(",")} -> ${b[k].join(",")}`);
    }
  }
  return dif;
}

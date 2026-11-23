// Seccion `notas-movil` del diagnostico (spec 022): las notas y citas de la
// pagina de album en movil. Bajo `movil:` van debajo del pie de su foto, en el
// margen izquierdo de la fila, con 48 px de aire, sin estrechar la foto, y la
// cita con el estilo del lienzo Album A (22/28 px, italica, #111111, 300 px).
//
// En modo dispositivo, si el perfil es movil (MOVIL de ./navegacion.mjs),
// comprueba CA4-CA7 de la spec. En escritorio, `medirCajasNotas` devuelve las
// cajas de cada texto y de su foto, relativas a la foto, para guardarlas y
// compararlas con --capturas-guardar / --capturas-comparar (CA3).

import { MOVIL } from "./navegacion.mjs";

const ESPERA_ALBUM = 3000;
const ESPERA_FILA = 700;
const CITA_MIN = 260, CITA_MAX = 300;
const AIRE = 48;
const r1 = (x) => (x == null ? "—" : Math.round(x * 10) / 10);

// Mide, fila a fila, cada texto lateral de la pagina abierta. Trae cada fila al
// centro y espera a que su foto cargue: con `w-auto h-auto`, una <img> sin
// cargar mide 0. Todo se devuelve relativo (anchos, huecos, distancias), asi
// que no depende de por donde vaya el scroll.
async function medirPagina(p) {
  const n = await p.evaluate(() => document.querySelectorAll("[data-album-text][data-text-kind=beside], [data-photo-quote]").length);
  const out = [];
  for (let i = 0; i < n; i++) {
    await p.evaluate(async (i) => {
      const el = document.querySelectorAll("[data-album-text][data-text-kind=beside], [data-photo-quote]")[i];
      const row = el.closest("[data-photo-index]");
      row.scrollIntoView({ block: "center" });
      const img = row.querySelector("img");
      for (let k = 0; k < 50 && !(img.complete && img.naturalWidth > 0); k++) await new Promise((r) => setTimeout(r, 100));
    }, i);
    await p.waitForTimeout(ESPERA_FILA);
    out.push(await p.evaluate((i) => {
      const el = document.querySelectorAll("[data-album-text][data-text-kind=beside], [data-photo-quote]")[i];
      const row = el.closest("[data-photo-index]");
      const celdaTexto = el.parentElement;
      const rejilla = celdaTexto.parentElement;
      const pie = rejilla.children[1];
      const img = row.querySelector("img");
      const B = (e) => e.getBoundingClientRect();
      const bt = B(el), bc = B(celdaTexto), bp = B(pie), bi = B(img), br = B(row);
      const cs = getComputedStyle(row);
      const izq = br.left + parseFloat(cs.paddingLeft);
      const util = br.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ratio = (+img.getAttribute("width")) / (+img.getAttribute("height"));
      const esperado = Math.min(util, 0.85 * innerHeight * ratio, +img.getAttribute("width"));
      const pEl = el.querySelector("p");
      const ps = getComputedStyle(pEl);
      return {
        tipo: el.hasAttribute("data-photo-quote") ? "cita" : "nota",
        foto: +row.dataset.photoIndex + 1,
        vw: innerWidth,
        display: getComputedStyle(rejilla).display,
        ancho: bt.width, alto: bt.height,
        izq: bt.left, der: bt.right, izqFila: izq, util,
        // Respecto a la foto: lo que CA3 compara en escritorio.
        dx: bt.left - bi.left, dy: bt.top - bi.top,
        imgAncho: bi.width, imgAlto: bi.height, imgEsperado: esperado,
        sobreFoto: bt.top < bi.bottom - 0.5 && bt.bottom > bi.top + 0.5 && bt.left < bi.right - 0.5 && bt.right > bi.left + 0.5,
        bajoPie: bc.top >= bp.bottom - 0.5,
        aire: bc.top - bp.bottom,
        fs: ps.fontSize, lh: ps.lineHeight, estilo: ps.fontStyle, color: ps.color,
      };
    }, i));
  }
  return out;
}

async function abrir(browser, CTX, BASE, ruta) {
  const ctx = await browser.newContext({ ...CTX });
  const p = await ctx.newPage();
  await p.goto(BASE + ruta, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(ESPERA_ALBUM);
  return { ctx, p };
}

/** Escritorio (CA3): cajas de cada texto lateral, relativas a su foto. */
export async function medirCajasNotas({ browser, BASE, CTX, slugs }) {
  const res = {};
  for (const slug of slugs) {
    const { ctx, p } = await abrir(browser, CTX, BASE, `/album/${slug}`);
    const m = await medirPagina(p).catch(() => null);
    res[slug] = m?.map((o) => ({ tipo: o.tipo, foto: o.foto, ancho: r1(o.ancho), alto: r1(o.alto), dx: r1(o.dx), dy: r1(o.dy), imgAncho: r1(o.imgAncho), imgAlto: r1(o.imgAlto) })) ?? null;
    await ctx.close();
  }
  return res;
}

/** Compara dos medidas de medirCajasNotas; devuelve las diferencias (> 1 px). */
export function compararCajasNotas(ref, act) {
  const dif = [];
  for (const slug of Object.keys(ref ?? {})) {
    const a = ref[slug] ?? [], b = act?.[slug] ?? [];
    if (a.length !== b.length) { dif.push(`${slug}: ${a.length} textos en la referencia, ${b.length} ahora`); continue; }
    a.forEach((x, i) => {
      for (const k of ["ancho", "alto", "dx", "dy", "imgAncho", "imgAlto"]) {
        if (Math.abs(x[k] - b[i][k]) > 1) dif.push(`${slug} ${x.tipo} foto ${x.foto}: ${k} ${x[k]} -> ${b[i][k]}`);
      }
    });
  }
  return dif;
}

/** Modo dispositivo: CA4-CA7 en los cuatro albumes. */
export async function seccionNotasMovil({ browser, BASE, CTX, log, rule, addInv, slugs }) {
  rule("notas-movil");
  const prueba = await abrir(browser, CTX, BASE, `/album/${slugs[0]}`);
  const movil = await prueba.p.evaluate((q) => matchMedia(q).matches, MOVIL).catch(() => false);
  await prueba.ctx.close();
  if (!movil) { log("  no es movil: seccion omitida"); return; }

  const todos = [];
  for (const slug of slugs) {
    const { ctx, p } = await abrir(browser, CTX, BASE, `/album/${slug}`);
    const m = await medirPagina(p).catch((e) => { log(`  ${slug}: sin medida (${e.message.split("\n")[0]})`); return []; });
    await ctx.close();
    for (const o of m) {
      todos.push({ slug, ...o });
      log(`  ${slug} ${o.tipo} foto ${o.foto} · ${r1(o.ancho)}x${r1(o.alto)} en x ${r1(o.izq)} (fila ${r1(o.izqFila)}, util ${r1(o.util)}) · rejilla ${o.display} · aire ${r1(o.aire)} · foto ${r1(o.imgAncho)} de ${r1(o.imgEsperado)} · ${o.fs}/${o.lh} ${o.estilo} ${o.color}`);
    }
  }
  if (!todos.length) { addInv("notas-movil", "textos laterales medibles", false, "ninguno"); return; }

  const malos = (f) => todos.filter((o) => !f(o)).map((o) => `${o.slug} ${o.tipo} ${o.foto}`);
  const check = (nombre, f, detalle = (m) => m.join(", ")) => {
    const m = malos(f);
    addInv("notas-movil", nombre, m.length === 0, m.length ? detalle(m) : "");
  };
  const citas = todos.filter((o) => o.tipo === "cita");

  check("CA4 cada texto debajo del pie de su foto, sin tocar la foto", (o) => o.bajoPie && !o.sobreFoto);
  check("CA5 ningun texto sale del viewport", (o) => o.izq >= -0.5 && o.der <= o.vw + 0.5);
  {
    const m = citas.filter((o) => o.ancho < Math.min(CITA_MIN, o.util) - 0.5).map((o) => `${o.slug} ${o.foto}: ${r1(o.ancho)} px`);
    addInv("notas-movil", `CA5 cada cita de >= ${CITA_MIN} px (o el ancho util)`, m.length === 0, m.join(", "));
  }
  check("CA6 la foto de una fila con texto mide lo que sin texto (± 1 px)", (o) => Math.abs(o.imgAncho - o.imgEsperado) <= 1);
  {
    const m = citas.filter((o) => !(o.fs === "22px" && o.lh === "28px" && o.estilo === "italic" && o.color === "rgb(17, 17, 17)" && o.ancho <= CITA_MAX + 0.5))
      .map((o) => `${o.slug} ${o.foto}: ${o.fs}/${o.lh} ${o.estilo} ${o.color} ${r1(o.ancho)} px`);
    addInv("notas-movil", `CA7 cita a 22/28 px, italica, #111111, <= ${CITA_MAX} px`, m.length === 0, m.join(", "));
  }
  check(`CA7 aire de ${AIRE} ± 1 px entre el pie y el texto`, (o) => Math.abs(o.aire - AIRE) <= 1);
  check("CA7 texto en el margen izquierdo de la fila (± 1 px)", (o) => Math.abs(o.izq - o.izqFila) <= 1);
}

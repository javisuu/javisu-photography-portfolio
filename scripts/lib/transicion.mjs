// Seccion `transicion` del diagnostico (spec 019, T9): la transicion
// carrusel → album y su vuelta, medida contra los criterios CA3-CA13 de
// specs/019-transicion-carrusel-album/spec.md.
//
// Como se mide:
// - Un muestreador por rAF (addInitScript) que vive en el documento de
//   /albums y sobrevive a la navegacion cliente. En cada fotograma lee los
//   clones de la capa (`[data-transicion-capa]`), los destinos de la pagina
//   de album, el carrusel y la sonda `window.__transicion`.
// - Un MutationObserver sobre `style` en la capa, los destinos, la fila de la
//   foto 1 y el carrusel: que propiedades cambian, y cuantas veces en el
//   mismo elemento (CA7, CA11, CA13).
// - Para CA10, un screencast de CDP: el pixel central del hueco de la foto 1,
//   fotograma a fotograma, como hace "llegada al album".
// Mide; no cambia nada. Lee window.__transicion y window.__glDiag, sin
// escribirlos.

const BG = [250, 250, 250];
const BG_TOL = 2;
const PX_BOX = 16; // lado del cuadrado central que se clasifica
const BLANK_MAX_FRACTION = 0.005;
const SETTLE_MS = 3500;
const ARROW_WAIT_MS = 900;
const FLIGHT_WAIT_MS = 3000;
const RETURN_WAIT_MS = 2000;
const TOL_PX = 1;
// plan.md: la ida dura RISE_S (0,9 s) desde el clic; CA8b pide 800-1100 ms.
const DURATION_MIN_MS = 800;
const DURATION_MAX_MS = 1100;
// Fundidos de 300 ms (T7 con scroll, T8): margen de un par de frames.
const FADE_MAX_MS = 400;
// Propiedades que una animacion puede tocar (CA7). GSAP escribe tambien las
// propiedades individuales de transform (translate, rotate, scale: las pone
// a "none" para que no choquen con la suya).
const ALLOWED = new Set(["transform", "opacity", "transform-origin", "translate", "rotate", "scale"]);

// ---------- muestreador (corre en la pagina) ----------
export function transitionSampler() {
  const ids = new WeakMap();
  let next = 0;
  const id = (el) => {
    if (!ids.has(el)) ids.set(el, ++next);
    return ids.get(el);
  };
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height];
  };
  const op = (el, stop) => {
    let o = 1;
    for (let e = el; e && e !== stop && e !== document.documentElement; e = e.parentElement) o *= +getComputedStyle(e).opacity;
    return o;
  };
  const carouselRoot = () => document.querySelector("[data-carousel-slide]")?.closest("div.flex.h-full") ?? null;
  const visibleMain = () => [...document.querySelectorAll("main")].find((m) => getComputedStyle(m).display !== "none") ?? null;
  window.__tr = { frames: [], muts: [], recording: false };
  let mo = null;
  const who = (el) => {
    const capa = document.querySelector("[data-transicion-capa]");
    if (capa?.contains(el)) {
      const holder = el.closest("[data-transicion-rol]") ?? el.querySelector?.("[data-transicion-rol]");
      return `capa:${holder?.dataset.transicionRol ?? "?"}#${id(holder ?? el)}:${el.tagName.toLowerCase()}`;
    }
    const dest = el.closest("[data-transicion-destino]");
    if (dest) return `destino:${dest.dataset.transicionDestino}:${el.tagName.toLowerCase()}`;
    if (el.closest('[data-photo-index="0"]')) return `fila0:${el.tagName.toLowerCase()}`;
    const root = carouselRoot();
    if (root && (el === root || root.contains(el))) return el === root ? "carrusel:raiz" : `carrusel:${el.tagName.toLowerCase()}`;
    return null;
  };
  const parse = (s) => Object.fromEntries((s ?? "").split(";").map((d) => {
    const i = d.indexOf(":");
    return i < 0 ? [] : [d.slice(0, i).trim(), d.slice(i + 1).trim()];
  }).filter((d) => d[0]));
  window.__trStart = () => {
    window.__tr = { frames: [], muts: [], recording: true };
    mo?.disconnect();
    mo = new MutationObserver((list) => {
      const t = performance.timeOrigin + performance.now();
      for (const m of list) {
        const w = who(m.target);
        if (!w) continue;
        const a = parse(m.oldValue), b = parse(m.target.getAttribute("style"));
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (a[k] !== b[k]) window.__tr.muts.push({ t, who: w, el: id(m.target), prop: k });
        }
      }
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["style"] });
  };
  window.__trStop = () => {
    window.__tr.recording = false;
    mo?.disconnect();
    return window.__tr;
  };
  const tick = () => {
    requestAnimationFrame(tick);
    if (!window.__tr.recording) return;
    const capa = document.querySelector("[data-transicion-capa]");
    const st = window.__transicion;
    const main = visibleMain();
    const row = main?.querySelector('[data-photo-index="0"]') ?? null;
    const img = row?.querySelector("img") ?? null;
    const canvas = main?.querySelector("canvas") ?? null;
    const dest = (n) => document.querySelector(`[data-transicion-destino="${n}"]`);
    const root = carouselRoot();
    const ctitle = root?.querySelector("p.album-title") ?? null;
    window.__tr.frames.push({
      t: performance.timeOrigin + performance.now(),
      t0: st ? performance.timeOrigin + st.t0 : null,
      fase: st?.fase, path: location.pathname, scrollY,
      eventos: st?.eventos.length ?? 0,
      slides: [...(capa?.querySelectorAll("[data-transicion-envoltorio]") ?? [])].map((w) => {
        const f = w.firstElementChild;
        const im = f?.querySelector("img");
        const panel = f?.firstElementChild?.lastElementChild;
        return {
          id: id(w), role: f?.dataset.transicionRol, r: box(f), op: op(f, capa),
          panel: panel ? +getComputedStyle(panel).opacity : null,
          src: im?.getAttribute("src") ?? "", nat: im ? [im.naturalWidth, im.naturalHeight] : null,
        };
      }),
      texts: [...(capa?.querySelectorAll('[data-transicion-rol="titulo"], [data-transicion-rol="descripcion"]') ?? [])].map((e) => ({
        id: id(e), role: e.dataset.transicionRol, r: box(e), op: op(e, capa), txt: e.textContent,
      })),
      others: [...(capa?.querySelectorAll('[data-transicion-rol="extra"], [data-transicion-rol="foto"], [data-transicion-rol="carrusel"]') ?? [])].map((e) => ({
        id: id(e), role: e.dataset.transicionRol, r: box(e), op: op(e, capa),
      })),
      page: dest("title") ? {
        title: { op: op(dest("title").firstElementChild), r: box(dest("title").firstElementChild) },
        description: { op: op(dest("description").firstElementChild), r: box(dest("description").firstElementChild) },
        label: dest("label") ? { op: op(dest("label").firstElementChild), r: box(dest("label").firstElementChild) } : null,
        row: row ? { op: parseFloat(row.style.opacity), vis: img ? getComputedStyle(img).visibility : null, r: box(img), complete: !!img?.complete } : null,
        canvas: canvas ? +getComputedStyle(canvas).opacity : null,
        subidas: window.__glDiag?.album?.subidas ?? 0,
      } : null,
      carousel: root ? {
        vis: getComputedStyle(root).visibility, op: +getComputedStyle(root).opacity,
        title: ctitle ? { vis: getComputedStyle(ctitle).visibility, r: box(ctitle) } : null,
        active: root.querySelector("a[href^='/album/']")?.getAttribute("href") ?? null,
      } : null,
    });
  };
  requestAnimationFrame(tick);
}

// ---------- utilidades ----------
const near = (a, b, tol = TOL_PX) => !!a && !!b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const fmt = (r) => (r ? r.map((v) => Math.round(v * 10) / 10).join(",") : "—");
const inView = (r, vw, vh) => r && r[0] < vw && r[0] + r[2] > 0 && r[1] < vh && r[1] + r[3] > 0;

async function activeHref(p) {
  return p.evaluate(() => document.querySelector("[data-carousel-slide]")?.closest("div.flex.h-full")?.querySelector("a[href^='/album/']")?.getAttribute("href") ?? null).catch(() => null);
}
async function restRects(p) {
  return p.evaluate(() => [...document.querySelectorAll("[data-carousel-slide]")]
    .map((n) => n.getBoundingClientRect())
    .filter((r) => r.right > 0 && r.left < innerWidth)
    .map((r) => [r.left, r.top, r.width, r.height])
    .sort((a, b) => a[0] - b[0])).catch(() => []);
}
async function goToAlbum(p, slug) {
  for (let i = 0; i < 8; i++) {
    if ((await activeHref(p)) === `/album/${slug}`) return true;
    await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(ARROW_WAIT_MS);
  }
  return (await activeHref(p)) === `/album/${slug}`;
}
async function clickOpen(p) {
  // El landing oculto tambien tiene enlaces a albumes: solo el visible.
  const box = await p.locator("a[href^='/album/']:visible").first().boundingBox();
  await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

// ---------- la seccion ----------
export async function seccionTransicion({ browser, BASE, CTX, log, rule, addInv, slugs, reps }) {
  rule("transicion");
  const vw = CTX.viewport.width, vh = CTX.viewport.height;
  const decoder = await browser.newPage();
  log(`${slugs.length} albumes · CA10 con ${reps} vuelo${reps > 1 ? "s" : ""} por album · ${vw}x${vh}`);

  async function openPage({ reduced = false } = {}) {
    const ctx = await browser.newContext({ ...CTX, ...(reduced ? { reducedMotion: "reduce" } : {}) });
    const p = await ctx.newPage();
    const errs = [];
    p.on("pageerror", (e) => errs.push(e.message));
    p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
    await p.addInitScript(transitionSampler);
    await p.goto(BASE + "/albums", { waitUntil: "load" });
    await p.waitForTimeout(SETTLE_MS);
    const cdp = await ctx.newCDPSession(p);
    return { ctx, p, errs, cdp };
  }
  async function record(page, act, waitMs, cast = false) {
    const { p, cdp } = page;
    const shots = [];
    let onFrame = null;
    if (cast) {
      onFrame = (f) => {
        shots.push({ t: f.metadata.timestamp * 1000, data: f.data, deviceWidth: f.metadata.deviceWidth });
        cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      };
      cdp.on("Page.screencastFrame", onFrame);
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, maxWidth: vw, maxHeight: vh, everyNthFrame: 1 });
    }
    await p.evaluate(() => window.__trStart());
    await act();
    await p.waitForTimeout(waitMs);
    const rec = await p.evaluate(() => window.__trStop());
    if (cast) {
      await cdp.send("Page.stopScreencast").catch(() => {});
      cdp.off("Page.screencastFrame", onFrame);
    }
    const ev = await p.evaluate(() => window.__transicion.eventos).catch(() => []);
    // El t0 de la sonda es el del ultimo clic o vuelta: los primeros
    // fotogramas aun pueden llevar el de la transicion anterior.
    const t0 = rec.frames[rec.frames.length - 1]?.t0 ?? rec.frames[0]?.t;
    return { ...rec, shots, ev, t0 };
  }
  const evT = (r, name) => r.ev.find((e) => e.name === name)?.t;

  // CA10: pixel central del hueco de la foto 1, desde que la lamina llega
  // hasta 1000 ms despues de que se ocultan las <img>.
  async function blankFrames(r) {
    const tLand = evT(r, "asentado");
    if (tLand === undefined) return { checked: 0, blank: [], note: "sin asentado" };
    const t0 = r.t0;
    const hidden = r.frames.find((f) => f.page?.row?.vis === "hidden");
    const tEnd = hidden ? hidden.t + 1000 : t0 + tLand + 2500;
    const blank = [];
    let checked = 0;
    for (const s of r.shots) {
      if (s.t < t0 + tLand || s.t > tEnd) continue;
      const prev = r.frames.filter((f) => f.t <= s.t && f.page?.row?.r).pop();
      if (!prev) continue;
      const [x, y, w, h] = prev.page.row.r;
      const frac = await decoder.evaluate(async ({ data, cx, cy, deviceWidth, bg, tol, side }) => {
        const img = new Image();
        img.src = `data:image/jpeg;base64,${data}`;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const k = img.width / deviceWidth;
        const d = ctx.getImageData(Math.round((cx - side / 2) * k), Math.round((cy - side / 2) * k), Math.max(1, Math.round(side * k)), Math.max(1, Math.round(side * k))).data;
        let off = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) > tol || Math.abs(d[i + 1] - bg[1]) > tol || Math.abs(d[i + 2] - bg[2]) > tol) off++;
        return off / (d.length / 4);
      }, { data: s.data, cx: x + w / 2, cy: Math.min(y + h / 2, vh - PX_BOX), deviceWidth: s.deviceWidth, bg: BG, tol: BG_TOL, side: PX_BOX });
      checked++;
      if (frac < BLANK_MAX_FRACTION) blank.push(Math.round(s.t - t0));
    }
    return { checked, blank };
  }
  // CA10 (doble composicion) y CA9: por muestreo del DOM.
  function glChecks(r) {
    const ida = r.frames.filter((f) => f.fase === "ida" && f.page);
    const canvasInFlight = ida.filter((f) => f.page.canvas !== null).length;
    const imgsHiddenInFlight = ida.filter((f) => f.page.row && f.page.row.vis === "hidden").length;
    const firstHidden = r.frames.find((f) => f.page?.row?.vis === "hidden");
    const both = r.frames.filter((f) => f.page?.row && f.page.row.vis !== "hidden" && f.page.row.op >= 1 && (f.page.canvas ?? 0) > 0.01).length;
    return { canvasInFlight, imgsHiddenInFlight, subidasAtHide: firstHidden?.page.subidas ?? null, both };
  }

  // ---------- ida, un vuelo completo por album ----------
  async function outbound(slug, { cast = false, page = null } = {}) {
    const own = !page;
    const pg = page ?? await openPage();
    const { p, errs } = pg;
    const ok = await goToAlbum(p, slug);
    await p.waitForTimeout(1200);
    const before = await restRects(p);
    const r = await record(pg, () => clickOpen(p), FLIGHT_WAIT_MS, cast);
    r.before = before;
    r.reached = ok;
    r.errs = errs;
    if (own) r.page = pg;
    return r;
  }

  function checkOutbound(slug, r, route) {
    const coverIsFirst = r.ev.every((e) => e.name !== "relevo-textura");
    const fr = r.frames.filter((f) => f.t >= r.t0);
    const first = fr.find((f) => f.slides.length);
    const lastWithSlides = [...fr].reverse().find((f) => f.slides.some((s) => s.role === "sube"));
    log(`  ${slug}: ${fr.length} fotogramas · eventos ${r.ev.map((e) => `${e.name}@${e.t}`).join(" ")}`);
    if (!first || !lastWithSlides) {
      addInv(route, "vuelo medible", false, `sin clones en la capa (album alcanzado: ${r.reached})`);
      return;
    }
    // CA5: que sube, que baja, que se va por arriba.
    const open = [...first.slides].sort((a, b) => b.r[2] - a.r[2])[0];
    const sube = first.slides.find((s) => s.role === "sube");
    const leftOfOpen = first.slides.filter((s) => s.r[0] < open.r[0]).sort((a, b) => b.r[0] - a.r[0]);
    const expectedRiser = coverIsFirst ? open : leftOfOpen[0];
    const lastSeen = new Map();
    for (const f of fr) for (const s of f.slides) lastSeen.set(s.id, s);
    const wrongSide = first.slides.filter((s) => s.role !== "sube").filter((s) => {
      const end = lastSeen.get(s.id);
      if (s.r[0] >= open.r[0] || s.id === open.id) return !(s.role === "baja" && end.r[1] >= vh);
      return !(s.role === "arriba" && end.r[1] + end.r[3] <= 0);
    });
    addInv(route, "CA5 sube la lamina que toca", !!sube && sube.id === expectedRiser?.id,
      `sube ${sube ? fmt(sube.r) : "—"}, esperada ${expectedRiser ? fmt(expectedRiser.r) : "—"} (${coverIsFirst ? "la abierta" : "la de la izquierda"})`);
    if (!coverIsFirst) addInv(route, "CA5 la abierta baja", open.role === "baja", `rol ${open.role}`);
    addInv(route, "CA5 derecha por abajo, izquierda por arriba", wrongSide.length === 0,
      wrongSide.map((s) => `${s.role} ${fmt(s.r)} → ${fmt(lastSeen.get(s.id).r)}`).slice(0, 3).join(" | "));
    // CA4: la lamina aterriza en la foto 1, entera, con el panel a 0.
    const land = lastWithSlides.slides.find((s) => s.role === "sube");
    const photo = lastWithSlides.page?.row?.r;
    const ratio = land.nat?.[1] ? (land.r[2] / land.r[3]) / (land.nat[0] / land.nat[1]) : null;
    addInv(route, "CA4 lamina sobre la foto 1", near(land.r, photo), `lamina ${fmt(land.r)} · foto ${fmt(photo)}`);
    addInv(route, "CA4 imagen entera", ratio !== null && Math.abs(ratio - 1) < 0.01, `proporcion visible/natural ${ratio?.toFixed(4)}`);
    addInv(route, "CA4 panel a 0", land.panel !== null && land.panel <= 0.001, `panel ${land.panel}`);
    // CA6: texturas.
    const srcChanges = [];
    const firstSrc = new Map(first.slides.map((s) => [s.id, s.src]));
    for (const f of fr) for (const s of f.slides) {
      if (firstSrc.has(s.id) && firstSrc.get(s.id) !== s.src && !srcChanges.some((c) => c.id === s.id)) srcChanges.push({ id: s.id, t: f.t - r.t0, role: s.role, panel: s.panel });
    }
    // El src del primer fotograma ya puede ser el nuevo: el relevo cae en la
    // misma tarea que el clic. Se cuenta por el evento.
    const tSwap = evT(r, "relevo-textura");
    const riserPanelAtClick = sube.panel;
    if (coverIsFirst) {
      addInv(route, "CA6 ninguna lamina cambia de foto", tSwap === undefined && srcChanges.length === 0, `relevo ${tSwap} · cambios ${srcChanges.length}`);
    } else {
      addInv(route, "CA6 solo cambia la que sube, antes de 80 ms, bajo su panel",
        tSwap !== undefined && tSwap < 80 && srcChanges.every((c) => c.id === sube.id) && riserPanelAtClick >= 0.9,
        `relevo a ${tSwap} ms · panel ${riserPanelAtClick} · cambios en ${srcChanges.map((c) => c.role).join(",") || "—"}`);
    }
    const openSrcChanged = srcChanges.some((c) => c.id === open.id);
    addInv(route, "CA6 la abierta no cambia de foto", !openSrcChanged, "la abierta cambio de src");
    const foreign = [];
    for (const f of fr) for (const s of f.slides) {
      if (s.panel !== null && s.panel < 0.9 && inView(s.r, vw, vh) && !s.src.includes(`%2Fphotos%2F${slug}%2F`) && !s.src.includes(`/photos/${slug}/`)) foreign.push(`${s.role} ${s.src.slice(0, 60)}`);
    }
    addInv(route, "CA6 sin panel, solo fotos del album abierto", foreign.length === 0, [...new Set(foreign)].slice(0, 2).join(" | "));
    // CA7: solo transform y opacidad animados.
    const per = new Map();
    // Solo el vuelo: la capa, los destinos y la fila de la foto 1. El
    // carrusel, oculto desde el clic, cambia su propio estado de React
    // (cursor de arrastre, variables del hover) y no forma parte del vuelo.
    for (const m of r.muts) {
      if (m.t > r.t0 + (evT(r, "asentado") ?? 2000) || m.who.startsWith("carrusel:")) continue;
      const k = `${m.who}|${m.prop}`;
      per.set(k, (per.get(k) ?? 0) + 1);
    }
    const animated = [...per].filter(([k, n]) => !ALLOWED.has(k.split("|")[1]) && n >= 2);
    const once = [...per].filter(([k, n]) => !ALLOWED.has(k.split("|")[1]) && n < 2).map(([k]) => k);
    if (once.length) log(`     CA7 cambios sueltos (no animados): ${once.slice(0, 6).join(" · ")}`);
    addInv(route, "CA7 solo transform y opacidad animados", animated.length === 0, animated.slice(0, 4).map(([k, n]) => `${k} ×${n}`).join(" · "));
    // CA8: cascada en orden de x, sin fundido hasta salir.
    const downs = first.slides.filter((s) => s.role === "baja").sort((a, b) => a.r[0] - b.r[0]);
    const startOf = (s) => fr.find((f) => { const x = f.slides.find((y) => y.id === s.id); return x && Math.abs(x.r[1] - s.r[1]) > 0.5; })?.t ?? Infinity;
    const starts = downs.map(startOf);
    const ordered = starts.every((t, i) => i === 0 || t >= starts[i - 1]);
    addInv(route, "CA8 lo que baja empieza en orden de x", ordered, starts.map((t) => (t === Infinity ? "—" : Math.round(t - r.t0))).join(" "));
    const faded = [];
    for (const f of fr) for (const s of f.slides) if ((s.role === "baja" || s.role === "arriba") && inView(s.r, vw, vh) && s.op < 0.999) faded.push(`${s.role} ${s.op.toFixed(2)}`);
    addInv(route, "CA8 sin fundido hasta salir", faded.length === 0, faded.slice(0, 3).join(" | "));
    // CA8b: duracion.
    const dur = evT(r, "asentado");
    addInv(route, "CA8b duracion", dur !== undefined && dur >= DURATION_MIN_MS && dur <= DURATION_MAX_MS, `${dur} ms`);
    // CA3: titulo y descripcion.
    for (const [role, key] of [["titulo", "title"], ["descripcion", "description"]]) {
      const withText = fr.filter((f) => f.texts.some((x) => x.role === role));
      const lastT = withText[withText.length - 1];
      const shown = lastT ? [...lastT.texts.filter((x) => x.role === role)].sort((a, b) => b.op - a.op)[0] : null;
      const target = lastT?.page?.[key]?.r;
      addInv(route, `CA3 ${role} aterriza en su sitio`, !!shown && near(shown.r, target), `clon ${fmt(shown?.r)} · pagina ${fmt(target)}`);
      const both = fr.filter((f) => f.page && f.texts.some((x) => x.role === role && x.op > 0.01) && f.page[key].op > 0.01).length;
      const none = fr.filter((f, i) => i > 0 && f.page && f.fase !== "reposo" && !f.texts.some((x) => x.role === role && x.op > 0.01) && f.page[key].op <= 0.01).length;
      addInv(route, `CA3 ${role}: nunca los dos visibles, nunca ninguno`, both === 0 && none === 0, `los dos ${both} · ninguno ${none}`);
    }
    // No viajan como bloque: diferencia de desplazamientos > 1 px en algun frame.
    const disp = (f, role, o) => { const x = f.texts.filter((y) => y.role === role).sort((a, b) => b.op - a.op)[0]; return x && o ? [x.r[0] - o.r[0], x.r[1] - o.r[1]] : null; };
    const o1 = first.texts.find((x) => x.role === "titulo"), o2 = first.texts.find((x) => x.role === "descripcion");
    const apart = fr.some((f) => { const a = disp(f, "titulo", o1), b = disp(f, "descripcion", o2); return a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) > 1; });
    addInv(route, "CA3 titulo y descripcion no van como bloque", apart, "mismos desplazamientos en todos los fotogramas");
    // CA3b: la etiqueta no viaja y entra con fundido.
    const labels = fr.filter((f) => f.page?.label);
    const lr0 = labels[0]?.page.label.r;
    const moved = labels.some((f) => !near(f.page.label.r, lr0, 0.5));
    const mid = labels.filter((f) => f.page.label.op > 0.01 && f.page.label.op < 0.99).length;
    const endsAt1 = (labels[labels.length - 1]?.page.label.op ?? 0) >= 0.99;
    addInv(route, "CA3b etiqueta quieta, con fundido", !moved && mid >= 3 && (labels[0]?.page.label.op ?? 1) <= 0.01 && endsAt1,
      `se mueve ${moved} · ${mid} fotogramas a medio fundido · de ${labels[0]?.page.label.op} a ${labels[labels.length - 1]?.page.label.op}`);
    // CA9: GL fuera del vuelo.
    const gl = glChecks(r);
    addInv(route, "CA9 sin canvas durante el vuelo", gl.canvasInFlight === 0, `${gl.canvasInFlight} fotogramas con canvas`);
    addInv(route, "CA9 <img> visibles durante el vuelo", gl.imgsHiddenInFlight === 0, `${gl.imgsHiddenInFlight} fotogramas con la <img> oculta`);
    addInv(route, "CA9 <img> ocultas con 2 texturas subidas", gl.subidasAtHide === null || gl.subidasAtHide >= 2, `subidas al ocultar: ${gl.subidasAtHide}`);
    addInv(route, "sin errores de consola", r.errs.length === 0, r.errs.slice(0, 2).join(" | "));
  }

  // ---------- vuelta ----------
  function checkReturn(r, route, { slug, before, scrolled, reduced = false }) {
    const fr = r.frames.filter((f) => f.t >= r.t0);
    const last = fr[fr.length - 1];
    const active = last?.carousel?.active;
    addInv(route, "vuelve al album abierto", active === `/album/${slug}`, `activo ${active}`);
    const blankFr = fr.filter((f, i) => i > 0 && f.path === "/albums" && f.carousel && (f.carousel.vis === "hidden" || f.carousel.op <= 0.01)
      && f.slides.length === 0 && f.texts.length === 0 && f.others.filter((o) => o.op > 0.01).length === 0).length;
    addInv(route, "sin fotogramas vacios", blankFr === 0, `${blankFr} fotogramas sin carrusel ni clones`);
    const tEnd = evT(r, "reposo");
    if (!scrolled && !reduced) {
      // CA12: las laminas vuelven a su reposo, y el relevo es al pixel.
      const hand = fr.findIndex((f, i) => i > 0 && f.slides.length === 0 && fr[i - 1].slides.length > 0);
      addInv(route, "CA12 vuelta completa", tEnd !== undefined && hand > 0, `reposo ${tEnd} · relevo en el fotograma ${hand}`);
      addInv(route, "CA12 laminas en su reposo", near(r.after?.flat(), before.flat()) && r.after.length === before.length,
        `antes ${before.length} · despues ${r.after?.length}`);
      return;
    }
    // CA13 / CA11: solo opacidad en el carrusel; duracion del fundido.
    const rootProps = r.muts.filter((m) => m.who === "carrusel:raiz").map((m) => m.prop);
    const bad = [...new Set(rootProps.filter((k) => k !== "opacity" && k !== "visibility"))];
    addInv(route, `${reduced ? "CA11" : "CA13"} el carrusel solo cambia de opacidad`, bad.length === 0, bad.join(","));
    addInv(route, `${reduced ? "CA11" : "CA13"} duracion del fundido`, tEnd !== undefined && tEnd <= FADE_MAX_MS, `${tEnd} ms`);
    if (reduced) {
      const tr = r.muts.filter((m) => m.prop === "transform" && m.who.startsWith("capa:"));
      addInv(route, "CA11 nada se mueve en la capa", tr.length === 0, tr.slice(0, 3).map((m) => m.who).join(" · "));
    } else {
      // El titulo es continuo: en cada fotograma se ve el clon o el del carrusel.
      const gap = fr.filter((f, i) => i > 0 && f.path === "/albums" && f.fase === "vuelta"
        && !f.texts.some((x) => x.role === "titulo" && x.op > 0.01) && !(f.carousel?.title?.vis === "visible" && f.carousel.op > 0.01)).length;
      addInv(route, "CA13 titulo continuo", gap === 0, `${gap} fotogramas sin titulo`);
    }
  }
  async function back(pg, { cast = false } = {}) {
    const r = await record(pg, () => pg.p.goBack(), RETURN_WAIT_MS, cast);
    r.after = await restRects(pg.p);
    return r;
  }

  const durations = [];
  const blanksTotal = [];
  for (const slug of slugs) {
    // Vuelo 1: todos los criterios. Vuelos 2..reps: CA10 y CA12.
    const pg = await openPage();
    for (let k = 1; k <= reps; k++) {
      const r = await outbound(slug, { cast: true, page: pg });
      if (k === 1) checkOutbound(slug, r, `transicion ${slug}`);
      const dur = evT(r, "asentado");
      if (dur !== undefined) durations.push(dur);
      const b = await blankFrames(r);
      const gl = glChecks(r);
      blanksTotal.push(...b.blank);
      if (k === 1 || b.blank.length || gl.both) log(`     CA10 vuelo ${k}: ${b.checked} fotogramas desde el aterrizaje · en blanco ${b.blank.length}${b.blank.length ? ` (${b.blank.slice(0, 5).join(" ")} ms)` : ""} · <img> y canvas a la vez ${gl.both}`);
      addInv(`transicion ${slug} · vuelo ${k}`, "CA10 sin blanco ni doble composicion", b.checked > 0 && b.blank.length === 0 && gl.both === 0,
        `${b.checked} fotogramas · en blanco ${b.blank.length} · a la vez ${gl.both}${b.note ? ` · ${b.note}` : ""}`);
      const rb = await back(pg);
      checkReturn(rb, `transicion ${slug} · vuelta ${k}`, { slug, before: r.before });
      if (k === 1) log(`     vuelta: ${rb.ev.map((e) => `${e.name}@${e.t}`).join(" ")}`);
      await pg.p.waitForTimeout(600);
    }
    // CA13: vuelta con scroll.
    const r = await outbound(slug, { page: pg });
    await pg.p.mouse.move(vw / 2, vh / 2);
    await pg.p.mouse.wheel(0, 900);
    await pg.p.waitForTimeout(1500);
    const sy = await pg.p.evaluate(() => scrollY);
    const rs = await back(pg);
    log(`     vuelta con scroll (${sy} px): ${rs.ev.map((e) => `${e.name}@${e.t}`).join(" ")}`);
    checkReturn(rs, `transicion ${slug} · vuelta con scroll`, { slug, before: r.before, scrolled: true });
    addInv(`transicion ${slug} · vuelta con scroll`, "sin errores de consola", pg.errs.length === 0, pg.errs.slice(0, 2).join(" | "));
    await pg.ctx.close();
  }
  durations.sort((a, b) => a - b);
  log(`  duracion de la ida: mediana ${durations[Math.floor((durations.length - 1) / 2)]} · min ${durations[0]} · max ${durations[durations.length - 1]} ms · fotogramas en blanco en total ${blanksTotal.length}`);

  // CA5b: america con la rendija de la izquierda a medio abrir.
  {
    const pg = await openPage();
    const { p } = pg;
    const target = slugs[0];
    await goToAlbum(p, target);
    await p.keyboard.press("ArrowLeft");
    await p.waitForTimeout(1500);
    await p.evaluate(() => {
      window.__clickRects = null;
      window.addEventListener("pointerdown", () => {
        window.__clickRects = [...document.querySelectorAll("[data-carousel-slide]")].map((n) => { const r = n.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
      }, { capture: true, once: true });
    });
    const r = await record(pg, async () => {
      await p.keyboard.press("ArrowRight");
      await p.waitForTimeout(140);
      await clickOpen(p);
    }, FLIGHT_WAIT_MS);
    const clickRects = await p.evaluate(() => window.__clickRects);
    const first = r.frames.find((f) => f.t >= r.t0 && f.slides.length);
    const sube = first?.slides.find((s) => s.role === "sube");
    const match = sube && clickRects ? clickRects.find((c) => near(c, sube.r)) : null;
    const nat = (await p.evaluate(() => window.__transicion.slug)) === target;
    const openness = match ? (match[2] - 110) / Math.max(1, (sube.nat ? (sube.nat[0] / sube.nat[1]) * 500 : 667) - 110) : null;
    log(`  CA5b ${target} en plena estela: abrio ${nat ? target : "otro album"} · rendija al clic ${fmt(match)} · apertura ~${openness?.toFixed(2)} · eventos ${r.ev.map((e) => `${e.name}@${e.t}`).join(" ")}`);
    addInv(`transicion CA5b ${target}`, "parte del rect del clic", !!match, `sube ${fmt(sube?.r)}`);
    addInv(`transicion CA5b ${target}`, "la rendija iba a medio abrir", openness !== null && openness > 0.05 && openness < 0.95,
      `apertura ${openness?.toFixed(3)} (si sale fuera, el clic no cayo en plena estela: es la medida, no el sitio)`);
    const last = [...r.frames].reverse().find((f) => f.slides.some((s) => s.role === "sube"));
    const land = last?.slides.find((s) => s.role === "sube");
    addInv(`transicion CA5b ${target}`, "CA4 aterriza en la foto 1", near(land?.r, last?.page?.row?.r), `${fmt(land?.r)} · ${fmt(last?.page?.row?.r)}`);
    await pg.ctx.close();
  }

  // CA8b: una rueda de 2000 px a los 200 ms no mueve el scroll.
  {
    const pg = await openPage();
    const { p } = pg;
    await goToAlbum(p, slugs[1] ?? slugs[0]);
    await p.waitForTimeout(1200);
    const r = await record(pg, async () => {
      await clickOpen(p);
      await p.waitForTimeout(200);
      await p.mouse.move(vw / 2, vh / 2);
      await p.mouse.wheel(0, 2000);
    }, FLIGHT_WAIT_MS);
    const tLand = evT(r, "asentado");
    const moved = r.frames.filter((f) => f.t >= r.t0 && (tLand === undefined || f.t <= r.t0 + tLand) && f.scrollY !== 0).length;
    const endY = r.frames[r.frames.length - 1]?.scrollY;
    addInv(`transicion CA8b`, "rueda bloqueada durante el vuelo", moved === 0, `${moved} fotogramas con scrollY distinto de 0`);
    log(`  CA8b rueda de 2000 px a los 200 ms: scrollY durante el vuelo ${moved ? "se movio" : "0"} · al final ${endY}`);
    await pg.ctx.close();
  }

  // CA11: prefers-reduced-motion, ida y vuelta.
  for (const slug of slugs.slice(0, 2)) {
    const pg = await openPage({ reduced: true });
    const r = await outbound(slug, { page: pg, cast: true });
    const route = `transicion reduced ${slug}`;
    const fr = r.frames.filter((f) => f.t >= r.t0);
    const moving = r.muts.filter((m) => m.prop === "transform" && m.t <= r.t0 + (evT(r, "asentado") ?? 1500));
    const flown = fr.some((f) => f.slides.length || f.texts.length);
    const dur = evT(r, "asentado");
    addInv(route, "CA11 sin transform durante la llegada", moving.length === 0 && !flown, `${moving.length} cambios de transform (${[...new Set(moving.map((m) => m.who))].slice(0, 3).join(" · ")}) · clones que vuelan ${flown}`);
    addInv(route, "CA11 duracion del fundido", dur !== undefined && dur <= FADE_MAX_MS, `${dur} ms`);
    const gl = glChecks(r);
    addInv(route, "CA9 sin canvas durante el fundido", gl.canvasInFlight === 0, `${gl.canvasInFlight}`);
    addInv(route, "CA9 <img> ocultas con 2 texturas subidas", gl.subidasAtHide === null || gl.subidasAtHide >= 2, `${gl.subidasAtHide}`);
    const b = await blankFrames(r);
    addInv(route, "CA10 sin blanco ni doble composicion", b.checked > 0 && b.blank.length === 0 && gl.both === 0, `${b.checked} fotogramas · en blanco ${b.blank.length} · a la vez ${gl.both}`);
    const rb = await back(pg);
    const tr = rb.muts.filter((m) => m.prop === "transform");
    if (tr.length) log(`     reduced ${slug}, vuelta: cambios de transform en ${[...new Set(tr.map((m) => m.who))].join(" · ")}`);
    checkReturn(rb, `${route} · vuelta`, { slug, before: r.before, reduced: true });
    addInv(route, "sin errores de consola", pg.errs.length === 0, pg.errs.slice(0, 2).join(" | "));
    log(`  reduced ${slug}: ida ${r.ev.map((e) => `${e.name}@${e.t}`).join(" ")} · vuelta ${rb.ev.map((e) => `${e.name}@${e.t}`).join(" ")}`);
    await pg.ctx.close();
  }
  await decoder.close();
}

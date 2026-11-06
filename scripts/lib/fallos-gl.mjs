// Secciones de la spec 018: GLSurface cuando algo falla. En Safari real las
// fotos del landing y de los albumes no se pintan (M9) y la emulacion no lo
// reproduce, asi que aqui se fuerza el fallo: createImageBitmap que rechaza
// (CA3) y el contexto WebGL perdido (CA4). Ademas, el panel ?diag (CA5) y la
// resolucion que pide el landing en movil (CA9).

// Una foto "se ve" si su caja interseca el viewport, su opacidad efectiva
// pasa de 0,5 y al menos FOTO_PINTADA_MIN de su interior no es el fondo en
// una captura. Los mismos umbrales que "fotos del landing" (spec 017).
const FOTO_PINTADA_MIN = 0.3;
const FONDO = [250, 250, 250];
const FONDO_TOL = 2;
const MARGEN_PX = 8;
// Fotos mas pequeñas que esto no cuentan: la portada de NEXT ALBUM.
const FOTO_MIN_PX = 120;
// La red espera 1,5 s a una decodificacion (decision 3); se mide despues.
export const ESPERA_RED_MS = 1500;

export const CREATE_IMAGE_BITMAP_RECHAZA = () => {
  window.createImageBitmap = () => Promise.reject(new Error("createImageBitmap forzado a fallar por el diagnostico"));
};

// Enmienda 2: lo que hace WebKit de iOS. Desde una <img>, createImageBitmap
// devuelve un bitmap transparente del mismo tamaño, sin error. Desde un Blob
// (el reintento de GLSurface) funciona normal.
export const CREATE_IMAGE_BITMAP_VACIO_DESDE_IMG = () => {
  const orig = window.createImageBitmap.bind(window);
  window.createImageBitmap = (src, ...rest) =>
    src instanceof HTMLImageElement
      ? orig(new ImageData(Math.max(1, src.naturalWidth), Math.max(1, src.naturalHeight)))
      : orig(src, ...rest);
};

// Enmienda 2: vacio tambien desde el Blob. GLSurface tiene que caer al DOM.
export const CREATE_IMAGE_BITMAP_VACIO_SIEMPRE = () => {
  const orig = window.createImageBitmap.bind(window);
  window.createImageBitmap = (src) => {
    const w = src instanceof HTMLImageElement ? src.naturalWidth : 64;
    const h = src instanceof HTMLImageElement ? src.naturalHeight : 64;
    return orig(new ImageData(Math.max(1, w), Math.max(1, h)));
  };
};

// Fotos que se ven en el viewport actual. scope "landing": las .landing-photo;
// "main": todas las <img> del <main> visible de al menos FOTO_MIN_PX.
export async function fotosVistas(p, decoder, scope) {
  const st = await p.evaluate(({ scope, minPx }) => {
    const main = [...document.querySelectorAll("main")].filter((el) => getComputedStyle(el).display !== "none")[0];
    const imgs = scope === "landing"
      ? [...document.querySelectorAll(".landing-photo img")]
      : [...(main?.querySelectorAll("img") ?? [])];
    const out = { scrollY: Math.round(scrollY), glHidden: 0, photos: [] };
    imgs.forEach((img, i) => {
      if (getComputedStyle(img).visibility === "hidden") out.glHidden++;
      const b = img.getBoundingClientRect();
      if (scope !== "landing" && (b.width < minPx || b.height < minPx)) return;
      const box = { l: Math.max(0, b.left), t: Math.max(0, b.top), r: Math.min(innerWidth, b.right), b: Math.min(innerHeight, b.bottom) };
      if (!(box.r - box.l > 1 && box.b - box.t > 1)) return;
      let op = 1;
      for (let el = img; el && el !== main?.parentElement; el = el.parentElement) op *= +getComputedStyle(el).opacity;
      out.photos.push({ i, src: (img.currentSrc || img.src).split("url=").pop().split("&")[0].split("%2F").slice(-2).join("/").slice(0, 50),
        clip: box, opacity: +op.toFixed(3) });
    });
    return out;
  }, { scope, minPx: FOTO_MIN_PX }).catch((e) => ({ evalError: e.message, glHidden: 0, photos: [] }));
  const shot = await p.screenshot({ scale: "css", type: "png" }).catch(() => null);
  if (shot && st.photos.length) {
    const fr = await decoder.evaluate(async ({ data, boxes, bg, tol, inset }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      return boxes.map((bx) => {
        const l = Math.round(bx.l + inset), t = Math.round(bx.t + inset);
        const w = Math.round(bx.r - bx.l - 2 * inset), h = Math.round(bx.b - bx.t - 2 * inset);
        if (w < 2 || h < 2) return null;
        const d = g.getImageData(l, t, w, h).data;
        let diff = 0;
        for (let j = 0; j < d.length; j += 4)
          if (Math.abs(d[j] - bg[0]) > tol || Math.abs(d[j + 1] - bg[1]) > tol || Math.abs(d[j + 2] - bg[2]) > tol) diff++;
        return diff / (w * h);
      });
    }, { data: shot.toString("base64"), boxes: st.photos.map((ph) => ph.clip), bg: FONDO, tol: FONDO_TOL, inset: MARGEN_PX }).catch(() => null);
    st.photos.forEach((ph, j) => { ph.painted = fr ? fr[j] : null; });
  }
  st.seen = st.photos.filter((ph) => ph.opacity > 0.5 && ph.painted != null && ph.painted >= FOTO_PINTADA_MIN).length;
  return st;
}

export function lineaVistas(st) {
  const pintadas = st.photos.map((ph) => (ph.painted == null ? "—" : ph.painted.toFixed(2))).join(" ");
  return `scrollY ${st.scrollY} · <img> ocultas ${st.glHidden} · intersecan ${st.photos.length} · se ven ${st.seen}${pintadas ? ` · pintada ${pintadas}` : ""}${st.evalError ? ` · ${st.evalError}` : ""}`;
}

// Pierde el contexto de todos los canvas WebGL de la pagina (tambien el del
// landing oculto fuera de /). Devuelve cuantos perdio.
export function perderContextos() {
  let n = 0;
  for (const c of document.querySelectorAll("canvas")) {
    // getContext con el tipo de otro contexto ya creado devuelve null: el
    // canvas 2D del atlas no se toca.
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_lose_context");
    if (ext) { ext.loseContext(); n++; }
  }
  return n;
}

// Resolucion pedida frente a la pintada (CA9): el ancho w= de la URL de
// next/image frente al ancho de la caja por min(dpr, 2).
export function calidadLanding() {
  const out = [];
  for (const img of document.querySelectorAll(".landing-photo img")) {
    const b = img.getBoundingClientRect();
    if (!(b.right > 0 && b.left < innerWidth && b.bottom > 0 && b.top < innerHeight) || b.width < 1) continue;
    const src = img.currentSrc || "";
    const w = Number(new URL(src, location.href).searchParams.get("w"));
    const need = b.width * Math.min(devicePixelRatio || 1, 2);
    out.push({ src: src.split("url=").pop().split("&")[0].split("%2F").slice(-2).join("/").slice(0, 50), w, caja: Math.round(b.width), ratio: w ? +(w / need).toFixed(2) : null });
  }
  return out;
}

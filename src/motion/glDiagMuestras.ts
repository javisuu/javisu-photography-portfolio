// Muestras para el panel ?diag (spec 018, enmienda 1). Solo se llaman con
// ?diag en la URL (glDiagActivo): sin el parametro GLSurface no ejecuta nada
// de esto. Distinguen tres causas de "texturas subidas pero no se ve nada"
// en Safari de iOS: el bitmap ya sale vacio, la textura queda vacia en la
// GPU, o el canvas pinta pero no se ve (o no esta donde la pantalla).

type GL = WebGLRenderingContext | WebGL2RenderingContext;

let lienzo: HTMLCanvasElement | null = null;

/** El bitmap tal como sale de createImageBitmap, reducido a 8x8 en un canvas
 * 2D: true si los 64 pixeles son transparentes. */
export function bitmapVacio(bitmap: ImageBitmap): boolean | null {
  try {
    lienzo ??= document.createElement("canvas");
    lienzo.width = 8;
    lienzo.height = 8;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, 8, 8);
    ctx.drawImage(bitmap, 0, 0, 8, 8);
    const px = ctx.getImageData(0, 0, 8, 8).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) return false;
    return true;
  } catch {
    return null;
  }
}

/** La textura ya subida, leida de la GPU por un framebuffer en una rejilla de
 * 3x3: true si los 9 puntos son transparentes. Deja el framebuffer de la
 * pantalla atado al acabar (bindFramebuffer pasa por el estado de ogl). */
export function texturaVacia(
  gl: GL,
  bindFramebuffer: (opts?: { buffer?: WebGLFramebuffer | null }) => void,
  textura: WebGLTexture,
  w: number,
  h: number
): boolean | null {
  const fbo = gl.createFramebuffer();
  if (!fbo) return null;
  try {
    bindFramebuffer({ buffer: fbo });
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, textura, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    const px = new Uint8Array(4);
    for (const fx of [0.25, 0.5, 0.75])
      for (const fy of [0.25, 0.5, 0.75]) {
        gl.readPixels(Math.floor(w * fx), Math.floor(h * fy), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (px[3] > 0) return false;
      }
    return true;
  } catch {
    return null;
  } finally {
    bindFramebuffer();
    gl.deleteFramebuffer(fbo);
  }
}

/** Lee el buffer de dibujo recien pintado en el centro de cada rect visible
 * (con opacidad > 0). Hay que llamarlo justo despues de renderer.render, en el
 * mismo frame. */
export function pintadosEn(
  gl: GL,
  dpr: number,
  rects: { rect: DOMRect; opacidad: number }[]
): { muestra: number; pintados: number } {
  const bufferH = gl.drawingBufferHeight;
  const px = new Uint8Array(4);
  let muestra = 0;
  let pintados = 0;
  for (const { rect, opacidad } of rects) {
    if (opacidad <= 0 || rect.width < 1 || rect.height < 1) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) continue;
    muestra++;
    gl.readPixels(Math.floor(cx * dpr), Math.floor(bufferH - 1 - cy * dpr), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (px[3] > 0) pintados++;
  }
  return { muestra, pintados };
}

/** Caja del canvas en CSS, su buffer, la ventana y el visualViewport, y si el
 * estilo calculado lo oculta. */
export function capa(canvas: HTMLCanvasElement): string {
  const r = canvas.getBoundingClientRect();
  const cs = getComputedStyle(canvas);
  const vv = window.visualViewport;
  const n = (x: number) => Math.round(x);
  return [
    `canvas ${n(r.width)}x${n(r.height)}+${n(r.left)},${n(r.top)} · buffer ${canvas.width}x${canvas.height}`,
    `ventana ${window.innerWidth}x${window.innerHeight} · visual ${vv ? `${n(vv.width)}x${n(vv.height)}+${n(vv.offsetTop)}` : "—"}`,
    `estilo ${cs.display} · ${cs.visibility} · opacidad ${cs.opacity} · z ${cs.zIndex}`,
  ].join("\n");
}

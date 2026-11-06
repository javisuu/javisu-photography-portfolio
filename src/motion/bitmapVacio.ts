// Spec 018, enmienda 2. En WebKit de iOS, createImageBitmap(<img>) devuelve
// sin error un bitmap transparente para buena parte de las fotos (medido en el
// iPhone 13 de Javi con ?diag: 17 de 22 en el landing, 3 de 3 en un album).
// GLSurface muestrea cada bitmap con esto antes de subirlo.

let lienzo: HTMLCanvasElement | null = null;

/** true si el centro del bitmap (16x16 px de origen, reducido a 8x8) es
 * transparente del todo; null si no se pudo medir. Una foto JPEG decodificada
 * es opaca en cada pixel, asi que basta con el centro, y muestrear solo esa
 * zona mantiene el coste por debajo de un milisegundo. */
export function bitmapVacio(bitmap: ImageBitmap): boolean | null {
  try {
    lienzo ??= document.createElement("canvas");
    lienzo.width = 8;
    lienzo.height = 8;
    const ctx = lienzo.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const sw = Math.min(16, bitmap.width);
    const sh = Math.min(16, bitmap.height);
    if (sw < 1 || sh < 1) return true;
    ctx.clearRect(0, 0, 8, 8);
    ctx.drawImage(bitmap, Math.floor((bitmap.width - sw) / 2), Math.floor((bitmap.height - sh) / 2), sw, sh, 0, 0, 8, 8);
    const px = ctx.getImageData(0, 0, 8, 8).data;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) return false;
    return true;
  } catch {
    return null;
  }
}

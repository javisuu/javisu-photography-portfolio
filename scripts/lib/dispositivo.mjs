// Modo dispositivo del diagnostico (spec 017). Mide el sitio con el perfil de
// Playwright de un iPhone o un iPad, en vertical u horizontal, en Chromium o
// WebKit. Sin flags, todo vuelve al escritorio de siempre: 1440x900, dpr 1,
// Chromium.

// Clave del flag -> perfil de playwright.devices. Su viewport es el area
// visible con la barra del navegador descontada (en los iPhone; el del iPad
// Mini da el alto entero), no la pantalla.
export const DISPOSITIVOS = {
  iphone: "iPhone 13",
  "iphone-max": "iPhone 15 Pro Max",
  "ipad-mini": "iPad Mini",
  ipad: "iPad Pro 11",
};
export const MOTORES = ["chromium", "webkit"];
export const CTX_ESCRITORIO = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };

function valueOf(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1] ?? "";
}

// Lee los flags del modo dispositivo. Devuelve { error } si alguno es invalido:
// el diagnostico sale con codigo 2 antes de abrir nada.
export function parseDeviceArgs(args) {
  const dispositivo = valueOf(args, "--dispositivo");
  const motorArg = valueOf(args, "--motor");
  const cpuArg = valueOf(args, "--cpu");
  const horizontal = args.includes("--horizontal");
  const fluidezAtlas = args.includes("--fluidez-atlas");

  if (dispositivo !== null && !(dispositivo in DISPOSITIVOS))
    return { error: `--dispositivo invalido: ${JSON.stringify(dispositivo)}. Valores: ${Object.keys(DISPOSITIVOS).join(", ")}` };
  const motor = motorArg ?? "chromium";
  if (!MOTORES.includes(motor))
    return { error: `--motor invalido: ${JSON.stringify(motorArg)}. Valores: ${MOTORES.join(", ")}` };
  const cpu = cpuArg === null ? 1 : /^\d+$/.test(cpuArg) ? Number(cpuArg) : 0;
  if (cpu < 1) return { error: `--cpu invalido: ${JSON.stringify(cpuArg)}. Tiene que ser un entero >= 1` };
  if (horizontal && dispositivo === null)
    return { error: "--horizontal necesita --dispositivo" };

  return { dispositivo, horizontal, motor, cpu, fluidezAtlas };
}

// Opciones de contexto: el perfil de Playwright (viewport, dpr, isMobile,
// hasTouch, userAgent) o el escritorio. defaultBrowserType no es una opcion de
// contexto: el motor lo elige --motor, no el perfil.
export function contextFor(devices, { dispositivo, horizontal }) {
  if (!dispositivo) return { ...CTX_ESCRITORIO };
  const nombre = DISPOSITIVOS[dispositivo] + (horizontal ? " landscape" : "");
  const perfil = devices[nombre];
  if (!perfil) throw new Error(`playwright.devices no tiene "${nombre}"`);
  const opts = { ...perfil };
  delete opts.defaultBrowserType;
  return opts;
}

// Etiqueta corta para la cabecera, el RESUMEN y el nombre de la salida.
export function deviceLabel({ dispositivo, horizontal, motor, cpu }) {
  if (!dispositivo) return `escritorio 1440x900 · ${motor}${cpu > 1 ? ` · cpu x${cpu}` : ""}`;
  return `${dispositivo}${horizontal ? " horizontal" : ""} (${DISPOSITIVOS[dispositivo]}) · ${motor}${cpu > 1 ? ` · cpu x${cpu}` : ""}`;
}

// ---------- gestos tactiles (CDP, solo Chromium) ----------
// Input.dispatchTouchEvent genera toques reales: el navegador hace el scroll
// nativo y emite PointerEvent con un pointerId activo, que es lo que exige
// setPointerCapture (Atlas.tsx, handlePointerDown). Un PointerEvent sintetico
// con dispatchEvent no vale: setPointerCapture lanza con un id inactivo.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Un dedo de `from` a `to` en `steps` pasos de `stepMs`.
export async function touchSwipe(cdp, from, to, { steps = 12, stepMs = 16 } = {}) {
  const pt = (x, y) => [{ x: Math.round(x), y: Math.round(y), id: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    await wait(stepMs);
    const t = i / steps;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

// Dos dedos en horizontal alrededor de `center`, de una distancia `d0` a `d1`.
export async function touchPinch(cdp, center, d0, d1, { steps = 12, stepMs = 16 } = {}) {
  const pts = (d) => [
    { x: Math.round(center.x - d / 2), y: Math.round(center.y), id: 1 },
    { x: Math.round(center.x + d / 2), y: Math.round(center.y), id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(d0) });
  for (let i = 1; i <= steps; i++) {
    await wait(stepMs);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(d0 + (d1 - d0) * (i / steps)) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

// ---------- CPU limitada (CDP, solo Chromium) ----------
// Emulation.setCPUThrottlingRate, como scripts/medir-carrusel.mjs. Devuelve
// false si no se pudo (WebKit, o CPU x1): quien llama no debe presentar la
// medida como hecha con la CPU limitada.
export async function applyCpu(ctx, page, { motor, cpu }) {
  if (cpu <= 1 || motor !== "chromium") return false;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  return true;
}

// ---------- duracion de los frames ----------
// Se instala en la pagina con page.evaluate(frameRecorder): un bucle de rAF
// que guarda performance.now() de cada frame en window.__frames mientras
// window.__framesOn sea true.
export function frameRecorder() {
  window.__frames = [];
  window.__framesOn = true;
  const tick = (now) => {
    if (!window.__framesOn) return;
    window.__frames.push(now);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Mediana, p95, maximo y frames > longMs de una lista de marcas de tiempo.
export function frameStats(stamps, longMs = 50) {
  const d = [];
  for (let i = 1; i < stamps.length; i++) d.push(stamps[i] - stamps[i - 1]);
  if (!d.length) return null;
  const s = [...d].sort((a, b) => a - b);
  const q = (x) => s[Math.min(s.length - 1, Math.floor(x * (s.length - 1)))];
  return { frames: d.length, median: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +s[s.length - 1].toFixed(1), long: d.filter((x) => x > longMs).length };
}

// Estado de cada GLSurface, para el panel ?diag (src/components/GLDiagPanel.tsx)
// y para el diagnostico (window.__glDiag). Spec 018: en Safari real las fotos
// de GLSurface no se pintaban y no habia consola que leer; esto dice que pasa
// en la propia pagina. Solo escribe en memoria: no pinta nada por si mismo.

export type GLDiagState = {
  /** Que instancia: "landing" o "album". */
  nombre: string;
  /** Tipo de contexto creado. Los shaders son GLSL 300 es: solo valen con webgl2. */
  contexto: "webgl2" | "webgl" | "ninguno";
  /** El navegador tiro el contexto (webglcontextlost). */
  perdido: boolean;
  /** El programa de los shaders compilo y enlazo. */
  programa: boolean | null;
  /** Texturas subidas a la GPU, de las que hay. */
  subidas: number;
  total: number;
  /** createImageBitmap rechazados. */
  fallosDecodificacion: number;
  /** Textura mas grande subida, en px, y el maximo que admite la GPU. */
  texturaMayor: [number, number] | null;
  maxTextura: number | null;
  /** Motivo por el que la pagina volvio a las fotos del DOM, o null. */
  fallo: string | null;
  ultimoError: string | null;
};

const registro: Record<string, GLDiagState> = {};

function vacio(nombre: string): GLDiagState {
  return {
    nombre,
    contexto: "ninguno",
    perdido: false,
    programa: null,
    subidas: 0,
    total: 0,
    fallosDecodificacion: 0,
    texturaMayor: null,
    maxTextura: null,
    fallo: null,
    ultimoError: null,
  };
}

/** Empieza de cero el estado de una instancia (al montarse). */
export function glDiagReset(nombre: string) {
  registro[nombre] = vacio(nombre);
  publicar();
}

export function glDiagUpdate(nombre: string, cambio: Partial<GLDiagState> | ((s: GLDiagState) => Partial<GLDiagState>)) {
  const actual = registro[nombre] ?? vacio(nombre);
  registro[nombre] = { ...actual, ...(typeof cambio === "function" ? cambio(actual) : cambio) };
  publicar();
}

export function glDiagSnapshot(): GLDiagState[] {
  return Object.values(registro);
}

function publicar() {
  if (typeof window !== "undefined") (window as unknown as { __glDiag: Record<string, GLDiagState> }).__glDiag = registro;
}

// Spec 020: open/closed state of the mobile full-screen panel. Module-level
// external store (same shape as src/motion/albumTransition/store.ts): the
// trigger lives in the landing and the panel in the root layout, two trees
// that share no parent below the layout.

let abierto = false;
const oyentes = new Set<() => void>();

export function panelAbierto(): boolean {
  return abierto;
}

export function suscribirPanel(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function fijarPanel(valor: boolean): void {
  if (abierto === valor) return;
  abierto = valor;
  oyentes.forEach((fn) => fn());
}

/** id of the panel, for the trigger's aria-controls. */
export const PANEL_ID = "panel-movil";

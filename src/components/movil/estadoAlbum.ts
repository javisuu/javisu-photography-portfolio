// Spec 020: the album page's current photo, for the mobile album bar.
// AlbumPhotoNav (in the page) already tracks the photo nearest the
// viewport's centre and knows how to scroll to one; it publishes that here,
// and BarraMovil (in the root layout, a different tree) reads it. Same
// external-store shape as ./panel.ts.

export type EstadoAlbum = {
  /** 0-based index of the photo nearest the viewport's vertical centre. */
  actual: number;
  total: number;
  irA: (indice: number) => void;
};

let estado: EstadoAlbum | null = null;
const oyentes = new Set<() => void>();

export function estadoAlbum(): EstadoAlbum | null {
  return estado;
}

export function suscribirAlbum(fn: () => void): () => void {
  oyentes.add(fn);
  return () => {
    oyentes.delete(fn);
  };
}

export function publicarAlbum(valor: EstadoAlbum | null): void {
  estado = valor;
  oyentes.forEach((fn) => fn());
}

# Spec 010 · Textos del album: nota lateral, cita y parrafo entre fotos

- **Estado:** Implementada (2026-10-21). CA1 a CA11 verificados en `tasks.md`
- **Fecha:** 2026-10-20 · revisada 2026-10-21
- **Requiere decision de Javi:** No. No toca el wordmark, el blend, el ciclo de vida de `GLSurface` ni el scroll infinito. Los textos son DOM: `GLSurface` solo copia las `<img>` que recibe en `nodes` (`src/motion/AlbumPhotos.tsx:117-124`)

## Problema

Javi quiere acompanar algunos albumes con texto suyo. Pidio la tarea el 2026-10-11 (`docs/ESTADO.md`, "Proximos pasos"). Hay dos referencias de estilo:

- `docs/referencias/2026-10-11_notas-laterales.png` (captura a 1440 px de ancho; cuenta solo el estilo, no las fotos ni los textos):
  - **Nota lateral larga**: parrafo serif gris oscuro, ~5 lineas, ~440 px de ancho, junto a la foto 02. Debajo, raya corta y firma en mayusculas pequenas con tracking, gris claro. Su primera linea queda ~80 px por debajo del borde superior de la foto: va **arriba**, no centrada.
  - **Cita corta**: frase en cursiva gris, dos lineas, precedida de una raya fina, en el lado vacio de la fila de la foto 03. Esta **centrada en vertical** respecto a la foto (centro de la cita ≈ centro de la foto, ±10 px en la captura).
  - En los dos casos el texto va en el lado opuesto a la foto, separado ~90 px o mas.
- `https://rluijten.photography/photographs/french-alps`, para el **parrafo entre fotos**: un `p.heading.is-small.album-text` dentro del flujo de la galeria, entre dos fotos. Medido de su CSS (descargado el 2026-10-21; la copia queda en el scratchpad de la sesion): serif a `2.778vw` (≈40 px a 1440) con interlineado `2.986vw` (≈43 px), ocupa las columnas 2 a 12 de 12 (≈10/12 del ancho), margen vertical `8.333vw` (≈120 px), color de su paleta (aqui sera gris: la UI del sitio es solo escala de grises).

Lo que hay hoy:
- Ni `Album` ni `Photo` tienen ningun campo de texto (`src/data/photos.ts:39-60`).
- Cada fila del album es un `flex-col`: la foto y, debajo, su pie (`src/motion/AlbumPhotos.tsx:67-114`). La colocacion alterna centrada, a la izquierda y a la derecha segun `index % 3` (`src/motion/AlbumPhotos.tsx:28-37`). Solo las filas desplazadas dejan un lado libre.
- Las fotos son `h-auto w-auto max-h-[85vh] max-w-full` (`src/motion/AlbumPhotos.tsx:80`).
- No hay ningun texto de Javi escrito: esta en "Esperando a" desde el 2026-09-20 (`docs/ESTADO.md`).

## Objetivo

Desde `src/data/photos.ts`, sin tocar ningun componente, un album puede llevar:

1. **Como mucho un texto largo del album**, firmado. Javi elige en el dato una de dos colocaciones:
   - **Lateral**: en el hueco libre junto a una foto (pensado para una de las primeras del album), alineado arriba, con el estilo de la nota larga de la captura.
   - **Entre fotos**: en una fila propia despues de la foto que se indique, en serif grande, con el estilo de la referencia de rluijten.
2. **Citas cortas** en las fotos que se quiera (no todas tienen), en el hueco libre de su fila, centradas en vertical respecto a la foto, sin firma.

Los albumes y fotos sin texto se ven exactamente igual que hoy.

## Decisiones (Javi, 2026-10-21)

| # | Pregunta | Decision |
|---|---|---|
| 1 | Textos mientras no esten escritos | (c): textos `[PLACEHOLDER]` marcados como tales que solo se pintan en `next dev`; el build de produccion no los pinta |
| 2 | Firma | `JAVIER SUÁREZ SUQUÍA`, nombre completo, con raya. La lleva siempre el texto largo, en sus dos colocaciones. La cita corta no lleva firma |
| 3 | Fotos horizontales | Ningun texto lateral (largo o cita) junto a una foto horizontal (`width > height`). Solo verticales y cuadradas |
| 4 | Filas centradas (`index % 3 === 0`) | No admiten texto lateral. No se reubican ni cambian la alternancia |
| 5 | Idioma | El que Javi elija en cada texto. Cada uno lleva su `lang` en el elemento |
| 6 | Posicion vertical | Texto largo lateral: arriba. Cita: centrada en vertical. Parrafo entre fotos: fila propia, bloque centrado en horizontal |
| 7 | Cuantos textos largos por album | Como mucho uno (en una de las dos colocaciones) |
| 8 | Primera y ultima foto (revision, 2026-10-21) | Nunca llevan texto lateral. Que fotos lo llevan lo decide Javi en cada caso. El diagnostico lo comprueba |
| 9 | Posicion horizontal de la cita (revision, 2026-10-21) | Centrada en el hueco libre entero, entre la foto y el borde del contenido del lado contrario: en el tercio central, no pegada a la foto. La nota lateral larga sigue a 96 px de la foto |

Las reglas 3 y 4 no las puede imponer `tsc`, porque dependen de las medidas y del orden de cada foto. Las comprueba el diagnostico (CA4).

## Fuera de alcance

- Escribir los textos: son de Javi.
- Cualquier animacion de entrada de los textos. Son estaticos, asi que `prefers-reduced-motion` no aplica.
- El landing, el carrusel, el atlas y `GLSurface`.
- La version movil a medida. En pantalla estrecha, el texto lateral baja debajo del pie de foto y el parrafo entre fotos se queda en su fila, sin mas diseno. El pase movil es otro paso de los proximos pasos.
- El pie de foto (`src/motion/AlbumPhotos.tsx:95-113`), que no cambia.
- La tipografia: se usa EB Garamond, la del sitio, no la de las referencias.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [x] Datos (`src/data/photos.ts`): un campo opcional en `Album` (texto largo) y otro en `Photo` (cita)
- [ ] Solo documentacion

Tambien cambia `scripts/diagnostico.mjs`, con una seccion nueva (`textos del album`) para medir CA3 a CA7, como hizo la spec 009.

Forma orientativa del dato, la cierra `plan.md`:

```ts
type AlbumText = {
  body: string;
  lang?: string;            // por defecto, el del documento
  placeholder?: true;       // solo se pinta en next dev
  placement:
    | { kind: "beside"; photoOrder: number }
    | { kind: "between"; afterPhotoOrder: number };
};
type PhotoQuote = { text: string; lang?: string; placeholder?: true };
// Album.text?: AlbumText      Photo.quote?: PhotoQuote
```

## Choca con el spec

Nada, con una condicion.
- El texto es gris, sin color. No hay animacion ni parallax.
- La foto sigue sin recortar y dentro del viewport (`max-h-[85vh]`).
- **La condicion:** en una fila con texto lateral, la foto comparte el ancho con el texto. Como solo se permiten verticales y cuadradas, a 1440x900 la foto deberia mantener su tamano actual. CA5 lo comprueba de todos modos.
- `docs/design-spec-v2.md` §3 no habla de textos en el album. Habra que ampliarlo al cerrar la spec.

## Criterios de aceptacion

CA3 a CA7 se miden a 1440x900 en una seccion nueva de `scripts/diagnostico.mjs`, `textos del album`, contra `next dev` (que es donde se pintan los `[PLACEHOLDER]`). La seccion recorre los albumes con algun texto y mide cada `[data-album-text]` y cada `[data-photo-quote]`.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` | tsc, lint y build ok · 0 errores de consola · todas las invariantes en verde: las 43 actuales y las nuevas |
| CA2 | `npx tsc --noEmit` con los campos nuevos opcionales y sin tocar las entradas que no llevan texto | ok, 0 errores |
| CA3 | Texto lateral (largo o cita) frente a su `<img>` | Interseccion de cajas de area 0. Separacion horizontal ≥ 64 px. Fila desplazada a la izquierda: `texto.left ≥ img.right`. Fila desplazada a la derecha: `texto.right ≤ img.left` |
| CA4 | Reglas de colocacion | Ningun texto lateral en una fila centrada, ni junto a una foto con `naturalWidth > naturalHeight`, ni en la primera o la ultima foto del album. Ningun album con mas de un `[data-album-text]` |
| CA5 | Fila con texto lateral | `img.height ≤ 0,85 · innerHeight + 1` · `abs((w/h)/(naturalWidth/naturalHeight) - 1) < 0,01` · nada fuera del viewport en horizontal |
| CA6 | Alineacion vertical | Texto largo lateral: `abs(texto.top - img.top) ≤ 100`. Cita: `abs(centro del texto - centro de la img) ≤ 24` en vertical, y `≤ 24` en horizontal respecto al centro del hueco libre. Parrafo entre fotos: `abs(centro del bloque - innerWidth/2) ≤ 2`, y queda entre la caja de la foto anterior y la de la siguiente |
| CA7 | `getComputedStyle(...).color` del texto, de la firma y de la raya, y `lang` de cada texto | `r = g = b` en todos (solo escala de grises). La firma dice `JAVIER SUÁREZ SUQUÍA`. Hay `lang` cuando el dato lo trae |
| CA8 | `next build` + `next start`: buscar en el HTML de un album con textos `[PLACEHOLDER]` | 0 apariciones de `[data-album-text]`, `[data-photo-quote]` y `PLACEHOLDER`. Los textos de prueba no llegan a produccion |
| CA9 | `node scripts/diagnostico.mjs --medir /album/<slug sin textos>` antes y despues del cambio: cajas de todas las `<img>` y de los pies | Identicas (±1 px). Un album sin textos no cambia |
| CA10 | `git diff main --stat -- src/` | Solo `src/data/photos.ts` y `src/motion/AlbumPhotos.tsx`, y uno o dos componentes nuevos si el plan los separa |
| CA11 | Revision a mano de Javi en `npm run dev`, frente a las dos referencias | Javi da por buenas las tres piezas. Es su testimonio |

## Preguntas abiertas

Ninguna de diseno. Quedan dos detalles para `plan.md`, que el plan propone y Javi revisa en CA11:
- Tamano exacto del parrafo entre fotos: `2.778vw` como en rluijten, o un `clamp()` que no baje de unos 28 px en pantallas estrechas.
- Gris exacto de cada pieza, dentro de los grises que ya usa el sitio (`#111111`, `#666666`, `#888888`, `#A8A8A8`, `#BBBBBB`).

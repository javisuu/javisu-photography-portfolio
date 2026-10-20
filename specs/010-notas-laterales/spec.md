# Spec 010 · Notas laterales en las fotos del album

- **Estado:** Borrador
- **Fecha:** 2026-10-20
- **Requiere decision de Javi:** No. No toca el wordmark, el blend, el ciclo de vida de `GLSurface` ni el scroll infinito. Las notas son texto del DOM: `GLSurface` solo copia las `<img>` que recibe en `nodes` (`src/motion/AlbumPhotos.tsx:117-124`). Hay que decidir el contenido y algunas reglas de colocacion, recogidas en "Preguntas abiertas"

## Problema

Javi quiere acompanar algunas fotos del album con un texto suyo al lado. Pidio la tarea el 2026-10-11 (`docs/ESTADO.md`, "Proximos pasos", paso 5). La referencia de estilo es `docs/referencias/2026-10-11_notas-laterales.png`; cuenta solo el estilo, no las fotos ni los textos. Muestra dos piezas:

- **Nota larga**: un parrafo en serif, gris oscuro, de unas 5 lineas y unos 440 px de ancho, al lado de la foto 02. Debajo lleva una raya corta y la firma `JAVIER SUQUIA` en mayusculas pequenas con tracking, gris claro.
- **Cita corta**: una frase en cursiva gris, de dos lineas, precedida de una raya fina, en el lado vacio de la fila de la foto 03.

En los dos casos el texto va en el lado opuesto a la foto, separado de ella unos 90 px o mas. Las medidas estan tomadas a ojo de la captura (1440 px de ancho) y son aproximadas.

Lo que hay hoy:
- `Photo` no tiene ningun campo de texto (`src/data/photos.ts:47-60`).
- Cada fila del album es un `flex-col`: la foto y, debajo, su pie (`src/motion/AlbumPhotos.tsx:67-114`). La colocacion alterna centrada, a la izquierda y a la derecha segun `index % 3` (`src/motion/AlbumPhotos.tsx:28-37`). Solo las filas desplazadas dejan un lado libre. Las centradas no tienen hueco a ningun lado.
- Las fotos son `h-auto w-auto max-h-[85vh] max-w-full` (`src/motion/AlbumPhotos.tsx:80`).
- No hay ningun texto de Javi escrito: esta en "Esperando a" desde el 2026-09-20 (`docs/ESTADO.md`).

## Objetivo

Una foto puede llevar, desde `src/data/photos.ts` y sin tocar ningun componente, una nota larga firmada o una cita corta. La pagina de album la pinta en el lado libre de la fila, con el estilo de la referencia. Las fotos sin nota y los albumes sin notas se ven exactamente igual que hoy.

## Fuera de alcance

- Escribir los textos: son de Javi. Mientras no lleguen, ver la pregunta 1.
- Cualquier animacion de entrada de las notas. Son texto estatico, asi que `prefers-reduced-motion` no aplica.
- El landing, el carrusel, el atlas y `GLSurface`.
- La version movil a medida. En pantalla estrecha la nota baja debajo del pie de foto, sin mas diseno; el pase movil es el paso 8 de los proximos pasos.
- Los textos de la referencia, que estan en ingles: no se copian.
- El pie de foto (`src/motion/AlbumPhotos.tsx:95-113`), que no cambia.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [x] Datos (`src/data/photos.ts`): un campo opcional nuevo en `Photo`
- [ ] Solo documentacion

Tambien cambia `scripts/diagnostico.mjs`, con una seccion nueva para medir CA3 a CA6, como en la spec 009.

## Choca con el spec

Nada, con una condicion.
- El texto es gris, sin color. No hay animacion ni parallax.
- La foto sigue sin recortar y dentro del viewport (`max-h-[85vh]`).
- **La condicion:** en una fila con nota, la foto comparte el ancho con el texto. Una foto horizontal puede salir mas pequena que sin nota, pero nunca recortada ni deformada (CA5). Si eso no se acepta para las horizontales, es la pregunta 3.
- `docs/design-spec-v2.md` §3 ("each with info alongside") no habla de notas. La spec del diseno habra que ampliarla al cerrar.

## Criterios de aceptacion

CA3 a CA6 se miden en una seccion nueva de `scripts/diagnostico.mjs` (`notas laterales`), a 1440x900. Recorre los albumes que tengan alguna nota y mide cada fila con `[data-photo-note]`.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` | tsc, lint y build ok · 0 errores de consola · todas las invariantes en verde, las 43 actuales mas las nuevas |
| CA2 | `npx tsc --noEmit` con el campo nuevo opcional, sin tocar las 31 entradas que no llevan nota | ok, 0 errores |
| CA3 | Seccion `notas laterales`: interseccion entre la caja de la nota y la de su `<img>` | Area 0 en todas las notas, y separacion horizontal ≥ 64 px |
| CA4 | Misma seccion: lado de la nota frente a su foto | Fila desplazada a la izquierda: `nota.left ≥ img.right`. Fila desplazada a la derecha: `nota.right ≤ img.left` |
| CA5 | Misma seccion: en cada fila con nota, `img.height ≤ 0,85 · innerHeight + 1`, `abs((w/h)/(naturalWidth/naturalHeight) - 1) < 0,01` y ningun elemento fuera del viewport en horizontal | Las tres se cumplen en todas las filas con nota |
| CA6 | Misma seccion: `getComputedStyle(...).color` del texto, de la firma y de la raya | `r = g = b` en todos (solo escala de grises) |
| CA7 | `node scripts/diagnostico.mjs --medir /album/<slug sin notas>` antes y despues del cambio: las cajas de todas las `<img>` y de los pies | Identicas (±1 px). Un album sin notas no cambia |
| CA8 | `git diff main --stat -- src/` | Solo `src/data/photos.ts` y `src/motion/AlbumPhotos.tsx`, mas un componente nuevo si el plan lo separa |
| CA9 | Revision a mano de Javi en `npm run dev`, frente a `docs/referencias/2026-10-11_notas-laterales.png` | Javi da por bueno el estilo de las dos piezas. Es su testimonio |

## Preguntas abiertas

1. **Textos.** No hay ninguno escrito. Hay tres opciones:
   - (a) Se crea el campo y no se rellena en ninguna foto. Asi la web publicada no cambia, pero CA3 a CA6 no tienen nada que medir hasta que lleguen los textos.
   - (b) Se ponen textos `[PLACEHOLDER]` en dos fotos para medir y revisar. Saldrian publicados en produccion hasta que lleguen los reales.
   - (c) Como la (b), pero las notas `[PLACEHOLDER]` solo se pintan en `next dev`, no en el build de produccion.

   Propongo la (c).
2. **Firma.** La referencia pone `JAVIER SUQUIA`. ¿Va asi, como el wordmark, o con el nombre completo, `JAVIER SUÁREZ SUQUÍA`? ¿La llevan todas las notas largas, o se elige por nota?
3. **Fotos horizontales.** Una horizontal con nota se encoge para dejar sitio al texto. ¿Se acepta, o las notas solo van en fotos verticales y cuadradas?
4. **Filas centradas** (`index % 3 === 0`): no tienen lado libre. ¿Que hace una nota ahi? Opciones:
   - (a) No se permite: `tsc` no puede impedirlo, asi que el diagnostico lo marca como fallo.
   - (b) Va debajo del pie, centrada y estrecha.
   - (c) La fila pasa a ser desplazada.

   Propongo la (b).
5. **Idioma.** El resto del sitio esta en ingles; la referencia, tambien. ¿Las notas van en ingles, o en el idioma que tu elijas para cada una?
6. **Posicion vertical.** En la referencia, la nota larga se alinea cerca de la parte alta de la foto y la cita corta, hacia el centro-abajo. ¿Se respeta esa diferencia, o las dos van centradas en vertical respecto a la foto?

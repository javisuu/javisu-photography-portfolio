# Spec 022 · Notas del album en movil

- **Estado:** Implementada (2026-11-24; aprobada por Javi el 2026-11-23, visto bueno en dispositivo el 2026-11-24: «ok»)
- **Fecha:** 2026-11-20
- **Requiere decision de Javi:** No. No toca ninguna de las cuatro zonas protegidas: el `GLSurface` del album sigue igual y solo lee la posicion de las `<img>`. Las decisiones de diseño las tomo Javi el 2026-11-23 ("Respuestas de Javi").

## Problema

Javi, el 2026-11-19, en la preview de la spec 021: «On ipad, probably on mobile phone, on the vertical layaout of the single album page, the lateral notes are very narrowed.»

**Medido el 2026-11-20** en emulacion de Chromium, con `next dev` en `main` (`117116d`). La salida esta en `evidencia/2026-11-20_022-t0-notas.txt`.

| Perfil | Texto | Ancho | Lineas |
|---|---|---|---|
| iPad mini vertical (768 px) | cita, `america` foto 6 | 71 px | 10 |
| | cita, `norte` foto 5 | 62 px | 15 |
| | cita, `norte` foto 8 | 151 px | 5 |
| | cita, `sol` foto 3 | 42 px | 13 |
| | cita, `sol` foto 6 | 79 px | 14 |
| | nota larga, `sol` foto 2 | 297 px | 6 |
| iPhone 13 vertical (390 px) | las 5 citas | 280 px | de 2 a 4 |
| | la nota larga | 342 px | 5 |
| iPhone 13 horizontal (750 px) | las 5 citas | 280 px | de 2 a 4 |
| | la nota larga | 440 px | 4 |

Que se ve en esas cifras:
- **En el iPad mini, todos los textos van a un lado de la foto.** La cita queda reducida a una columna de pocas palabras por linea.
- **La nota larga de `sol` aguanta 297 px**, pero a costa de la foto, que baja a 247 × 330 px.
- **En el iPhone, en vertical y en horizontal, los textos ya van debajo del pie**, a 280 px las citas y a todo el ancho util la nota. Lo que Javi sospechaba del telefono no se reproduce en emulacion.

**Por que pasa.** Desde `md` (768 px), una fila con texto se convierte en una rejilla de dos columnas:
- **Cita sola:** `md:grid-cols-[auto_1fr]`. La foto (`auto`) se queda casi todo el ancho y la cita, el resto (`src/motion/AlbumPhotos.tsx:238-239`).
- **Nota larga:** `md:grid-cols-[auto_auto] md:gap-x-24`, con 96 px de hueco (`src/motion/AlbumPhotos.tsx:240`).
- **Por debajo de `md`, todo se apila**, y el texto queda tras el pie (`src/motion/AlbumPhotos.tsx:249-253`, comentario).
- **El iPad mini en vertical mide justo 768 px**, asi que entra en la rejilla de escritorio. El design spec ya lo dejaba abierto: «Below `md`, side text simply stacks under the caption — no dedicated mobile design yet» (`docs/design-spec-v2.md:58`).

## Intencion (lienzo de diseño, seleccion de Javi del 2026-11-16)

Fuente: `docs/referencias/movil/Album-A.dc.html`, «Album A · Alternada», la que eligio Javi (nota `n_aal` de `canvas.json`). Es intencion, no estado (`docs/referencias/movil/README.md:6`).

**La cita va debajo del pie de su foto** (`Album-A.dc.html:39`):
- a 16 px del borde izquierdo y con 300 px de ancho;
- serif italica de 22 px, interlineado de 28 px, en `#111111`.

Hoy en el telefono es de 16 px, en `#888888` y con 280 px de ancho como maximo (`src/components/AlbumTexts.tsx:31-33`).

El lienzo no dibuja la nota larga «junto a una foto» en la opcion A. La opcion B, que Javi no eligio, dice: «"Junto a una foto" no cabe en 390: pasa a ir debajo, con 48 px de aire» (nota `n_ab2`).

## Objetivo

Bajo `movil:`, que es telefono en vertical y en horizontal y tablet en vertical, ninguna nota ni cita va al lado de su foto. Todas van debajo del pie y con un ancho de lectura. La foto de esa fila recupera el ancho que tendria sin texto. En escritorio no cambia nada.

## Fuera de alcance

- **El resto del diseño movil del album** (titulo a 64 px, pie en tres lineas, fotos sin curvatura): es la spec `album-movil` (`docs/ESTADO.md`, "Proximos pasos", paso 5).
- **El texto «between»**, que va en su propia fila y no se estrecha.
- **El iPad en horizontal** (1024 px de ancho). No entra en `movil:` (`src/app/globals.css:19-28`), asi que sigue con la rejilla de escritorio. Si ahi tambien se estrecha: SIN VERIFICAR, sin medir.
- **El texto de los datos de `src/data/photos.ts`.** Es de Javi y no se toca.

## Zonas afectadas

- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`, `src/components/AlbumTexts.tsx`), con clases bajo `movil:`
- [ ] Landing
- [ ] Wordmark
- [ ] Carrusel de albumes
- [ ] Atlas
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`): no se toca; las fotos se mueven y el las sigue
- [ ] Datos
- [x] Diagnostico (`scripts/diagnostico.mjs` o un `scripts/lib/` nuevo): las notas en modo dispositivo, que hoy no se miden (la seccion `textos del album` es solo de escritorio, `scripts/diagnostico.mjs:1089`)

## Choca con el spec

- **`docs/design-spec-v2.md` §3:** la cita va «centred both ways in the photo row's whole free side» y la nota larga «96px off the photo on its free side». En movil dejan de ir al lado. El propio §3 lo deja abierto («no dedicated mobile design yet»), y el lienzo elegido por Javi las pone debajo. Al cerrar la spec, el §3 se actualiza.
- **Reglas duras:** ninguna. Las fotos siguen enteras y sin recortar, la interfaz sigue en grises y no hay movimiento nuevo.

## Criterios de aceptacion

Los perfiles moviles son los cinco del diagnostico: `iphone`, `iphone-max`, `ipad-mini` e `ipad` en vertical, mas `iphone --horizontal`. "Medicion de notas" es una seccion nueva del diagnostico en modo dispositivo.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` (escritorio, con build) | Ningun fallo nuevo frente a la linea base de T0. `textos del album` sin fallos |
| CA2 | `node scripts/diagnostico.mjs --capturas-comparar <linea base de T0>` | Landing, `/album/america` (tiene una cita) y `/atlas` a 0 px |
| CA3 | Escritorio, 1440 × 900: caja de cada `[data-album-text]` y `[data-photo-quote]`, y de la `<img>` de su fila, en los cuatro albumes | Iguales a T0, al px |
| CA4 | Medicion de notas, cinco perfiles, los cuatro albumes | Cada nota y cada cita empieza por debajo del pie de su foto (`top` ≥ `bottom` del pie) y no solapa ninguna `<img>` |
| CA5 | Medicion de notas, cinco perfiles | Ancho de cada cita ≥ 260 px, o el ancho util de la fila si es menor. Ninguna nota ni cita sale del viewport |
| CA6 | Medicion de notas, `ipad-mini` e `ipad` | La `<img>` de una fila con texto mide lo mismo (± 1 px) que si la fila no tuviera texto |
| CA7 | Medicion de notas, cinco perfiles | Cita (respuesta 1): computed `font-size` 22 px, `line-height` 28 px, `font-style` italic, `color` `rgb(17, 17, 17)`, ancho ≤ 300 px. Aire de 48 ± 1 px entre el fondo del pie y el texto (respuesta 2). Borde izquierdo del texto en el margen izquierdo de la fila (`left` igual al del contenido de la fila, ± 1 px) tambien en las filas desplazadas a la derecha (respuesta 3) |
| CA8 | Invariantes del modo dispositivo y seccion `navegacion`, cinco perfiles | Sin fallos nuevos frente a T0. «Fotos enteras» ok en los cuatro albumes |
| CA9 | Javi, en su iPad mini en vertical y su iPhone 13, sobre la preview de Vercel | Visto bueno a ojo. No sustituye a los anteriores |

## Respuestas de Javi (2026-11-23)

1. **Estilo de la cita en movil:** el del lienzo Album A. Serif italica de 22 px, interlineado de 28 px, en `#111111` y con 300 px de ancho. Cambia tambien el telefono.
2. **Aire entre el pie y el texto:** 48 px.
3. **Alineacion:** el texto empieza en el margen izquierdo de la pagina, tambien en las filas desplazadas a la derecha.

## Preguntas abiertas

- Ninguna. Las tres de diseño estan respondidas arriba.

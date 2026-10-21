# Plan 010 · Textos del album: nota lateral, cita y parrafo entre fotos

- **Spec:** `spec.md` (decisiones cerradas con Javi el 2026-10-21). Plan aprobado por Javi el 2026-10-21, con un cambio: en `norte`, el texto entre fotos va despues de la foto 2

## Enfoque

Primero se mide la linea base y despues se cambia el codigo.

**Linea base.** `node scripts/diagnostico.mjs --medir /album/america` antes de tocar nada. Esa salida es la referencia de CA9. `america` no va a llevar textos.

**Datos.** Se anaden dos tipos opcionales en `src/data/photos.ts`, con la forma de la spec:
- `Album.text?: AlbumText`. El tipo ya impone que haya como mucho un texto largo por album.
- `Photo.quote?: PhotoQuote`.

Los textos de prueba llevan `placeholder: true` y un cuerpo que empieza por `[PLACEHOLDER]`. Van en los dos albumes cuya forma ya cumple las reglas:

| Album | Pieza | Donde | Por que vale |
|---|---|---|---|
| `sol` | Texto largo lateral | junto a la foto 2 | Vertical, fila izquierda: es la captura de referencia |
| `sol` | Cita | foto 3 | Vertical, fila derecha |
| `norte` | Texto largo entre fotos | despues de la foto 2 | Lo pidio Javi el 2026-10-21 |
| `norte` | Cita | foto 5 | Vertical, fila izquierda |

`america` y `ny` se quedan sin textos y sirven de control para CA9. Javi decidio el 2026-10-21 que sus textos esperan hasta que el diseno este bien implementado en `sol` y `norte`.

**Filtro de placeholders, una sola vez y en el servidor.** `src/app/album/[slug]/page.tsx` quita los textos con `placeholder` cuando `process.env.NODE_ENV === "production"`, antes de pasar nada a `AlbumPhotos`. Asi el HTML de produccion no los lleva (CA8), y el componente no tiene que saber nada de placeholders.

**Pintado, en `src/motion/AlbumPhotos.tsx`.**
- **Fila sin texto lateral:** el JSX de hoy, sin cambios. Es lo que garantiza CA9.
- **Fila con texto lateral:** pasa a ser una rejilla CSS de dos columnas desde `md`.
  - La foto va en la fila 1 y el pie debajo, en la fila 2, en la misma columna.
  - El texto va en la fila 1 de la otra columna. Asi se alinea con la `<img>` y no con la foto mas su pie:
    - texto largo: `self-start` con unos 80 px de margen superior;
    - cita: `self-center`.
  - En una fila derecha se intercambian las columnas.
  - Por debajo de `md` hay una sola columna, y el texto baja debajo del pie.
  - El `data-photo-index` sigue en la fila exterior, igual que hoy.
- **Texto entre fotos:** un bloque propio despues de la fila de la foto `afterPhotoOrder`. Esa fila **no** lleva `data-photo-index`: `AlbumPhotoNav` busca las filas por ese atributo (`src/components/AlbumPhotoNav.tsx:26,62`) y contaria el texto como una foto.
- **Componente nuevo:** las tres piezas tipograficas van en `src/components/AlbumTexts.tsx`, para no inflar el fichero de motion. Son `SideNote`, `Quote` e `Interlude`, mas la firma comun. Cada una lleva su `lang`, `data-album-text` o `data-photo-quote`, y `data-text-kind` para el diagnostico.

**Estilo propuesto.** Javi lo revisa en CA11; todo sale de los grises del sitio.

| Pieza | Texto | Color | Medida |
|---|---|---|---|
| Nota lateral larga | serif 18 px, interlineado 1,65 | `#666666` | ancho maximo 440 px, separacion de la foto 96 px |
| Firma | 12 px, mayusculas, tracking 0.18em | `#A8A8A8` | precedida de una raya de 32 px y 1 px, `#BBBBBB` |
| Cita | serif cursiva 16 px | `#888888` | ancho maximo 280 px; raya de 24 px encima |
| Parrafo entre fotos | serif `clamp(28px, 2.778vw, 48px)`, interlineado 1,075 (el de rluijten) | `#666666` | ancho maximo `83.333vw` (10/12), bloque centrado, texto alineado a la izquierda como en la referencia, `py` de `8.333vw` arriba y abajo; misma firma debajo |

**Diagnostico.** Seccion nueva, `textos del album`. Va despues de `barra de scroll` y antes de `entrada /`, y reutiliza el navegador principal a 1440x900.
- Recorre `/album/sol` y `/album/norte` y mide CA3 a CA7 con `addInv`.
- Con `--url`, contra produccion, la seccion no mide CA3 a CA7: los placeholders no se pintan alli. En su lugar comprueba CA8, que no aparezca ningun `[data-album-text]` ni `[data-photo-quote]`.
- Para CA8 en local, `tasks.md` usa `next build` y `next start`, y busca en el HTML.

Alternativas descartadas:
- **Colocar el texto con `position: absolute` respecto a la fila.** La `<img>` es `w-auto` y su ancho no se conoce en CSS, asi que el texto no sabria donde empieza el hueco.
- **Una rejilla de 12 columnas como rluijten.** Cambiaria la geometria de todas las filas y romperia CA9.
- **Filtrar los placeholders en el componente.** Llegarian serializados en las props del cliente.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/data/photos.ts` | modificar | Tipos `AlbumText` y `PhotoQuote`, campos opcionales `Album.text` y `Photo.quote`, y cuatro textos `[PLACEHOLDER]` en `sol` y `norte` con `placeholder: true` |
| `src/app/album/[slug]/page.tsx` | modificar | Filtra los placeholders en produccion y pasa `albumText` a `AlbumPhotos` |
| `src/motion/AlbumPhotos.tsx` | modificar | La rejilla de dos columnas para las filas con texto lateral, y el bloque entre fotos. Las filas sin texto quedan identicas |
| `src/components/AlbumTexts.tsx` | crear | `SideNote`, `Quote`, `Interlude` y la firma `JAVIER SUÁREZ SUQUÍA` |
| `scripts/diagnostico.mjs` | modificar | Seccion `textos del album` (CA3 a CA8) |
| `docs/design-spec-v2.md` | modificar | §3: las tres piezas, sus reglas y su estilo |
| `specs/010-notas-laterales/tasks.md` | modificar | Marcar las tareas |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| En una fila con texto, `GLSurface` pinta la foto en un sitio distinto de la `<img>` | Baja: lee `getBoundingClientRect()` cada frame (`CLAUDE.md`, arquitectura) | Alto | CA5 mide la proporcion; el diagnostico ya compara el canvas con el viewport |
| Las fotos con texto encogen al compartir el ancho | Baja: solo verticales; a 1440x900 una vertical a 85vh mide unos 510 px, y 510 + 96 + 440 caben en los 1312 px utiles | Medio | CA5. Si falla, el texto baja a 360 px |
| `AlbumPhotoNav` cuenta mal las fotos o salta mal | Baja: la fila entre fotos no lleva `data-photo-index` | Medio | En T6, comprobar que en `norte` hay 8 `[data-photo-index]` y que la flecha siguiente pasa de la foto 2 a la 3 sin detenerse en el texto |
| Lenis calcula mal el alto de la pagina al reflujar el texto con la fuente | Baja: ya hay `resize()` tras `document.fonts.ready` (`src/motion/AlbumPhotos.tsx:58-60`) | Medio | Las invariantes `scroll con rueda/teclado` del album |
| Las cadenas `[PLACEHOLDER]` viajan en un chunk JS de cliente que importe `photos.ts` | Media | Bajo: no se pintan | CA8 mira el HTML, que es lo que se ve. Queda anotado; desaparece al llegar los textos reales |
| Se pone una cita junto a una horizontal o en una fila centrada y nadie lo ve hasta el diagnostico | Media, en el futuro | Bajo | CA4 da FALLA |

## Vuelta atras

- **Rama:** `feat/010-notas-laterales`
- **Como se revierte:** se borran los cuatro placeholders de `photos.ts` y el sitio vuelve a verse como hoy, porque las filas sin texto no cambian. Si hace falta, se revierte el commit entero; la seccion del diagnostico solo mide.
- **Que invariante avisaria de que esto ha roto algo:**
  - `un solo <main> visible`
  - `sin scroll horizontal`
  - `sin barra de scroll`
  - `proporcion de las fotos`
  - `scroll con rueda` y `scroll con teclado` del album
  - CA9, la comparacion con la linea base de `america`

## Verificacion

- T1, linea base de `america` (referencia de CA9): `evidencia/2026-10-21_010-linea-base.txt`
- T6, diagnostico completo con CA1 a CA7 y CA9: `evidencia/2026-10-21_010-textos-album.txt`
- T7, CA8 con `next build` y `next start`: en el mismo fichero
- CA10: `git diff main --stat -- src/`, anotado en `tasks.md`
- CA11: el testimonio de Javi, anotado en `tasks.md`

La regla deny `Write(evidencia/**)` de `.claude/settings.json:27` sigue en pie. La salida va al scratchpad y la copia Javi, como en las specs 007 a 009.

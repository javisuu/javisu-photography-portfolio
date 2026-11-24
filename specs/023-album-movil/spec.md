# Spec 023 · Pagina de album en movil

- **Estado:** Aprobada (Javi, 2026-11-24: «go»)
- **Fecha:** 2026-11-24
- **Requiere decision de Javi:** Si (motivo: GLSurface). En movil, la pagina de album deja de montar `GLSurface`. Es su ciclo de vida, una de las cuatro zonas protegidas. **Javi ya lo decidio el 2026-11-24:** «quita el gl mejor». Las respuestas de diseño estan en "Respuestas de Javi"; lo que falta, en "Preguntas abiertas".

## Problema

La pagina de album no tiene diseño movil. Solo lo tienen sus notas (spec 022). Fuera de eso, en un telefono se ve el diseño de escritorio, estrechado:

- **Titulo:** `clamp(48px, 10vw, 110px)` (`src/app/album/[slug]/page.tsx:62`), o sea 48 px en un iPhone de 390 px. La etiqueta `ALBUM 01 — 9 PHOTOS` va a 13 px en `#666` (`page.tsx:55`). La linea de lugar va a 14 px, sin mayusculas (`page.tsx:68`).
- **Pie de foto:** numero, titulo, `·` y lugar comparten una fila que se parte por donde cae (`src/motion/AlbumPhotos.tsx:203-216`). La camara va en mayusculas, con ` — ` entre datos (`AlbumPhotos.tsx:217-219`).
- **Margenes:** 24 px a los lados (`px-6`) y 64 px arriba y abajo de cada fila (`py-16`) (`AlbumPhotos.tsx:262,280`).
- **Fotos con curvatura.** En movil siguen pasando por `GLSurface` (`AlbumPhotos.tsx:299-310`), con la curvatura suave del album (`AlbumPhotos.tsx:27-28`). En el landing movil ya no se monta (spec 021, `src/lib/movil.ts:1-5`).

**Lo que Javi ve en su iPhone:**
- M11, 2026-11-06: «al bajar muy despacio, las fotos "como que vibran"» (`docs/ESTADO.md`, "Linea base multidispositivo", M11).
- **2026-11-24, de nuevo Javi:** «los saltos de las fotos de albums se producen por hacer un scroll rápido, si es lento no hay problema». Esto contradice el «muy despacio» de M11.
- **Por que pasa:** SIN VERIFICAR, y no se ha medido en el dispositivo. La hipotesis de M11 es que el canvas fijo de `GLSurface` recoloca las fotos un frame despues del scroll nativo de iOS.
- **Que hace esta spec con eso:** quitar `GLSurface` del album en movil elimina ese camino entero, sea cual sea la causa.

**Lo que queda del paso 5 de "Proximos pasos" (`entrada-movil`, M3 y M12):** segun `docs/ESTADO.md`, ya solo esta en el album, porque el landing movil va sin GL. Con esta spec, en movil no queda ninguna instancia de `GLSurface`.

## Intencion (lienzo de diseño, seleccion de Javi del 2026-11-16)

Fuente: «Album A · Alternada», en `docs/referencias/movil/`: frames `Album-top`, `Album-A`, `Album-fin` y `Album-horizontal`, y notas `n_at`, `n_aal`, `n_af` y `n_ah` de `canvas.json`. Es intencion, no estado (`docs/referencias/movil/README.md:6`).

**Como se midio.** Los frames se midieron en Chromium con EB Garamond cargada. La salida esta en el scratchpad de la sesion, `2026-11-24_023-lienzo-album.txt`, pendiente de copiar a `evidencia/`. Las cifras son a 390 px de ancho, salvo donde se indica.

**Bloque de titulo** (`Album-top`):
- Margen lateral de 16 px.
- `← Albums` arriba a la izquierda (top 52).
- Etiqueta `ALBUM 01 — 9 PHOTOS` a 12 px, tracking 0.18em, `#888888`, en top 140.
- Titulo a 64 px de cuerpo y 68 px de interlineado, peso 500, a 12 px de la etiqueta.
- Lugar y año a 12 px, en mayusculas, tracking 0.18em, `#666666`, a 10 px del titulo.
- El bloque acaba en y = 262, y la foto 1 empieza en y = 312, 50 px mas abajo: asoma en la primera pantalla (`n_at`).

**Filas** (`Album-top`, `Album-A`):
- **Fila centrada:** la foto ocupa todo el ancho util (358 × 268).
- **Filas desplazadas:** la foto pegada al margen izquierdo o al derecho (la desplazada a la derecha acaba en x = 374), a 300 px de ancho como mucho. Las verticales se quedan en unos 270 × 360, ~75 % del ancho (`n_aal`).
- **Distancias:** el pie va 14 px debajo de la foto. De la base del pie a la foto siguiente hay 54-55 px.

**Pie en tres lineas** (`n_aal`), alineado con el borde izquierdo de su foto (en la fila desplazada a la derecha empieza en x = 74, igual que la foto):
- **Linea 1:** numero a 14 px en `#BBBBBB`, a 10 px del titulo, que va en serif italica de 18 px y `#111111`.
- **Linea 2:** lugar a 14 px en `#666666`.
- **Linea 3:** camara a 12 px en `#A8A8A8`, sin mayusculas, como `43mm · f/5.6 · ISO 100`.
- Las lineas 2 y 3 van sangradas 26 px, bajo el titulo, con 3 px entre lineas. El pie mide 63 px de alto.
- «Si falta sitio, cae la cámara, nunca el lugar.» No se aplica: la camara no se oculta nunca (respuesta 4).

**Final** (`Album-fin`, `n_af`):
- `NEXT ALBUM` es un solo enlace con zona tactil completa:
  - etiqueta a 12 px, 0.18em, `#888888`;
  - portada de 200 px de ancho;
  - titulo a 40/44 px, peso 500, a 16 px de la portada;
  - lugar y año a 12 px, 0.18em, `#888888`, a 6 px del titulo.
- La portada entra con un fundido de 300 ms al cruzar el 20 % inferior de la pantalla. Con reduced motion, tambien fundido.
- El pie de pagina va centrado y en tres lineas cortas: `SUQUIA` / `Instagram · Email` / año. Lleva un filete de 1 px en `#E4E4E4` encima y 20 px de aire.

**Horizontal 844 × 390** (`Album-horizontal`, `n_ah`):
- Ninguna foto pasa de 300 px de alto. Las verticales se quedan en ~225 px de ancho.
- El pie va al lado de la foto, en una columna de 200 px, a 24 px de ella. Va «alineado abajo»; en el frame, su base queda 27 px por encima de la base de la foto (respuesta 2 de Javi: base con base).
- La barra mide 57 px (ya hecha, spec 020).

**Movimiento** (`n_at`):
- Sin curvatura: fotos quietas.
- En una llegada directa (no desde el carrusel), la foto 1 aparece de golpe cuando esta lista, como en la spec 013. Con reduced motion, igual.

**Ya hecho, no se rehace:**
- El contador pasa a la barra inferior (spec 020).
- Las notas van debajo del pie, a 48 px (spec 022, respuesta 2 de Javi). El lienzo las dibuja a 23 px, pero manda la respuesta.

## Objetivo

Bajo `movil:` (telefono en vertical y en horizontal, tablet en vertical), la pagina de album sigue «Album A · Alternada»: el bloque de titulo, las filas, el pie en tres lineas, el final y el horizontal del lienzo. Las fotos van quietas, en `<img>` del DOM, sin `GLSurface`. En escritorio no cambia nada, ni un pixel ni en comportamiento.

## Fuera de alcance

- **Escritorio y el iPad en horizontal** (1024 px, fuera de `movil:`, `src/app/globals.css:19-28`). Siguen con `GLSurface` y con todo lo de hoy.
- **El codigo de `GLSurface.tsx`.** No se toca: el album en movil simplemente no lo monta, igual que el landing (spec 021).
- **La transicion carrusel→album.** Se redibuja en `carrusel-tactil` (nota `n_sel`). Esta spec solo garantiza que, en movil, siga aterrizando sin `GLSurface` (ver CA9).
- **«Al tocarla: la misma transicion que desde el carrusel»** para NEXT ALBUM (`n_af`). Es una transicion nueva de album a album, que en escritorio tampoco existe. Va en su propia spec.
- **Las notas del album.** Ya estan hechas (spec 022) y no se tocan, salvo en horizontal: pasan a la columna del pie (respuesta 3).
- **B8**, el contador tapado en escritorio. Tiene su spec propia (paso 9).
- **El texto de los datos** (`src/data/photos.ts`). Es de Javi.
- **`EN · ES`**. Es de la spec de idioma.

## Zonas afectadas

- [x] Pagina de album (`src/app/album/[slug]/page.tsx`, `src/motion/AlbumPhotos.tsx`), con clases bajo `movil:` / `movil-h:` y la rama movil leida con `useEsMovil` (`src/lib/movil.ts:37`)
- [x] Renderizador GL: **solo su montaje en el album movil**. `GLSurface.tsx` no cambia. Zona protegida, decidida por Javi el 2026-11-24.
- [x] Pie de pagina (`src/components/Footer.tsx`), bajo `movil:`. Donde mas se usa: lo localiza el plan.
- [ ] Landing
- [ ] Wordmark
- [ ] Carrusel de albumes
- [ ] Atlas
- [ ] Datos
- [x] Diagnostico: una seccion `album-movil` nueva (`scripts/lib/`). Las secciones de fallos GL (`fallo de textura forzado`, `bitmap vacio forzado`, `contexto perdido forzado`, `panel diag`) se adaptan como en la spec 021 con el landing (`scripts/diagnostico.mjs:1979-1990`): en un perfil movil, en el album se mide solo lo que se ve. Las comprobaciones de la instancia GL siguen en escritorio y en `ipad --horizontal`, que es donde sigue habiendo `GLSurface` en iOS.

## Choca con el spec

Ninguna regla dura de `CLAUDE.md` choca con esta spec:
- las fotos siguen enteras, sin recortar y dentro del alto de la pantalla;
- todo sigue en grises;
- no hay parallax de cursor;
- el unico movimiento nuevo (el fundido de NEXT ALBUM) respeta `prefers-reduced-motion`.

Lo que si cambia, y se actualiza al cerrar la spec, son estas descripciones de escritorio en `docs/design-spec-v2.md` y en `CLAUDE.md`:
- **Design spec §3:** «title serif ~110px», «number/title/place share one baseline row» y la camara en mayusculas con ` — `. En movil pasan a ser 64 px, tres lineas y `43mm · f/5.6 · ISO 100`.
- **§3, spec 022:** «In offset rows the caption now follows the row's alignment». En movil el pie se alinea con el borde izquierdo de su foto, tambien en las filas desplazadas a la derecha, como en el lienzo.
- **Motion inventory #1 y `CLAUDE.md`:** el efecto tubo «on every album page». En movil deja de estarlo.

## Criterios de aceptacion

**Perfiles:** los cinco moviles del diagnostico (`iphone`, `iphone-max`, `ipad-mini` e `ipad` en vertical, mas `iphone --horizontal`) y, como control fuera de `movil:`, `ipad --horizontal`.

**«Medicion album-movil»** es la seccion nueva del diagnostico. Mide los cuatro albumes con `--dispositivo <perfil>`.

**Tolerancias:** ± 1 px en las distancias y ± 0,5 px en los cuerpos de letra. Las cifras de vertical son las del lienzo a 390 px. En tablets, las distancias y los anchos se escalan por `ancho del viewport / 390`, y la tipografia no (respuesta 1).

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` (escritorio, con build) | Ningun fallo nuevo frente a la linea base de T0 |
| CA2 | `node scripts/diagnostico.mjs --capturas-comparar <linea base de T0>` | `/album/america`, `/album/sol`, `/` y `/atlas` a 0 px |
| CA3 | Medicion album-movil, cinco perfiles | Sin instancia de Lenis (`html` sin la clase `lenis`, respuesta 5). `window.__glDiag` sin instancia `album`, ningun `<canvas>` en el `<main>` visible, todas las `<img>` del album con `visibility: visible` |
| CA4 | Medicion album-movil, `ipad --horizontal` | Instancia `album` en `window.__glDiag` y contexto creado, y Lenis activo, como hoy |
| CA5 | Medicion album-movil, perfiles en vertical, bloque de titulo | Etiqueta: computed `font-size` 12 px, `color` `rgb(136, 136, 136)`. `<h1>`: 64 px, `line-height` 68 px, `font-weight` 500. Lugar: 12 px, `text-transform: uppercase`. Borde izquierdo de los tres a 16 px del viewport. Distancias de 12 y 10 px entre ellos. El `top` de la foto 1 es menor que el alto del viewport (asoma) |
| CA6 | Medicion album-movil, perfiles en vertical, cada fila | Fila centrada: ancho de la `<img>` igual al ancho util (viewport − 32 px). Filas desplazadas: `<img>` pegada al margen de 16 px de su lado y como mucho 300 px de ancho. Pie a 14 px de la foto. De la base del pie (o de la nota de la spec 022, si la hay) a la foto siguiente, 54 ± 1 px |
| CA7 | Medicion album-movil, cinco perfiles, cada pie | Tres lineas en orden: numero y titulo; lugar; camara. Titulo en italica de 18 px. Lugar a 14 px, `rgb(102, 102, 102)`. Camara a 12 px, `rgb(168, 168, 168)`, `text-transform: none`, con el texto `<focal> · <apertura> · <ISO>`. Lineas 2 y 3 alineadas con el titulo. La camara visible siempre, con caja de alto > 0 (respuesta 4). En vertical, el `left` del pie es igual al de su `<img>`, tambien en las filas desplazadas a la derecha |
| CA8 | Medicion album-movil, `iphone --horizontal` | Ninguna `<img>` pasa de 300 px de alto. Pie a la derecha de su foto, a 24 px, en una columna de 200 px, con su base igual a la de la foto (respuesta 2). Nota o cita, si la hay, en esa columna, a 48 ± 1 px debajo del pie y sin salir de los 200 px. La foto siguiente empieza por debajo de la nota (respuestas 3 y 6) |
| CA9 | Medicion album-movil, cinco perfiles: llegada directa y por NEXT ALBUM | La fila de la foto 1 pasa de `opacity` 0 a 1 de golpe, sin fundido, cuando su `<img>` esta decodificada, y nunca despues de 1500 ms. 0 fotogramas con la fila a `opacity` 1 y la `<img>` sin pintar. Por NEXT ALBUM tras un deslizamiento rapido, `scrollY` 0 en el album nuevo a 1500 ms (B10). Con el carrusel de hoy, el vuelo carrusel→album aterriza y deja la `<img>` visible, sin montar GL |
| CA10 | Medicion album-movil, perfiles en vertical, final | `NEXT ALBUM` es un unico `<a>` que contiene etiqueta, portada (200 px de ancho, proporcion natural), titulo a 40/44 px y lugar. Su caja mide al menos 44 px de alto. Pie de pagina centrado en tres lineas, con `border-top` de 1 px en `rgb(228, 228, 228)` |
| CA11 | Medicion album-movil, perfiles en vertical, con y sin `prefers-reduced-motion` | La portada de NEXT ALBUM esta a `opacity` 0 hasta cruzar el 20 % inferior de la pantalla, y luego llega a 1 con una transicion de 300 ms. Solo anima `opacity`, ni `transform` ni `filter` |
| CA12 | Invariantes del modo dispositivo, cinco perfiles, mas `navegacion` y `notas-movil` | Sin fallos nuevos frente a T0. «Fotos enteras» ok en los cuatro albumes. `notas-movil` sin fallos: las notas siguen a 48 px del pie |
| CA13 | Secciones de fallos GL con `--dispositivo iphone` y con `--dispositivo ipad --horizontal` | En el iPhone, en el album: se ven las mismas fotos con el fallo forzado que sin el, y no hay instancia GL. En el iPad en horizontal, las mismas comprobaciones de instancia que hoy, sin fallos |
| CA14 | Javi, en su iPhone 13 y su iPad mini en vertical, sobre la preview de Vercel, con scroll rapido y lento | Las fotos no saltan ni vibran, y visto bueno al diseño a ojo. No sustituye a los anteriores: el salto es algo que la emulacion no reproduce (M9 y M11) |

## Respuestas de Javi (2026-11-24)

1. **Tablets en vertical: escalado.** Como el landing (spec 021): la composicion del telefono escalada en `vw` desde 390 px (margenes, anchos de foto y distancias). La tipografia va en px fija, como en el lienzo. Ejemplo: margen de 16 px a 390, unos 31,5 px a 768.
2. **Pie en horizontal: base con base.** La base del pie coincide con la base de su foto (± 1 px), como dice la nota `n_ah`, no como el frame.
3. **Notas en horizontal: en su columna.** La nota o la cita va debajo del pie, en la misma columna de 200 px, al lado de la foto.

4. **La camara no se oculta nunca**, en ningun perfil ni orientacion. La frase del lienzo «si falta sitio, cae la camara» no se aplica: si falta sitio, el pie crece en alto.
5. **Sin Lenis en el album movil:** scroll nativo, como el landing (spec 021). La decision se lee una vez con `useEsMovil` y no cambia hasta recargar. Lenis sigue igual en escritorio y en el iPad en horizontal.
6. **La nota en la columna de 200 px:** la cita o la nota mide como mucho 200 px de ancho y conserva los 48 px de aire bajo el pie. Como el pie va base con base con la foto (respuesta 2), la nota queda por debajo de la base de la foto y la fila crece hacia abajo lo que haga falta. La foto siguiente empieza por debajo de la nota.

## Preguntas abiertas

- Ninguna.

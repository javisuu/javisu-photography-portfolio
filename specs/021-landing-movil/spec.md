# Spec 021 · Landing movil

- **Estado:** Aprobada (Javi, 2026-11-18)
- **Fecha:** 2026-11-18
- **Requiere decision de Javi:** Si, y Javi la dio el 2026-11-18 (respuesta 7, «vale»; ver "Respuestas de Javi"). Toca las cuatro zonas protegidas:
  - **Scroll infinito:** en movil el landing pasa a ser finito, con scroll nativo y sin Lenis (respuesta 4). Hoy Lenis lo crea con `infinite: true` (`src/motion/LandingComposition.tsx:327`), pero sin `syncTouch`, que vale `false` por defecto (`node_modules/lenis/dist/lenis.mjs:434`). Segun la documentacion de Lenis 1.3.26, `infinite` necesita `syncTouch: true` en tactil (`node_modules/lenis/README.md:199`). Por eso en el telefono el landing ya tiene un final, que es lo que Javi ve: «el scroll en movil tiene un limite hasta abajo». Que hoy no haga la vuelta en el iPhone: SIN VERIFICAR con medida (T0).
  - **Ciclo de vida de `GLSurface`:** el lienzo pide el telefono sin curvatura GL, y hoy el landing la monta siempre (`src/motion/LandingComposition.tsx:943-953`).
  - **Wordmark:** su tamaño en movil cambia, de `clamp(64px, 16vw, 158px)` (`src/motion/LandingComposition.tsx:1049`) a 78 px en vertical y 96 px en horizontal.
  - **Blend `difference`:** sin canvas, el `<h1>` se mezcla con `<img>` del DOM. Ningun envoltorio nuevo de las fotos puede quedar como ancestro del `<h1>` con transform, opacity, filter, etc.

## Intencion (lienzo de diseño, seleccion de Javi del 2026-11-16)

Fuente: `docs/referencias/movil/`, «Landing A · Dispersion» (frames `Main`, `Landing-A-scroll` y `Landing-horizontal`, y las notas de `canvas.json`). Es intencion de diseño, no estado (`docs/referencias/movil/README.md:6`).

- **Sobrevive** la constelacion con solapes y el nombre en `difference`. **Se sacrifica** el tamaño: cada foto ocupa del 40 al 65 % del ancho. En `Main`, a 390 px de ancho, las horizontales miden de 190 a 198 px y las verticales 156 px; en `Landing-A-scroll` hay una de 250 px. Entran cinco fotos por pantalla.
- **Scroll vertical nativo**, con Lenis desactivado en tactil. El lienzo lo pedia infinito, por duplicado del bloque. **Javi lo cambia (respuesta 4): en movil el landing es finito**, una sola vuelta de las 15 fotos, sin la copia. Las fotos llevan un parallax suave: entre 0,9 y 1,1 veces el scroll, solo `translateY`.
- **Sin curvatura GL en el telefono:** «el blend es el momento firma y la curvatura duplicaria el coste en una CPU 4-6x mas lenta».
- **Reduced motion:** sin parallax, solo fundidos.
- **SUQUIA a 78 px**, peso 500 y +0,02 em, unos 300 px de ancho, con 45 px de aire a cada lado; centrado con su borde superior en y = 382. Debajo, el descriptor en dos lineas de 12 px y 18 px de interlinea (en una no cabe a 12 px), con su borde superior en y = 474.
- **Horizontal (844 × 390):** SUQUIA a 96 px (unos 370 px de ancho) y el descriptor en una sola linea. Ninguna foto pasa de 300 px de alto (el limite es 330). Margenes seguros de 47 px a cada lado.
- **Segundo disparador del panel:** al llegar al final del landing, cuando la foto 15 cruza el centro, se abre el panel de la spec 020 (nota «2 · Dos disparadores, un panel»; spec 020, respuesta 6: «Landing movil»). Solo una vez por visita. Se cierra con `Close` y el scroll sigue donde estaba, asi que se puede volver hacia arriba; mientras el panel esta abierto, el scroll se detiene.

## Problema

En el telefono, el landing es la composicion de escritorio estirada:

- **Posiciones y tamaños de escritorio.** Cada foto se coloca con `x`, `y` y `w` pensados para 1440 px (`src/motion/LandingComposition.tsx:217-231`). Por debajo de 900 px de ancho, la foto pasa a medir `min(w·2,4, 85vw)` (`src/app/globals.css:77-80`), sin tener en cuenta ni su `x` ni su alto.
- **Fotos cortadas en vertical (M13).** En emulacion de iPhone 13 (390 × 664), 6 de las 15 fotos copy-0 se salen por la derecha, hasta 157 px, y `norte/03` queda oculta en un 54 %. Lo vio Javi el 2026-11-12 y lo repite el 2026-11-18: «se siguen cortando las imagenes de la landing en el movil». La tabla por foto solo esta en la conversacion de ese dia (`docs/ESTADO.md`, M13): SIN VERIFICAR como evidencia hasta medirla en T0.
- **Fotos mas altas que la pantalla en horizontal (M1).** 22 de las 30 fotos no caben en el alto del viewport. Ejemplo: `sol/03` a 396 × 528 en un viewport de 750 × 342. Rompe la regla dura «toda foto cabe en una altura de viewport» (`evidencia/2026-11-03_017-linea-base-chromium-iphone-h.txt:305,319`).
- **Fotos pequeñas deformadas (M4).** Se deforman entre 1,2 y 2,2 px; por ejemplo, `norte/03` a 320 × 91 (`evidencia/2026-11-03_017-linea-base-chromium-iphone-max.txt:206`).
- **El diagnostico no ve M13.** «Fotos enteras» comprueba el alto y la proporcion, pero no que la foto quepa a lo ancho (`docs/ESTADO.md`, M13). Ademas, su regex de los albumes esta rota: `/^s*slug…/` en vez de `/^\s*slug…/` (`scripts/diagnostico.mjs:402`), y solo mide `/`.
- **Lo demas es lo de escritorio:**
  - Scroll suavizado por Lenis (`src/motion/LandingComposition.tsx:327`).
  - Curvatura GL con valores de espectaculo (`BEND_DEPTH = 1`, `:45`).
  - Parallax por `depth`, de 0 a 0,6 (`:700-711`).
  - Wordmark a `clamp(64px, 16vw, 158px)`, que da 64 px a 390 px de ancho (`:1049`).
  - Descriptor a 13 px y 0,34 em, en una linea, a `50% + 109px` (`:1096-1101`).

## Objetivo

En telefonos (en vertical y en horizontal) y tablets en vertical, el landing es «Landing A · Dispersion»: cada foto entera a lo ancho y a lo alto, con su proporcion; scroll nativo y finito con un parallax suave, sin curvatura GL; SUQUIA y el descriptor a su tamaño de movil, y el panel saltando una vez al llegar al final. Todo medido por una seccion nueva del diagnostico en modo dispositivo; a 1440 × 900 el sitio queda identico al pixel.

## Fuera de alcance

- **El escritorio**, incluido el iPad en horizontal y las ventanas de escritorio estrechas, que siguen con la regla de `max-width: 899px` de hoy (respuesta 6).
- **La entrada (frame `Landing-llegada`):** 4 o 5 participantes, 220 ms por foto, al menos 120 ms entre una y otra y una dispersion de 700 ms. Va en `entrada-movil` (respuesta 1). Aqui la entrada de hoy sigue funcionando con la composicion nueva, sin cambiar sus tiempos.
- **Cerrar el panel deslizando hacia abajo.** Lo pide la nota del lienzo, pero la spec 020 (respuesta 7) decidio que basta con el boton `Close`.
- **El idioma (`EN · ES`) y el descriptor en español:** van en la spec de idioma.
- La pagina de album, el carrusel, el atlas, la barra y el panel, salvo el disparador nuevo.
- `src/data/photos.ts`: no cambia que fotos salen en el landing ni en que orden.

## Zonas afectadas

- [x] Landing (`src/motion/LandingComposition.tsx`, `src/app/globals.css`): composicion movil, scroll nativo, parallax, tamaño del wordmark y del descriptor, y disparador del panel
- [x] Wordmark (`src/motion/LandingComposition.tsx:1045-1090`): solo su tamaño y su posicion en movil. `src/motion/DecipherWordmark.tsx` no cambia
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [x] Renderizador GL (`src/motion/GLSurface.tsx`): no se toca su codigo; el landing no lo monta en movil, ni en telefono ni en tablet en vertical (respuesta 2)
- [x] Scroll (`src/motion/useLenis.ts`, `src/motion/LandingComposition.tsx:327`): sin Lenis en el landing en movil, y finito
- [x] Panel (`src/components/movil/PanelMovil.tsx`, `src/components/movil/panel.ts`): solo un disparador nuevo
- [ ] Datos (`src/data/photos.ts`)
- [x] Diagnostico (`scripts/diagnostico.mjs`, `scripts/lib/`): seccion nueva `landing-movil` y «fotos enteras» tambien a lo ancho

## Choca con el spec

- **`docs/design-spec-v2.md` §1** dice que el landing es «smoothed with Lenis». En movil deja de serlo.
- **El landing infinito** (`CLAUDE.md`, «the landing's infinite scroll»; copias en `src/motion/LandingComposition.tsx:69`): en movil es finito, sin la copia (respuesta 4).
- **El Motion inventory #1 del design spec** (efecto tubo con `GLSurface` en el landing) deja de aplicarse en movil, telefono y tablet en vertical (respuesta 2).
- **`CLAUDE.md`, arquitectura del landing persistente:** el contexto WebGL y las texturas se conservan entre rutas. En el telefono no habria contexto que conservar.

Las cuatro son decisiones de Javi: la de diseño del 2026-11-16 (nota «A · Dispersion») y las respuestas del 2026-11-18. Al cerrar la spec, el design spec y `CLAUDE.md` se actualizan para decir que en movil es asi.

**No choca con ninguna regla dura:**
- Las fotos siguen sin recortar y caben enteras. Hoy esa regla la rompen M1 y M13; esta spec las arregla.
- La interfaz sigue en grises.
- No hay parallax de cursor: el parallax sigue al scroll.
- `prefers-reduced-motion` quita el parallax.

## Criterios de aceptacion

«Movil» son los cinco perfiles de la spec 020: `--dispositivo iphone`, `iphone-max`, `ipad-mini`, `ipad` y `iphone --horizontal`, en Chromium. «Escritorio» es el diagnostico sin `--dispositivo`.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` (escritorio, con build) | Ningun fallo nuevo frente a la linea base de T0 |
| CA2 | `node scripts/diagnostico.mjs --capturas-comparar <linea base de T0>` | Landing, `/album/america` y `/atlas` a 0 px; `currentSrc` del landing igual |
| CA3 | Seccion `landing-movil`, los cinco perfiles: en reposo y tras arrastrar por toque 0,5, 1, 2 y 3 alturas | Cada `.landing-photo` copy-0 que interseca el viewport cabe en el: alto ≤ `innerHeight` y ancho ≤ `innerWidth`. Ninguna sale por la izquierda ni por la derecha (`left ≥ 0`, `right ≤ innerWidth`) |
| CA4 | Seccion `landing-movil`, `iphone` e `iphone-max` | Ancho de cada foto entre el 40 y el 65 % de `innerWidth`. En `ipad-mini` e `ipad`, la misma composicion escalada al ancho (respuesta 2): la misma fraccion del ancho por foto ± 1 % que en `iphone` |
| CA5 | Seccion `landing-movil`, `iphone --horizontal` | Ninguna foto de mas de 300 px de alto, y ninguna fuera de la franja que dejan 47 px a cada lado |
| CA6 | «Fotos enteras» (con la regex de `scripts/diagnostico.mjs:402` arreglada) en los cinco perfiles | Proporcion de cada foto < 1 % o ≤ 1 px (M4) en `/` y en los cuatro albumes |
| CA7 | Seccion `landing-movil`, los cinco perfiles | Sin canvas de `GLSurface` del landing: `window.__glDiag` sin contexto del landing, o sin canvas en el DOM; y ninguna `<img>` del landing con `visibility: hidden`. Tras girar a horizontal un perfil cargado en vertical (`ipad-mini`, `ipad`), sigue sin canvas hasta recargar (respuesta 5) y sin errores de consola |
| CA8 | Seccion `landing-movil`, los cinco perfiles | Sin Lenis en `/`: `<html>` sin la clase `lenis`. Un arrastre por toque de N px mueve `scrollY` N ± 2 px cuando no hay inercia |
| CA9 | Seccion `landing-movil`: toques hasta el final del documento | Hay final: `scrollY` llega a `scrollHeight − innerHeight` y no salta hacia atras (sin vuelta). Solo hay 15 `.landing-photo` visibles, sin la copia. Al final, la ultima foto queda entera en pantalla y por encima de la barra |
| CA10 | Seccion `landing-movil`: `top` de cada foto con parallax frente a `scrollY`, en dos puntos separados por 200 px | Desplazamiento de cada foto entre 0,9 y 1,1 veces el del scroll; las fotos sin parallax, 1,0 ± 0,01. Con reduced motion, todas 1,0 ± 0,01 |
| CA11 | Seccion `landing-movil` y las invariantes de siempre | `<h1>` a 20vw en vertical (78 px a 390 de ancho; escalado al ancho en iphone-max y en las tablets, enmienda 1) y a 96 px en horizontal (computed `font-size`). Su caja con ≥ 40 px de margen a cada lado en vertical. Las invariantes de «wordmark dice SUQUIA» y del blend sin ancestros que lo rompan, ok |
| CA12 | Seccion `landing-movil` | Descriptor a 12 px: en vertical, en dos lineas (alto 36 ± 1 px); en horizontal, en una (alto ≤ 17 px). Sin cortar la caja del `<h1>` y por encima de la barra |
| CA13 | Seccion `landing-movil`, toques hasta que la ultima foto cruza el centro | El panel se abre una vez (`aria-expanded` true) y el scroll se queda quieto mientras esta abierto (arrastre de 1000 px: `scrollY` igual). Tras `Close`, `scrollY` igual que antes de abrirse. Un vaiven corto al final (menos de media pantalla) no lo vuelve a abrir; subir al menos media pantalla y volver a bajar hasta el final, si (enmienda 1). En una carga nueva de la pagina, salta otra vez. Con reduced motion, el panel entra en un fundido de 200 ms, sin escalonado |
| CA14 | `--dispositivo iphone --cpu 4`, seccion `landing-movil`: arrastre por toque de 3 s | 0 frames > 50 ms durante el scroll |
| CA15 | Invariantes de la seccion `navegacion` (spec 020) en los cinco perfiles | Sin fallos nuevos |
| CA16 | Javi, en su iPhone 13 (vertical y horizontal) y su iPad mini en vertical, sobre la preview de Vercel | Visto bueno a ojo. Es el unico criterio a ojo y no sustituye a ninguno de los anteriores |

## Respuestas de Javi (2026-11-18)

1. **La entrada va en `entrada-movil`:** «vale a entrada-movil». Aqui la entrada de hoy solo tiene que seguir funcionando con la composicion nueva.
2. **El iPad mini y el iPad en vertical** usan la misma composicion, escalada al ancho, y tampoco montan GL: «si».
3. **La colocacion de las 15 fotos** la hace el agente con las reglas del lienzo (40-65 % del ancho, solapes, unas cinco por pantalla), y Javi da el visto bueno con capturas antes de seguir: «si, siguiendo ese patron».
4. **El final del landing.** Primero respondio «mantener lenis para la vuelta, date cuenta que el scroll en movil tiene un limite hasta abajo hasya que el menu se popee». Se le explico que Lenis solo hace la vuelta en tactil con `syncTouch: true`, y que entonces el scroll ya no es nativo (`node_modules/lenis/README.md:199`). Eligio **«Finito + panel»**: scroll nativo y con final, y el panel salta una vez por visita al llegar a la ultima foto.
5. **Al girar el dispositivo:** «creo que sera mejor movil». El camino movil se decide al cargar la pagina y se mantiene hasta recargar, aunque un iPad gire a horizontal.
6. **Las ventanas de escritorio estrechas** se quedan como hoy: «si».
7. **Permiso** para tocar `useLenis` y el montaje de `GLSurface` en el landing, solo en movil y con el escritorio identico al pixel: «vale».

## Enmienda 1 (2026-11-19): el panel en cada llegada al final, y SUQUIA escalado al ancho

Javi, tras verlo en la preview del iPhone y el iPad (T7): «It's alright. 2 bugs: 1. After descending on mobile phone to the bottom only the first time the menu pops. The suquia box seeems to hace a fixed size, on ipad it is very small.»

- **El panel salta cada vez que se llega al final**, no una vez por visita. Se rearma cuando la ultima foto vuelve a quedar al menos media pantalla por debajo del centro (al subir), para que el rebote o un vaiven corto al final no lo abra otra vez. Cambia la respuesta 4 y la nota «2 · Dos disparadores, un panel» en eso: antes, «solo una vez por visita».
- **SUQUIA en vertical mide 20vw**: los 78 px del lienzo a 390 de ancho, escalados al ancho como el resto de la composicion (respuesta 2). En el iPad mini, 154 px. La zona tactil del panel y la distancia al descriptor (52 px a 390 de ancho) escalan con el. En horizontal, 96 px, como estaba.

## Preguntas abiertas

- Ninguna de diseño.
- **Para el plan.** Con el camino fijado al cargar (respuesta 5), un iPad cargado en vertical que gira a horizontal sale de la variante CSS `movil:` (`src/app/globals.css:19-28`), y su composicion pasaria a la de escritorio sin GL. El plan tiene que decidir si la composicion tambien queda fija hasta recargar (con una clase en `<html>` en vez de la media query) o si basta con las `<img>` del DOM a tamaño de escritorio. Lo segundo es el camino de reserva que `GLSurface` ya usa cuando no hay WebGL.

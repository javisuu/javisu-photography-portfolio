# Spec 020 · Navegacion movil

- **Estado:** Aprobada (Javi, 2026-11-16)
- **Fecha:** 2026-11-16
- **Requiere decision de Javi:** Si (motivo: **wordmark**, porque tocar SUQUIA abre el panel. Decidido por Javi en la respuesta 3: zona tactil hermana del `<h1>`, sin tocar el `<h1>`. El scroll infinito ya no se toca aqui: el disparador por scroll pasa a `landing-movil`, respuesta 6)

## Intencion (lienzo de diseño, seleccion de Javi del 2026-11-16)

Fuente: `docs/referencias/movil/` (copia del lienzo «SUQUIA — Móvil», commit `111bdd4`). Es intencion de diseño, no estado (`docs/referencias/movil/README.md:6`).

- **Barra A siempre** (`Main.dc.html`, nota `n_na` de `canvas.json`): barra fija abajo, 78 px de alto con 34 px de margen inferior para el indicador de inicio, fondo `#FAFAFA`. A la izquierda `ABOUT ME`, `ALBUMS`, `ATLAS`. Etiquetas a 12 px, tracking 0,18 em, mayusculas; activo `#111111`, resto `#666666`; cada enlace con 44 px de alto. El `EN · ES` del lienzo **no se muestra** hasta la spec de idioma (respuesta 1).
- **Panel B** (`Nav-B.dc.html`, notas `n_nb`, `n_h3`): capa blanca a pantalla completa. SUQUIA pequeño arriba (22 px, peso 500, tracking 0,14 em, en `left 16 / top 62`), enlaces en serif grande en la mitad baja (desde `top 380`), `Credits` en `#888888`, y `Close` abajo. Entra por opacidad 0→1 en 240 ms con los enlaces escalonados 40 ms (translateY 12→0). Se cierra solo con el boton `Close` (respuesta 7): fundido de 200 ms de vuelta al punto exacto. Reduced motion: fundido de 200 ms sin escalonado. Mientras esta abierto, el landing de debajo no se desplaza.
- **Disparador del panel en esta spec:** tocar SUQUIA en el landing (nota `n_h2`, a): zona tactil de 80 px de alto con `aria-expanded`. El segundo disparador, al acabar la primera vuelta del landing, va en `landing-movil` (respuesta 6).
- **Por pagina** (frames `Albums-A`, `Album-top`, `Album-A`, `Credits`; notas `n_sel`, `n_at`, `n_cr`, `n_las`):
  - `/albums`: la barra queda fija, con `ALBUMS` activo.
  - `/album/[slug]`: arriba `← Albums` en el bloque de titulo (`Album-top`). Al dejar atras el bloque de titulo, la barra pasa a ser la del album: `← Albums` a la izquierda y flecha anterior, `06 / 09`, flecha siguiente a la derecha (`Album-A`), que sustituye en movil al control fijo del borde derecho (respuesta 4).
  - `/credits`: `← SUQUIA` arriba y la barra abajo.
  - Landing: `CREDITS` sigue girado en el borde izquierdo, bajado al tercio inferior (`top 590`, zona tactil de 40 × 120 px). El contador `01 / 15` sube por encima de la barra (respuesta 5).
  - Telefono en horizontal: barra de 36 px mas 21 px de indicador, con margenes seguros de 47 px a cada lado (nota `n_lh`).

**Decisiones de Javi, 2026-11-16 (conversacion):** el diseño movil se aplica a **telefonos (en vertical y en horizontal) y tablets en vertical**, nunca al escritorio (respuesta 2). El escritorio no cambia ni un pixel (regla de memoria «movil no toca escritorio»).

## Problema

En telefono y tablet la navegacion es la de escritorio:

- En el landing, `ABOUT ME` y `ALBUMS` arriba a la izquierda y `ATLAS` a la derecha, a 13 px y tracking 0,22 em, con `p-6` (`src/motion/LandingComposition.tsx:958-970`). Las tres etiquetas viven solo en el landing; el contador del foco `01 / 15` va abajo a la derecha (`:984-988`).
- Cada etiqueta se envuelve en `ScrambleText`, un efecto de hover (`:961-968`), que en tactil no existe.
- `CREDITS` va girado en el centro vertical del borde izquierdo (`:976-982`), a 12 px y `#B0B0B0`.
- Fuera del landing, la unica navegacion es un `← Suquia` arriba a la izquierda en `/about`, `/albums`, `/atlas` y `/credits` (`src/app/about/page.tsx:30`, `src/app/albums/page.tsx:30`, `src/app/atlas/page.tsx:55`, `src/app/credits/page.tsx:22`), y `← ALBUMS` en el album (`src/motion/albumTransition/BackToAlbums.tsx:33`). Para ir de `/atlas` a `/about` hay que pasar por `/`.
- En el album, el control de flechas y contador es `src/components/AlbumPhotoNav.tsx`, fijo en el borde derecho y oculto por debajo de 768 px (`hidden … md:flex`, `:89`): en el iPhone no hay contador ni flechas, y en el iPad en vertical si, robando ancho a las fotos.
- Todo arriba: fuera de la zona del pulgar, y en el landing compite con el wordmark en 390 px.

El diagnostico no mide nada de esto en modo dispositivo (SIN VERIFICAR que no haya ninguna invariante de navegacion en `scripts/lib/dispositivo.mjs`; a confirmar en el plan).

## Objetivo

En telefono (vertical y horizontal) y en tablet en vertical, cada ruta tiene la barra inferior del lienzo y el landing abre el panel a pantalla completa al tocar SUQUIA, todo medido por una seccion nueva del diagnostico en modo dispositivo; a 1440 × 900 el sitio es identico al pixel al de hoy.

## Fuera de alcance

- **Idioma.** Sin selector `EN · ES` hasta la spec de idioma.
- **El panel al acabar la primera vuelta del landing:** va en `landing-movil`, junto con el cambio a scroll nativo (respuesta 6). Esta spec no toca el scroll infinito ni Lenis.
- **Deslizar hacia abajo para cerrar el panel** (respuesta 7).
- La composicion del landing (dispersion, tamaños de foto, llegada, curvatura GL): `landing-movil`.
- El carrusel en tira vertical, la transicion en movil, la composicion del album en movil y el atlas en movil: specs propias. Aqui solo entra su barra.
- El escritorio, incluido el iPad en horizontal.

## Zonas afectadas

- [x] Landing (`src/motion/LandingComposition.tsx`): barra, `CREDITS`, contador, zona tactil de SUQUIA y panel
- [x] Wordmark: un elemento hermano del `<h1>` (`src/motion/LandingComposition.tsx:1034-1038`) como zona tactil. El `<h1>` y `src/motion/DecipherWordmark.tsx` no cambian
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`): no se toca; la barra va en `src/app/albums/page.tsx` o en el layout
- [x] Pagina de album (`src/app/album/[slug]/page.tsx`, `src/components/AlbumPhotoNav.tsx`)
- [x] Atlas (`src/app/atlas/page.tsx`): solo la barra
- [x] About y Credits (`src/app/about/page.tsx`, `src/app/credits/page.tsx`): solo la barra
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [x] Layout raiz (`src/app/layout.tsx`), si la barra se monta una sola vez para todas las rutas
- [x] Diagnostico (`scripts/diagnostico.mjs`, `scripts/lib/dispositivo.mjs`): seccion nueva

## Choca con el spec

1. **El `<h1>` del wordmark no puede ser la zona tactil.** Es `pointer-events-none fixed inset-0` (`src/motion/LandingComposition.tsx:1035`): ocupa la pantalla entera, y hacerlo tocable taparia todos los toques del landing. Decidido (respuesta 3): un elemento hermano transparente, de 80 px de alto y el ancho del nombre, sobre su banda. Nunca un ancestro ni un envoltorio del `<h1>`: envolverlo ya rompio el blend (`:997-1006`).
2. **`CLAUDE.md` dice que el header nav del landing es `ABOUT ME`/`ALBUMS` arriba a la izquierda y `ATLAS` arriba a la derecha**, y que `CREDITS` es el unico rotulo girado (build order §2). En movil la barra pasa abajo y aparece en todas las rutas. En escritorio la regla sigue valiendo; se anota en `CLAUDE.md` y el design spec al cerrar.
3. **Hard rules:** nada. Solo escala de grises, sin cursor ni giroscopio, el panel anima solo opacidad y translateY, y reduced motion queda en fundido.

## Criterios de aceptacion

**«Movil»** es esta condicion, y solo esta (respuesta 2):

`(pointer: coarse) and ((orientation: portrait) and (max-width: 1024px)), (pointer: coarse) and (orientation: landscape) and (max-height: 500px)`

`pointer: coarse` deja fuera cualquier ventana de escritorio, por estrecha que sea. Que la emulacion de Playwright con `hasTouch` (`scripts/lib/dispositivo.mjs:45-51`) informe `pointer: coarse` en Chromium: SIN VERIFICAR, lo comprueba T0.

Perfiles: `iphone`, `iphone-max`, `ipad-mini` e `ipad` de `--dispositivo`, en vertical, y `iphone` con `--horizontal`. «Seccion `navegacion`» es la invariante nueva del diagnostico en modo dispositivo que añade esta spec.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` (escritorio, con build) | Ningun fallo nuevo frente a la linea base de T0; en especial las del blend, «un solo `<main>` visible» y el wordmark en `SUQUIA` |
| CA2 | Capturas a 1440 × 900 de las seis rutas, antes y despues (como la spec 018) | 0 px de diferencia |
| CA3 | `node scripts/diagnostico.mjs --skip-build --dispositivo iphone` (y `iphone-max`, `ipad-mini`, `ipad`), seccion `navegacion` | En las seis rutas: una sola barra visible, `position: fixed`, borde inferior del rect = alto del viewport, alto 78 px; cada enlace con rect ≥ 44 px de alto; ninguno fuera del viewport ni tapado (`elementFromPoint` en su centro devuelve el propio enlace); ningun `EN`/`ES` visible; la navegacion de escritorio (`ABOUT ME` arriba, `← Suquia`) no visible |
| CA4 | Seccion `navegacion`, toque real por CDP en cada enlace de la barra | Lleva a su ruta (`/about`, `/albums`, `/atlas`); el enlace de la ruta actual en `#111111` y los demas en `#666666` (color computado) |
| CA5 | Seccion `navegacion`, toque en la zona de SUQUIA del landing | El panel llega a opacidad 1 en ≤ 300 ms; `aria-expanded="true"`; sus cuatro enlaces en la mitad inferior del viewport; con el panel abierto, un arrastre de 1000 px deja `scrollY` igual (± 1 px); `Close` lo devuelve a opacidad 0 en ≤ 260 ms con `scrollY` igual al de antes de abrir (± 1 px) |
| CA6 | Seccion `navegacion`, toque en una foto y en el centro del landing fuera de la zona de SUQUIA | No abre el panel |
| CA7 | Seccion `navegacion` con `reducedMotion: "reduce"` | El panel abre y cierra solo por opacidad: ningun cambio de `transform` en sus enlaces; duracion ≤ 260 ms |
| CA8 | Invariante existente «ancestros del blend», en modo dispositivo y en escritorio | Pasa: ningun ancestro del `<h1>` gana transform/opacity/filter/perspective/isolation/will-change, y la zona tactil es hermana suya |
| CA9 | Seccion `navegacion`, landing | El contador `NN / 15` visible por completo encima de la barra (su borde inferior ≤ el borde superior de la barra) y `CREDITS` con zona tactil de 40 × 120 px en el tercio inferior |
| CA10 | Seccion `navegacion`, `/album/america` en `iphone` e `ipad` | Arriba `← ALBUMS` en el bloque de titulo; tras bajar mas alla del bloque, la barra del album (`← ALBUMS`, flechas y `NN / 09`); el contador coincide con la foto en el centro del viewport; tocar la flecha siguiente lleva a la foto siguiente; el control del borde derecho (`AlbumPhotoNav` de escritorio) no visible |
| CA11 | Seccion `navegacion`, `--dispositivo iphone --horizontal` | Barra de 36 px de alto con margenes laterales ≥ 47 px; los criterios de CA3 y CA4 se cumplen igual |
| CA13 | Seccion `navegacion`, `/atlas` y `/albums` | Nada que hoy va pegado al borde inferior queda bajo la barra: la leyenda del atlas con «© OpenStreetMap contributors» (`src/motion/Atlas.tsx:1575-1600`, obligatorio por licencia), el control de reinicio del atlas (`:1605`), y el titulo, la linea gris y el contador `NN / 04` del carrusel (`src/motion/AlbumsCarousel.tsx:1053`): `elementFromPoint` en su centro devuelve el propio elemento. Añadido al planificar (2026-11-16) |
| CA12 | Javi, en su iPhone 13 (vertical y horizontal) y su iPad mini en vertical, sobre la preview de Vercel | Visto bueno a ojo. Es el unico criterio a ojo y no sustituye a ninguno de los anteriores |

## Respuestas de Javi (2026-11-16)

1. `EN · ES` oculto hasta la spec de idioma: «Vale».
2. Entra el telefono en horizontal, nunca el escritorio: «Entra el telefono horizontal (no desktop)».
3. Zona tactil hermana del `<h1>`, sin tocarlo: «Si».
4. Flechas y contador del album en la barra, en esta spec: «Si».
5. El contador del landing sube por encima de la barra: «Sube».
6. El panel al acabar la primera vuelta va en `landing-movil`: «Landing movil».
7. Basta con el boton de cerrar: «Basta con boton cerrar».

## Enmienda 1 (2026-11-17): vuelta al landing en movil (B15)

T6 encontro que en movil ningun enlace llevaba a `/` salvo en `/credits`: la invariante «CA4 vuelta a / tras perder el contexto en un album» (spec 018) fallaba en todos los perfiles. Decision de Javi: «al landing se vuelve desde albums con una etiqueta que te envie de vuelta». `← Suquia` se vuelve a ver en movil en `/albums` (y sigue en `/credits`); en `/about` y `/atlas` sigue oculto, y desde ahi se llega por `ALBUMS` en la barra. CA3 pasa a exigir `← Suquia` visible en `/albums` y `/credits`, y ausente en las demas rutas. El escritorio no cambia: solo se quita la variante `movil:hidden`.

## Preguntas abiertas

- Ninguna de diseño. Queda por medir en T0 que la emulacion informe `pointer: coarse` (si no, el plan propone como emularlo).

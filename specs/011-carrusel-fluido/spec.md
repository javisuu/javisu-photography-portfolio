# Spec 011 · Carrusel fluido

- **Estado:** Implementada (2026-10-23, en produccion desde `f662c7d`). Enmienda 2, el espejo: arreglada, pendiente del run tras el push
- **Fecha:** 2026-10-22 · revisada 2026-10-22 con las respuestas de Javi
- **Requiere decision de Javi:** No por zona: no toca el wordmark, el blend, el ciclo de vida de `GLSurface` ni el scroll infinito del landing. El carrusel tiene su propio bucle (`docs/design-spec-v2.md` §2) y no usa `GLSurface` (`CLAUDE.md`, "Architecture rules"). Si cambia dos puntos del diseno de §2, ya decididos por Javi: ver "Decisiones" y "Choca con el spec"

## Problema

Javi describe tres cosas del carrusel de `/albums` (conversacion del 2026-10-22). La referencia es el carrusel de `https://cynx.io/`.

1. **No es fluido** con el trackpad, y tampoco al llegar a la pagina.
2. **A veces cambian mas de dos diapositivas a la vez**, y eso estropea el efecto de abrir y plegar. En cynx.io solo cambian la que se abre y la que se cierra.
3. **Al cambiar de sentido de golpe hay un pequeno salto** "nada atractivo".

Todo se ha medido contra produccion (`https://javisu-photography-portfolio.vercel.app`, 1440x900, dpr 1, Chromium de Playwright), con dos scripts de solo lectura del scratchpad de la sesion:
- `medir-carrusel-album.mjs`, de fluidez: salidas `evidencia/2026-10-22_011-carrusel-cpu1.txt` y `evidencia/2026-10-22_011-carrusel-cpu4.txt`;
- `medir-pliegue.mjs`, de geometria por frame con identidad estable de cada diapositiva: salida `evidencia/2026-10-22_011-pliegue-linea-base.txt`.

### 1. Fluidez

| Escenario | CPU x1 | CPU x4 (portatil medio, emulado) |
|---|---|---|
| Llegada (load → +2,5 s) | p95 16,8 ms · max 233 ms · long tasks 309 ms | p95 66,6 ms · max 233 ms · 7 frames >50 ms · long tasks 3630 ms (max 1861 ms) |
| Rueda tipo trackpad (60 x 12 px) + 1,5 s | p95 33,3 ms · 20 de 381 frames >25 ms | p50 33,3 ms · p95 133 ms · 152 de 237 frames >25 ms · max 2817 ms |
| Rueda tipo raton (8 x 100 px) + 1,5 s | p95 50 ms · 17 de 162 frames >25 ms | p50 50 ms · p95 167 ms · 53 de 73 frames >25 ms |
| Recalculo de estilo por frame, rueda | 0,86–1,22 ms | 9,4–14,6 ms |

- **El coste es constante, no del cambio de album.** Solo 4 de 20 frames lentos (trackpad) y 6 de 17 (raton) caen en los 120 ms siguientes a un cambio de album, a CPU x1.
- **Cada frame escribe en el DOM de todas las diapositivas visibles**, cambien o no: `width` y `transform` del marco, y `left`, `right` y `transform` de la imagen (`src/motion/AlbumsCarousel.tsx:517-543`). `width` es una propiedad de layout, asi que hay un layout por frame, y el recalculo de estilo domina el coste medido.
- **Las diapositivas lejanas llevan `filter: blur()`** de 6 a 18 px, con transicion de 300 ms (`src/motion/AlbumsCarousel.tsx:23,27,694-695`). Que parte del coste es de pintado del blur: SIN VERIFICAR. Las metricas de CDP usadas no separan paint ni raster.
- **Llegada:** solo la portada inicial lleva `priority` (`src/motion/AlbumsCarousel.tsx:700`); el resto carga en perezoso. Su relacion con el frame de 233 ms: SIN VERIFICAR.
- **La fisica va por frame, no por tiempo:** `FRICTION` y la velocidad se aplican por frame (`src/motion/AlbumsCarousel.tsx:46,389-401`). Un frame que llega tarde avanza lo mismo que uno a tiempo, asi que cada tiron es tambien un frenazo. En una pantalla de 120 Hz el carrusel iria a otra velocidad. No medido.

### 2. Mas de dos diapositivas cambiando a la vez

Una diapositiva esta "a medio plegar" si su ancho no es ni 110 px (plegada) ni el ancho natural de su portada (abierta), con 0,5 px de margen.

| Escenario | Frames | Con 3 o mas a medio plegar |
|---|---|---|
| Fling fuerte de trackpad (60 x 50 px) | 350 | **234 (67 %)**: 3 en 156 frames, 4 en 78 |
| Rafaga hacia delante (40 x 30 px) | 253 | **81 (32 %)**, todas con 3 |
| Hacia delante y giro (20 x 15, luego 20 x -15 px) | 238 | 0 |
| Un paso, pausa y paso atras (raton) | 111 | 0 |

Es el comportamiento disenado: cada commit redirige la apertura de inmediato, aunque la anterior no haya acabado. El comentario lo llama "attempted unfold, overtaken by the next" (`src/motion/AlbumsCarousel.tsx:451-461`). Ademas, la apertura es una exponencial con `OPENNESS_TAU_MS` = 150 ms (`:69`): tarda unos 1050 ms en quedar a 0,5 px de su destino. Cualquier commit en ese tiempo deja tres diapositivas en movimiento.

### 3. El salto

La posicion es continua, pero la velocidad no. En el frame del commit, el borde que se pliega empieza a su velocidad maxima y luego frena (exponencial, `src/motion/AlbumsCarousel.tsx:466-470`):

- Rafaga hacia delante: el borde derecho pasa de moverse ~4 px por frame a **63 px** en un frame (`841,6 → 778,6`), y luego 56, 51, 45...
- Hacia delante y giro: lo mismo, **61 px** en el primer frame (`840,2 → 779,4`).
- Fling fuerte: **59,5 px** por encima de la mediana de sus frames vecinos.

El resto del carrusel se mueve a 0,2–1 px por frame (mediana). Al girar el sentido se dispara un commit en direccion contraria (`src/motion/AlbumsCarousel.tsx:426-439`): el pliegue arranca de golpe hacia el otro lado, y eso es lo que mas se nota. El ajuste de `restOffsetPx` al girar (`:428-436`) mantiene la posicion continua. Si deja ademas un cambio de velocidad propio: SIN VERIFICAR, la medida no lo separa del arranque del pliegue.

### La referencia: cynx.io

Filmado con capturas cada ~1 s (scratchpad: `cynx/`, script `cynx-film.mjs`), demasiado espaciadas para ver el pliegue a medio camino:

- Todas las portadas tienen el mismo tamano: abierta 680x495 px, plegada 105 px, hueco 24 px (`cynx/cynx-00-reposo.jpg`).
- Las plegadas no ensenan la foto desenfocada: son paneles casi negros con una textura oscura.
- Cada gesto de rueda avanzo exactamente un proyecto: 1 → 2 → 3 (`cynx/cynx-03-adelante.jpg`, `cynx/cynx-15-atras.jpg`).
- Lo pinta todo un `<canvas>` WebGL a pantalla completa: no hay DOM que medir.

## Decisiones (Javi, 2026-10-22)

| # | Pregunta | Decision |
|---|---|---|
| 1 | Que debe hacer el pliegue | Como cynx.io. Nunca mas de dos diapositivas cambiando (la que se abre y la que se cierra), y sin salto al cambiar de sentido. Las fotos de cynx son todas horizontales; Javi cambiaria sus portadas solo si no hay otra forma |
| 2 | Reduced motion | Se mantiene el pliegue |
| 3 | Profundidad de las plegadas | Portada **pre-desenfocada** o **panel negro** encima (opaco o al 90 %), en lugar del `filter: blur()` animado. Se prueban las dos y Javi elige |
| 4 | Dispositivo | Trackpad. Frecuencia de pantalla desconocida |
| 5 | Umbrales de CA2 y CA3 | Bien como estan |
| 6 | Fling largo | Como cynx.io: un album de cada vez, encadenados. Nunca se abre una tercera diapositiva mientras la pareja anterior se mueve |
| 7 | Tamano de las portadas abiertas | Cada una sigue abriendo a su ancho natural. El plan cumple los CA sin igualarlas; si no se puede, se para y se pregunta |
| 8 | Textura de las plegadas | (b): grano de pelicula sobre negro. Opaco o al 90 %: se preparan los dos y Javi elige en CA11 |

## Objetivo

- El carrusel va a 60 fps con trackpad, rueda y teclado, tambien a CPU x4, y la llegada a `/albums` no congela ningun frame.
- Nunca hay mas de dos diapositivas cambiando de ancho a la vez.
- El pliegue arranca y acaba sin cambios bruscos de velocidad, tambien al cambiar de sentido.
- Del modelo de §2 se mantiene el commit por posicion, el anclaje por direccion y las lineas de reposo fijas.

## Fuera de alcance

- La transicion carrusel→album (Motion inventory #4, GSAP Flip). Va en otra spec.
- Cambiar las portadas de los albumes. Javi lo haria solo si no hay otra forma (decision 1). Si el plan concluye que hace falta, se para y se pregunta.
- Retocar a mano `WHEEL_SENSITIVITY`, `FRICTION` y `KEY_KICK_PX`. Pasarlas a tiempo con el mismo resultado a 60 Hz si entra.
- El landing, la pagina de album, el atlas y `GLSurface`.
- Movil y tactil (F4).

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [x] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion

Y un script de medida nuevo en `scripts/` (ver CA1). Si se elige la portada pre-desenfocada, tambien `scripts/prepare-images.mjs` y `public/photos/`: la version desenfocada de cada portada se genera con el resto de fotos, con la misma autoria en los metadatos. La ruta nueva tiene que quedar dentro del `--path` del espejo (`.github/workflows/mirror.yml`; `CLAUDE.md`, "Repo, licence and the public mirror").

## Choca con el spec

- **"Transform/opacity-only animation"** (`docs/design-spec-v2.md:111`; `CLAUDE.md`, "Hard rules"). Hoy el carrusel la incumple: anima `width` (`src/motion/AlbumsCarousel.tsx:520`) y `left`/`right` (`:539-540`). Esta spec la cumple: el pliegue pasa a `transform` y/o recorte, sin layout, y el aspecto no cambia.
- **§2, "Depth cues": "blur and a dark veil scale by distance".** Cambia por la decision 3: blur prerenderizado o panel negro, sin `filter` animado. Al implementar se actualiza §2.
- **§2: "at speed, commits chain faster than 450ms apart, so nothing ever finishes opening"** (`src/motion/AlbumsCarousel.tsx:456-461`). Cambia por la decision 1: un commit nuevo no puede poner en marcha una tercera diapositiva. Hay que limitar o encadenar los commits, o adelantar el cierre de la pareja anterior antes de abrir la siguiente. El mecanismo es del plan; la consecuencia (un fling largo avanza menos albumes por segundo que hoy) se mide en CA9 y se ensena a Javi.
- **`prefers-reduced-motion`.** `CLAUDE.md` pide que todo efecto lo respete. Javi decide mantener el pliegue tambien con reduced motion (decision 2). Se documenta como excepcion deliberada en §2. La senal de hover sigue respetandolo, como hoy (`src/motion/AlbumsCarousel.tsx:736`).

## Criterios de aceptacion

Las cifras se miden con un script nuevo del repo, `scripts/medir-carrusel.mjs`. Junta los dos del scratchpad (`medir-carrusel-album.mjs` para la fluidez, `medir-pliegue.mjs` para la geometria), con los mismos escenarios: 1440x900, dpr 1, `--cpu` como tasa de throttling de CDP y `--url` como en el diagnostico. Cada CA de fluidez es la mediana de 3 repeticiones, primero contra `next build` + `next start` en local y despues contra produccion tras el push.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/medir-carrusel.mjs --cpu 1 --url <produccion>` antes del cambio | Reproduce la linea base: trackpad p95 ≥ 33 ms, fling fuerte con 3 o mas a medio plegar en ≥ 50 % de los frames, primer frame del pliegue ≥ 50 px. Confirma que el script del repo mide lo mismo que los del scratchpad |
| CA2 | `node scripts/medir-carrusel.mjs --cpu 1` | Trackpad y raton: 0 frames >50 ms y como mucho el 2 % >25 ms. Llegada: frame max ≤ 50 ms |
| CA3 | `node scripts/medir-carrusel.mjs --cpu 4` | Trackpad y raton: p50 ≤ 17 ms y p95 ≤ 33,4 ms. Recalculo de estilo ≤ 2 ms por frame. Llegada: ninguna long task >200 ms |
| CA4 | `node scripts/medir-carrusel.mjs`, recuento de escrituras | 0 escrituras por frame a `style.width`, `style.left` y `style.right` en los marcos y las imagenes del carrusel, y 0 `filter` animados |
| CA5 | `node scripts/medir-carrusel.mjs`, los 4 escenarios de geometria | En ningun frame hay mas de 2 diapositivas a medio plegar |
| CA6 | `node scripts/medir-carrusel.mjs`, salto | En los 4 escenarios, ningun borde se mueve en un frame mas de 8 px por encima de la mediana de sus 6 frames vecinos. Hoy: 58–63 px |
| CA7 | Geometria en reposo tras `ArrowRight`, `ArrowRight` y `ArrowLeft`, frente a la de antes del cambio (metodo de la spec 004: `specs/004-lint-carrusel-deps/tasks.md:7`) | Cada marco visible en reposo ocupa la misma caja, ±1 px, y cada imagen ensena el mismo recorte. La profundidad cambia a proposito (decision 3) y no entra en la comparacion |
| CA8 | Lo mismo que CA7, con rAF limitado a 30 fps y acelerado a 120 fps | Tras un mismo gesto, la posicion de reposo es la misma, ±1 px, a 30, 60 y 120 fps |
| CA9 | `node scripts/medir-carrusel.mjs`, fling fuerte | Albumes avanzados por el fling y tiempo hasta el reposo, antes y despues. No hay umbral: la cifra va a Javi para la revision de CA11 |
| CA10 | `node scripts/diagnostico.mjs` | tsc, lint y build ok · 0 errores de consola · 105 de 105 invariantes, o las que haya en `main` en ese momento |
| CA11 | Revision de Javi en `npm run dev` y en produccion, con su trackpad | Javi da por bueno el pliegue frente a cynx.io, elige entre portada pre-desenfocada y panel negro (decision 3), y lo da por fluido. Es testimonio, como el CA11 de la spec 010 |

## Preguntas abiertas

1. **Cerrada (decision 8): Javi eligio (b).** Para el registro, las opciones que se le propusieron el 2026-10-22, todas en escala de grises, en codigo y estaticas (sin `filter` animado):
   - (a) negro liso al 90 %, con la portada apenas visible debajo;
   - (b) grano de pelicula sobre negro: una textura de ruido generada una vez y repetida;
   - (c) lomo de libro: el titulo del album en vertical, EB Garamond en mayusculas pequenas con tracking, sobre negro;
   - (d) curvas de nivel del lugar del album, que enlazan con el atlas. Es la mas cara de hacer.
   Se combinan: por ejemplo, (c) sobre (b). Ninguna desatura la foto: el design spec lo prohibe ("never desaturation of the work", `docs/design-spec-v2.md:93`).

## Enmienda 1 (2026-10-22): scroll libre y estela por velocidad

- **Estado:** aprobada por Javi el 2026-10-22

### Que vio Javi en la revision de CA11

- **El panel al 90 %**, mejor que opaco. Hecho en `9a8ef13`.
- **"Un album de cada vez" limita la velocidad.** Con `?cola=libre` (`7211405`, solo `next dev`), sin la espera a la pareja anterior, "feels better". Medido en su `next dev` con el fling fuerte (`2026-10-22_011-cola-libre-dev.txt`, scratchpad): **7 albumes y como mucho 2 a medio plegar** con cola, **10 albumes y hasta 4** sin ella.
- **En cynx.io tambien cambian varias a la vez, y queda natural.** La premisa de la decision 1 ("solo cambian la que se abre y la que se cierra") salio de capturas cada ~1 s con WebGL por software en headless, demasiado lentas para verlo. Las tres capturas de Javi, de las 23:07 en su pantalla, si lo ensenan. Anchos en px de pantalla; la plegada de cynx mide 141:
  - **Scroll rapido, captura 1:** a la izquierda de la que se abre, 216 → 270 → 367 → 378, cada vez mas anchas hacia ella. A la derecha: 141, 141, 141.
  - **Scroll rapido, captura 2:** a la izquierda 165 → 210 y la que se abre a 776. A la derecha: 141, 141, 141.
  - **En reposo, captura 3:** todas las plegadas a 141 y la abierta a 909.
- **La explicacion de Javi:** cynx no toca las plegadas del lado hacia el que avanza, y eso ya lo tenemos (el lado anclado). Lo que no tenemos es que las del otro lado, las que acaban de pasar, cambien de ancho segun la velocidad. Nuestra version las cierra del todo enseguida. "Cuando una foto se abre, no significa que las demas tengan que estar plegadas al 100 %": tienen que hacer sitio a la que se abre, no cerrarse de golpe. Ese cierre brusco es el salto que queda en CA6 (fling 13 px, rafaga 26,5 px; `tasks.md`, T10).

### Decisiones nuevas

| # | Pregunta | Decision |
|---|---|---|
| 9 | Fling largo (sustituye a la 6) | Scroll libre, como cynx: los commits no esperan a la pareja anterior |
| 10 | Que puede cambiar de ancho (matiza la 1) | La que se abre y una **estela** del lado ya recorrido: las ultimas en pasar quedan entreabiertas segun la velocidad, mas cuanto mas rapido y mas cuanto mas cerca de la abierta. Con la tira quieta vuelven todas a la plegada. Las del lado hacia el que se avanza no cambian nunca |

### Criterios que cambian

| # | Comando | Resultado esperado |
|---|---|---|
| CA5 (sustituye) | `node scripts/medir-carrusel.mjs`, fling fuerte y rafaga (solo hacia delante) | Ninguna diapositiva a mas de una posicion por delante de la abierta (la que se abre si puede) cambia de ancho: 110 ± 0,5 px en todos los frames |
| CA6 | Igual | Se mantiene: ningun borde mas de 8 px por encima de la mediana de sus 6 vecinos, en los 4 escenarios |
| CA7, CA8 | Igual | Se mantienen: en reposo no hay estela, y el reposo es el de la linea base |
| CA9 | Igual | Albumes y tiempo hasta el reposo con la estela, para Javi |
| CA12 (nuevo) | `node scripts/medir-carrusel.mjs`, fling fuerte | En los frames con la tira en marcha, la estela decrece con la distancia a la abierta (cada una igual o mas estrecha que la anterior) |
| CA11 | Revision de Javi | Javi da por bueno el scroll libre con estela frente a cynx.io |

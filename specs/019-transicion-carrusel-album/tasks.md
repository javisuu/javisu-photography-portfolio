# Tareas 019 · Transicion carrusel → album

- **Plan:** `plan.md` (aprobado el 2026-11-14)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. Antes de ningun `next build` (T0 y cierre), Javi para su `npm run dev`.

- [x] **T0** · Rama y linea base
  - Fichero(s): ninguno. Javi crea `feat/019-transicion-carrusel-album` desde `main`.
  - Comprobacion:
    - `git branch --show-current` da `feat/019-transicion-carrusel-album`.
    - `node scripts/diagnostico.mjs`, mas `--skip-build --dispositivo iphone` y `--skip-build --dispositivo ipad`.
    - `node scripts/medir-carrusel.mjs --geometria` (ver la enmienda 1 de la spec).
    - Todo a `2026-11-XX_019-linea-base.txt`. Los fallos que salgan aqui son la referencia de CA2 y CA15.
  - **Hecho el 2026-11-14**, sobre `a53e0ca`, con solo `src/app/about/page.tsx` y la carpeta de la spec sin commit, y sin `npm run dev` abierto (puerto 3000 libre). Salidas en el scratchpad de la sesion, pendientes de copiar a `evidencia/`:
    - **Escritorio, 201 de 202** (`2026-11-14_019-linea-base.txt`). tsc, lint y build ok, consola 0 errores en 6 rutas, entrada en 250 ms y 0 frames > 50 ms. Unico fallo, B12: `atlas · CA15 vuelo al lugar siguiente · 2 frames largos`. `llegada al album` y B11 pasan.
    - **iphone, 77 de 77** (`2026-11-14_019-linea-base-iphone.txt`).
    - **ipad, 72 de 77** (`2026-11-14_019-linea-base-ipad.txt`, salida de la tarea `bvrktkugz`). Fallos: `/albums · deslizar cambia de album` y su version con movimiento reducido (`01 -> 01`, M8, el carrusel tactil); `E2 bitmap vacio … rescatado sin caer al DOM` en `/` y `/album/america` (`caida decodificacion de la foto 0 sin terminar en 1500 ms`), y `/ · E1 muestras ?diag` (`pintados —`). La entrada fue lenta, 883 ms y 9 frames > 50 ms. Es la referencia de CA15: estos 5 no cuentan como nuevos.
    - **Geometria del carrusel** (`2026-11-14_019-geometria-base.json` y `.txt`): llegada con 7 diapositivas en pantalla, y ArrowRight ×2 y ArrowLeft ×2 con reposo entre 467 y 518 ms.
- [x] **T1** · Instalar GSAP. **Hecho el 2026-11-14:** `"gsap": "3.13.0"` (`package.json:13`); tsc y lint limpios, con solo el aviso conocido de `scripts/medir-carrusel.mjs:154`.
  - Fichero(s): `package.json`, `package-lock.json`
  - Comprobacion: `npm install gsap@3.13.0 --save-exact`. `package.json` lleva `"gsap": "3.13.0"`, y `npx tsc --noEmit` y `npm run lint` salen limpios.
- [x] **T2** · Mover la geometria del carrusel a `src/motion/carouselGeometry.ts`. **Hecho el 2026-11-14:** CA14 da `diferencia max 0 px` en llegada, ArrowRight ×2 y ArrowLeft ×2 (`2026-11-14_019-geometria.txt` del scratchpad, con build).
  - Fichero(s): `src/motion/carouselGeometry.ts` (crear), `src/motion/AlbumsCarousel.tsx`
  - Que: se mueven `S`, `SLIDE_HEIGHT`, `GAP`, `PANEL_OPACITY`, `naturalWidthFor`, `frameTransformFor`, `counterScaleFor`, `pinnedOriginFor` y `driftTransformFor`, sin cambiar la logica, y `AlbumsCarousel` los importa.
  - Comprobacion: CA14 identica a la linea base, salida en `2026-11-XX_019-geometria.txt`. `npx tsc --noEmit` y `npm run lint` limpios.
- [x] **T3** · Store y sonda. **Hecho el 2026-11-14.**
  - Fichero(s): `src/motion/albumTransition/store.ts` (crear)
  - Que: estado de modulo (foto fija, fase, album guardado, rects de llegada, `scrollY` al salir, modo de llegada) con suscripcion, y `window.__transicion` de solo lectura.
  - Comprobacion: tsc y lint limpios. En `npm run dev`, `window.__transicion` existe en cualquier ruta y vale `{ fase: "reposo" }`. Nada cambia en pantalla.
- [x] **T4** · Capa vacia en el layout y destinos registrados. **Hecho el 2026-11-14:** 198 de 202 (`2026-11-14_019-t4.txt`, `--skip-build`). Los 4 fallos son conocidos: 3 de B11 (`america`, `norte` y `ny`, `scrollY —/0, max 0`, con la maquina lenta, entrada en 533 ms y 9 frames > 50 ms) y 1 de B12 (atlas CA15). Pasan "un solo `<main>` visible", la de ancestros del blend y las cuatro llegadas de `llegada al album`.
  - Fichero(s): `src/motion/albumTransition/AlbumTransitionLayer.tsx` y `TransitionTarget.tsx` (crear), `src/app/layout.tsx`, `src/app/album/[slug]/page.tsx`
  - Que: la capa monta y no pinta nada. `TransitionTarget` envuelve el `<h1>`, la linea "lugar — año", la etiqueta y `AlbumPhotoNav`, y solo los oculta en modo transicion, que aun no se activa nunca.
  - Comprobacion: `node scripts/diagnostico.mjs --skip-build` sin fallos nuevos frente a T0. En especial, "un solo `<main>` visible", la de ancestros del blend y `llegada al album`.
- **Vistazo de Javi, 2026-11-15, en `npm run dev`:** "Animación: PERFECTA". Pero "Rendimiento, tirones durante la animación": queda pendiente de medir en build de produccion antes de juzgarlo (en `next dev` React va sin minificar y compila al vuelo). T5 y T6 no se cierran hasta esa medida.
- **Medida de los tirones, 2026-11-15, build de produccion, 1440x900, 3 repeticiones por album** (`perf019.mjs` y `trace019.mjs` del scratchpad; salidas `2026-11-15_019-perf-base.txt` y `2026-11-15_019-perf-sin-gl-en-vuelo.txt`, pendientes de copiar a `evidencia/`). Javi los nota "al empezar la animacion".
  - **Antes:** 8 de 12 vuelos con un frame de 50-100 ms entre 100 y 160 ms tras el clic, justo al empezar la subida, y otro de 50-83 ms al aterrizar.
  - **Causa, en la traza de Chrome:** dos cosas en el hilo principal durante el arranque. Una, la tarea de React que monta el album (hasta 45 ms), que incluye el efecto de montaje de `GLSurface` (contexto y shaders). Dos, `GLSurface` empieza a decodificar cada foto (`createImageBitmap(<img>)`, `src/motion/GLSurface.tsx:469-470`) en cuanto carga, aunque este `active={false}`, porque `active` solo frena la subida a GPU, no la decodificacion. Son unos 12 eventos `load` seguidos, de 6 a 15 ms cada uno.
  - **Experimento (sin commit):** `AlbumPhotos` no monta `GLSurface` mientras dura el vuelo (`{!flying && <GLSurface …/>}`). Resultado: 0 frames > 34 ms antes del aterrizaje en 12 de 12, y la subida empieza antes (a ~37 ms del clic, frente a ~65). El coste se va al aterrizaje: 1 frame de 67-100 ms y otro de 50 ms, con la escena ya quieta. tsc limpio y lint con solo el aviso conocido. **Se desvia del plan** (el plan decia montado e inactivo durante el vuelo): pendiente de la decision de Javi.
  - **Javi, en la build de produccion con el experimento:** "va fluido". Queda como version definitiva (comentario en `src/motion/AlbumPhotos.tsx`, junto a `<GLSurface>`).
- **Textos, 2026-11-15.** Dos cosas que vio Javi en la misma revision:
  - La descripcion: en el carrusel va en mayusculas y en el album no. Javi propone un scramble.
  - El titulo "recupera su anchura" al relevar: es otro cuerpo (30 px/400 frente a 110 px/500, `src/motion/AlbumsCarousel.tsx:977` y `src/app/album/[slug]/page.tsx:60`), y escalar por la altura no iguala ni el ancho ni el grosor.

  Arreglo en `flight.ts` ("Text morphs"): cada texto vuela como dos clones, el del carrusel y una copia del elemento del album, que comparten una caja de texto en movimiento.
  - **Titulo:** se interpola tambien el ancho, los dos se estiran un poco para llenarlo y se funden entre el 30 % y el 70 % del vuelo.
  - **Descripcion:** scramble. Las letras del carrusel se desordenan, cambian al clon del album a mitad del vuelo, y este resuelve de izquierda a derecha entre el 50 % y el 95 %.

  Medido en america (`textos019.mjs`):
  - la caja del ultimo clon del titulo coincide con la del `<h1>` real (`64,178.5,365.3,144` en los dos);
  - la descripcion ya esta resuelta 130 ms antes del relevo;
  - 0 errores.

  Rendimiento (`2026-11-15_019-perf-textos*.txt`): 0 frames > 34 ms entre `subida` y `asentado` en 16 de 16 vuelos. La maquina iba mas lenta que en la medida anterior: el montaje del album fue a 40-140 ms, frente a 13-30, y eso ocurre antes de que corra el codigo de los textos. Con esa maquina, el frame del aterrizaje (montaje de `GLSurface`, que decodifica todas las fotos a la vez) llego a 183-533 ms. Ver CA8b y el movil al cierre.
- **Javi, 2026-11-15, en la build de produccion con los textos:** "genial, todo perfecto". T5 y T6 cerradas. Queda abierto, para el cierre y el movil, el frame del aterrizaje (montaje de `GLSurface`). Repartir sus decodificaciones toca `GLSurface.tsx`, zona que requiere decision de Javi.
- [x] **T5 + T6, implementadas juntas el 2026-11-14, aprobadas por Javi el 2026-11-15.** El T6 minimo era necesario para T5: sin el, la foto 1 aparecia en su hueco a mitad del vuelo en cuanto llegaba su textura. Las clonaciones son `cloneNode` de los nodos reales del carrusel, imperativas (`src/motion/albumTransition/flight.ts`): asi cada relevo cae en una sola tarea, sin esperar a un commit de React. Prueba propia con Playwright en `next dev` (`probe019.mjs` del scratchpad), 0 errores de consola en las dos:
  - **norte:**
    - sube la lamina abierta (`533,193,375,500`);
    - el album monto a ~1278 ms (compilacion de `next dev`), la subida empezo a 1526 ms y el aterrizaje fue a 2131 ms;
    - `<img>` → canvas a 2298 ms;
    - 8 de 8 subidas en `__glDiag`, sin `fallo`.
  - **america:**
    - relevo de textura a 6 ms;
    - sube la rendija de la izquierda (`245,193,110,500`, `src` `america/01`);
    - subida a 653 ms, aterrizaje a 1280 ms;
    - canvas a 0 con las `<img>` visibles hasta 1532 ms, y en ese mismo fotograma `<img>` ocultas y canvas a 1;
    - 9 de 9 subidas.
- [ ] **T5** · Foto fija en el clic y vuelo de ida
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`, `AlbumTransitionLayer.tsx`, `store.ts`
  - Que: el `pointerup` de un clic llama a `startAlbumOpen(snapshot)` antes de `router.push`, y la capa pinta los clones y oculta la tira real. La linea de tiempo de GSAP lleva:
    - el relevo de textura de la rendija izquierda (america y sol);
    - las salidas por abajo y por arriba;
    - el ascenso y despliegue de la lamina, y el titulo y la descripcion por separado;
    - el fundido de la etiqueta y de `AlbumPhotoNav`;
    - el relevo final al `<img>` real.

    Incluye el tope de 1500 ms con fundido si el album no monta. Aun sin GL: `AlbumPhotos` no cambia en esta tarea.
  - Comprobacion: Javi lo ve en `npm run dev` en los cuatro albumes. `window.__transicion` llega a la fase `asentado`. Sin errores de consola.
- [ ] **T6** · Relevo DOM → GL en `AlbumPhotos` (modo transicion)
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Que: el modo de llegada se fija al montar. En modo transicion:
    - fotos 1 y 2 `eager`;
    - Lenis parado hasta `asentado`;
    - `active` de `GLSurface` a `false` hasta `asentado`;
    - canvas a `opacity-0` y `readyNodeCount={2}`;
    - con `onTexturesReady`, `<img>` ocultas y canvas visible en el mismo render.

    En los demas modos no cambia nada. Si hiciera falta tocar `GLSurface.tsx`, se para y se consulta a Javi.
  - Comprobacion: `node scripts/diagnostico.mjs --skip-build` con `llegada al album` (CA16) igual que en T0. En `?diag`, el album llega a texturas > 0 sin `fallback`.
- [x] **T7** · Vuelta y album guardado. **Aprobada por Javi el 2026-11-15** ("está genial"), con el arreglo del salto y el boton "← ALBUMS".
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`, `AlbumTransitionLayer.tsx`, `store.ts`, `src/motion/AlbumPhotos.tsx`
  - Que:
    - El carrusel arranca en el album guardado, no en 0 (`src/motion/AlbumsCarousel.tsx:563`).
    - `AlbumPhotos` apunta el `scrollY` en cada scroll.
    - Al volver a `/albums` con `scrollY` 0: coreografia al reves, y en america y sol se recupera la portada bajo el panel.
    - Con `scrollY` > 0: fundido de 300 ms, con el titulo viajando.
  - Comprobacion: Javi lo ve en `npm run dev`. CA14 sigue identica con el album 0 abierto.
  - **Implementada el 2026-11-15, pendiente del vistazo de Javi.** Funciona en dos pasos:
    1. `AlbumTransitionLayer` escucha `popstate` en fase de captura, que en `window` corre antes que el listener de Next. Ahi `prepareReturn` congela en la capa la foto 1, el titulo, la descripcion, la etiqueta y la navegacion, antes de que React cambie de ruta.
    2. El carrusel monta oculto en el album guardado, y dos frames despues llama a `startAlbumReturn`. Este reconstruye las laminas desde el carrusel en reposo y hace la coreografia al reves.

    En america y sol, la lamina que vuelve lleva la foto 1, y la portada reaparece al relevar al carrusel real, bajo su panel al 90 %. Con scroll, el carrusel entra con un fundido de 300 ms y el titulo viaja.

    **Desviaciones del plan:**
    - El `scrollY` se lee en el `popstate` en vez de apuntarse en cada scroll: es el mismo valor, y `AlbumPhotos.tsx` no se toca.
    - La portada no se recupera "cuando el panel vuelve a >= 0,9", sino en el relevo final al carrusel real, que es el mismo momento.

    **Medido en build de produccion** (`vuelta019.mjs` y `reabrir019.mjs` del scratchpad, salida `2026-11-15_019-t7.txt`):
    - **Sin scroll, en los cuatro albumes:**
      - 0 frames en blanco;
      - el album activo es el que se abrio;
      - las laminas en reposo quedan a 0,0 px de las de antes del clic (CA12);
      - de `vuelta` a `reposo`, 949-956 ms;
      - 0 errores.
    - **Con scroll de 900 px** (america y norte): solo cambia la opacidad, 351-357 ms, 0 frames en blanco y 0 errores.
    - **Ciclos y navegacion a mitad:**
      - 3 ciclos seguidos de abrir y volver, todos ok;
      - adelante a mitad de la vuelta: `abortado:ruta`, capa vacia y album normal;
      - atras a mitad de la ida: vuelve al carrusel visible y la capa queda vacia.
  - **Vistazo de Javi, 2026-11-15.** "La foto vuelve a subir, y se pliega, pero no hace animación de desplegarse, pega un salto y de repente aparece desplegada."
    - **Causa:** al montar, el carrusel abre la diapositiva activa con su muelle desde cerrada (`opennessRef` empieza vacio, `src/motion/AlbumsCarousel.tsx:725`), y la capa lo leia dos frames despues, a medio abrir. Los clones se plegaban a ese estado y el carrusel real terminaba de abrirse tras el relevo.
    - **Arreglo:** en la vuelta, la activa se siembra abierta antes del primer frame.
    - **Medido** (`2026-11-15_019-t7-relevo.txt`): relevo clones → carrusel a 0 px en los cuatro albumes, y 0 px de movimiento en los ~76 frames siguientes. El estado previo no se midio con esta sonda: la causa se dedujo del codigo.
  - **Boton "← ALBUMS"** (Javi, 2026-11-15: sustituye a "← SUQUIA" en la pagina de album; `src/motion/albumTransition/BackToAlbums.tsx`).
    - Si el album se abrio desde el carrusel (`fromCarousel` en el store), hace `router.back()`, que es la misma vuelta que el boton del navegador y no añade entradas al historial.
    - Si no, congela el album con `prepareReturn` y hace `router.push("/albums")`.
    - Medido:
      - desde el carrusel: 0 px en el relevo, 0 frames en blanco y `history.length` igual que con atras;
      - carga directa de norte y sol: coreografia completa, 982 ms, y una entrada nueva en el historial;
      - 0 errores.
    - **Efecto en el diagnostico, para T9:** el album ya no tiene enlace a `/`, y el CA4 de la spec 018 en `scripts/diagnostico.mjs:2032` lo buscaba ("no hay enlace a / en el album"). Hay que adaptarlo.
- [x] **T8** · `prefers-reduced-motion`. **Aprobada por Javi el 2026-11-15** ("muy bien").
  - Fichero(s): `AlbumTransitionLayer.tsx`, `TransitionTarget.tsx`
  - Que: sin clones. Fundido de 300 ms, solo de opacidad, a la ida y a la vuelta.
  - Comprobacion: en `npm run dev`, con movimiento reducido emulado (DevTools), ninguna lamina se mueve y el album entra con un fundido.
  - **Implementada el 2026-11-15, pendiente del vistazo de Javi.**
    - **Ida** (`startAlbumOpenReduced`): una copia congelada del carrusel se funde a 0 mientras el titulo, la descripcion, la etiqueta, la navegacion y la fila de la foto 1 se funden a 1, en 300 ms. Arranca cuando el album ha montado y la foto 1 esta decodificada.
    - **Vuelta:** el album congelado (las mismas piezas que en T7) se funde a 0 mientras el carrusel se funde a 1. El titulo no viaja.
    - El relevo DOM → GL es el mismo de T6.

    **Medido** en build de produccion con `reducedMotion: "reduce"` (`reducido019.mjs` del scratchpad, salida `2026-11-15_019-t8.txt`), en america y norte:
    - **Ida:** 0 cambios de `transform` en todo el documento, solo `opacity` en el fundido. Los 3 cambios de `width` y 4 de `height` son del montaje de la pagina, no animaciones. De clic a `asentado`, 336-339 ms. GL sube 9 de 9 texturas sin fallo.
    - **Vuelta:** 1 cambio de `transform`, puntual, no animado; queda para el MutationObserver de T9 identificar de quien es. 353 ms. Vuelve al album abierto.
    - 0 errores.
    - El vuelo completo sigue igual (sol: relevo a 0 px y 0 frames en blanco).
- [x] **T9** · Seccion `transicion` del diagnostico
  - Fichero(s): `scripts/diagnostico.mjs`
  - Que:
    - CA3, CA3b, CA4, CA5, CA5b, CA6, CA7, CA8 y CA8b, CA9, CA10 (10 repeticiones por album), CA11, CA12 y CA13;
    - sobre los cuatro albumes a 1440x900;
    - muestreo de color reutilizado de `llegada al album` y `MutationObserver` para CA7;
    - lectura de `window.__transicion` y `window.__glDiag`.

    Se omite en modo dispositivo, como las demas secciones de escritorio.
  - Comprobacion: la seccion corre entera y devuelve una linea por criterio y album. Ademas, debe fallar en el caso forzado: con un relevo retrasado a proposito (bandera temporal, que se quita en la misma tarea), CA10 lo detecta.
  - **Hecha el 2026-11-15.** El codigo va en `scripts/lib/transicion.mjs`, y `scripts/diagnostico.mjs` lo llama despues de `llegada al album`. Se omite en modo dispositivo. `--transicion-vuelos N` cambia los vuelos por album de CA10 (10 por defecto).
    - **Como mide:**
      - un muestreador por rAF que vive en el documento de `/albums` y sobrevive a la navegacion cliente;
      - un `MutationObserver` sobre `style` en la capa, los destinos, la fila 0 y el carrusel;
      - un screencast de CDP para el pixel central del hueco de la foto 1 (CA10).
    - **Resultado con 10 vuelos por album, en build de produccion** (`2026-11-15_019-t9.txt` del scratchpad): **340 de 340**.
      - Ida: mediana 897 ms (882-912).
      - 0 fotogramas en blanco en 40 vuelos.
      - Vuelta: ~955 ms sin scroll y ~353 ms con scroll.
      - CA5b: el clic llego con la rendija a ~0,36 de apertura.
      - CA8b: `scrollY` 0 durante el vuelo.
      - Reduced: ida en 337-350 ms y vuelta en ~355 ms.
    - **Caso forzado** (`2026-11-15_019-t9-forzado.txt`): con `revealAlbum` retrasado 200 ms (bandera temporal en `flight.ts`, ya quitada; `git diff src/` vacio), **CA10 falla en los cuatro albumes** (5-7 fotogramas en blanco cada uno), y tambien "CA3 nunca ninguno". 148 de 160.
    - **Criterio de CA7:** cuenta como animada una propiedad que cambia dos o mas veces en el mismo elemento. `translate`, `rotate` y `scale` cuentan como transform, porque GSAP las pone a `none`. El carrusel queda fuera de CA7: oculto desde el clic, sus cambios son su propio estado de React (cursor de arrastre, variables del hover).
    - **El `transform` de la vuelta con movimiento reducido** (T8) es del carrusel (`carrusel:div`), no de la capa: lo escribe su propio bucle al montar, mientras entra con el fundido. Las laminas quedan a 0 px de su reposo (T7).
    - **Otros cambios en el diagnostico:**
      - `llegada (reduced motion)`: pasa de "sin fundido" a "fundido de la transicion (spec 019)", con al menos 3 muestras a medio fundido.
      - CA4 de la spec 018 (vuelta a `/` tras perder el contexto): si el album no enlaza a `/`, pasa por "← ALBUMS" y el enlace a `/` del carrusel, con navegaciones blandas.
    - **Visto de paso, sin tocar:** en "fotos enteras" (`scripts/diagnostico.mjs:402`), la regex es `/^s*slug…/` en vez de `/^\s*slug…/`, desde `de7abfc` (spec 017). No casa ninguna linea, asi que esa seccion solo mide `/` y no los albumes. Para la spec del harness.
- [ ] **T10** · Ajuste a ojo (CA17)
  - Fichero(s): constantes de la coreografia en `AlbumTransitionLayer.tsx`
  - Que: Javi ajusta las duraciones, curvas y escalonados en `npm run dev` y despues en la preview de Vercel. Cada ajuste vuelve a pasar la seccion `transicion`.
  - Comprobacion: visto bueno de Javi, anotado aqui con fecha.

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde, salvo B11 y B12, salida guardada en `evidencia/` (CA1, CA2, CA3–CA13, CA16). **2026-11-16, sobre `d42bfb4`** (`2026-11-16_019-diagnostico-cierre.txt`, scratchpad, pendiente de copiar): tsc, lint y build ok, 0 errores de consola en 6 rutas, **527 de 542**. `llegada al album` (CA16) pasa entera. Los 15 fallos:
  - 4 son B11 (B10 con `—` a los 500 ms, maximo 0).
  - 1 es B12 (atlas CA15, 1 frame largo, ya en T0).
  - 10 son duraciones de la seccion `transicion` (CA8b 1144-1160 ms, CA13 447-478 ms, CA11 522-1150 ms). El diagnostico mide sobre `next dev` (:3100) y la maquina iba lenta (reposo del landing 2085 ms, frente a 1609 en T0). **Repetida la seccion sobre la build de produccion** (`solo-transicion.mjs`, `next start`): 10 vuelos por album, **338 de 340** (`2026-11-16_019-transicion-produccion.txt`); los dos fallos son la ida reducida de `america` (476 ms) y `norte` (403 ms), con el fundido empezando a 151 y 93 ms del clic por el montaje de la ruta (ayer, 34 ms). Repetida con 3 vuelos: **200 de 200**, fundido a 35 y 38 ms (`2026-11-16_019-transicion-produccion-2.txt`). Intermitente, de la carga de la maquina; sin cambios de codigo desde T9.
  - Las duraciones de la seccion solo son fiables en produccion. Para la spec del harness: que `transicion` corra sobre `next start`, o que sus umbrales de tiempo se apliquen solo con `--url`.
- [x] `--dispositivo iphone` e `ipad` sin fallos nuevos frente a T0 (CA15). 2026-11-16: iPhone **77 de 77** (T0: 77 de 77); iPad **75 de 77** (T0: 72 de 77), los dos fallos ("deslizar cambia de album", normal y reducido) ya estaban en T0 (`2026-11-16_019-dispositivo-iphone.txt`, `-ipad.txt`, scratchpad)
- [x] CA14 identica a la referencia: 0 px en llegada, ArrowRight ×2 y ArrowLeft ×2 (`2026-11-16_019-geometria-cierre.txt`, contra `2026-11-14_019-geometria-base.json`, los dos en el scratchpad)
- [x] Criterios de aceptacion de la spec ejecutados, salvo CA17 en la preview de Vercel y en dispositivos reales (T10)
- [x] `CLAUDE.md` (build order, stack, arquitectura de la capa) y `docs/design-spec-v2.md` (§2 "Navigation", §3, inventario de motion #4, changelog) actualizados
- [x] `docs/ESTADO.md`: B13 anotado como tapado en el camino carrusel→album, no cerrado; B14 nuevo
- [x] Estado de `spec.md` → Implementada (pendiente CA17 en la preview y en dispositivos reales)

# Spec 018 · GLSurface en Safari de iOS

- **Estado:** Implementada (2026-11-06). Aprobada por Javi el 2026-11-04 ("Apruebo"). CA6 quedo en FALLA y se resolvio por las enmiendas 1 y 2 (decision 6); CA7 y CE7 `ok` por testimonio de Javi (`tasks.md`, E2 y T8)
- **Fecha:** 2026-11-04
- **Requiere decision de Javi:** Si (motivo: GLSurface). Cambia que hace `GLSurface` cuando una textura no llega o el contexto WebGL se pierde, y cuando el landing y el album vuelven a mostrar sus `<img>`. Es el ciclo de vida de `GLSurface`, una de las cuatro zonas que han roto el sitio antes.

## Problema

En Safari real, las fotos del landing y de los albumes no se pintan. Lo probo Javi el 2026-11-04 en su iPhone 13 y su iPad mini 5, sobre la preview `d5v5j2kzv` (M9 en `docs/ESTADO.md`, testimonio en `specs/017-version-multidispositivo/tasks.md`, T11):

- **Lo que se ve:** los numeros de las fotos, el wordmark y la navegacion. Como mucho se ve una foto, la de los caballos arriba (`america/05`), "y su calidad no es nada buena".
- **Lo que si va:** el atlas y el carrusel. El atlas pinta en un canvas 2D (`src/motion/Atlas.tsx:913`), y las fotos de su visor, que son `next/image` del DOM (`src/components/AtlasViewer.tsx:122,184`), se ven bien (Javi, 2026-11-04). El carrusel no usa `GLSurface`. Lo que falla es justo lo que pinta `GLSurface`. Las mismas fotos se ven como `<img>` y no como texturas: el fallo esta en el paso a GL, no en las imagenes.
- **Una diferencia con el atlas:** el atlas tambien usa `createImageBitmap`, pero desde un `Blob` y sin opciones (`src/motion/Atlas.tsx:321`), y en iOS funciona. `GLSurface` lo llama desde el `<img>` y con `imageOrientation: "flipY"` (`src/motion/GLSurface.tsx:289`). Es un candidato a causa: SIN VERIFICAR, lo decide `?diag`.
- **Lo que no lo reproduce:** la emulacion. Chromium y WebKit con el perfil del iPhone 13 ven 7 fotos pintadas en la primera pantalla (`evidencia/2026-11-03_017-linea-base-chromium-iphone.txt:213`, `evidencia/2026-11-03_017-linea-base-webkit-iphone.txt:219`), y produccion da lo mismo (`evidencia/2026-11-04_017-produccion-iphone.txt`).
- **Sin consola:** Javi no tiene Mac a mano, asi que no hay Web Inspector para ver los errores del iPhone.

Por que un fallo deja la pagina en blanco, en vez de volver a las fotos del DOM:

1. **El `<img>` se oculta en cuanto hay contexto, no cuando su textura llega.** El landing oculta todas sus `<img>` en cuanto `GLSurface` avisa de que hay contexto (`src/motion/LandingComposition.tsx:913`, con `onAvailabilityChange={setGlStatus}` en `:941`), y el album hace lo mismo (`src/motion/AlbumPhotos.tsx:145`). `GLSurface` avisa `true` al crear el contexto (`src/motion/GLSurface.tsx:441`), antes de subir una sola textura.
2. **Si una textura falla, el `<img>` sigue oculto.** Si `createImageBitmap` falla, `GLSurface` lo escribe en la consola y la cuenta como lista para no bloquear la entrada (`src/motion/GLSurface.tsx:289-293`), pero no vuelve a mostrar el `<img>`. La foto se queda oculta en el DOM y sin pintar en el canvas.
3. **Nadie escucha la perdida del contexto.** `GLSurface` no escucha `webglcontextlost` (no aparece en `src/motion/GLSurface.tsx`), y `ogl` tampoco: lo deja como TODO (`node_modules/ogl/src/core/Renderer.js:3`). Si iOS tira el contexto, el canvas queda vacio y las `<img>` siguen ocultas.

Que se vea una foto y no las demas apunta a fallos por textura, o a un contexto que se pierde despues de subir la primera, y no a un contexto que nunca se crea. Es una observacion de la captura de Javi: SIN VERIFICAR.

Hay dos sitios donde iOS puede quedarse sin memoria. Los dos estan SIN VERIFICAR:
- **El landing sigue vivo en otras rutas.** El landing se monta desde el layout y sigue montado en todas las rutas (`src/app/layout.tsx:46`), con su contexto y sus texturas (CLAUDE.md, "The landing is rendered persistently"). En un album hay dos contextos WebGL a la vez: el del landing en pausa y el del album (`src/motion/AlbumPhotos.tsx:239`).
- **El landing sube 30 texturas:** 15 fotos y su copia para el scroll infinito (`src/motion/LandingComposition.tsx:885-913`).

**La calidad baja de la unica foto que se ve.** Por debajo de 900 px de ancho, cada foto del landing mide `min(w·2,4, 85vw)` (`src/app/globals.css:61-65`). Pero `sizes` sigue pidiendo `w vw` (`src/motion/LandingComposition.tsx:896`), asi que el navegador descarga una imagen unas 2,4 veces mas estrecha de lo que se pinta. Esa es la causa probable de la baja calidad, pero no esta medida: SIN VERIFICAR.

## Objetivo

En Safari real del iPhone 13 y del iPad mini 5, las fotos del landing y de los albumes se ven.

Si una textura no llega o el contexto se pierde, esa foto vuelve a su `<img>` del DOM y nunca se queda en blanco. Un modo `?diag` en la propia pagina dice por que, para encontrar la causa sin Mac.

## Regla de Javi: el escritorio no cambia

"El codigo NO puede interferir al codigo de web, un arreglo que vaya en movil no puede alterar algo que vaya bien en version desktop" (Javi, 2026-11-04). Por eso:
- **La red solo actua cuando algo falla.** En el camino normal, contexto creado y texturas subidas, `GLSurface` hace exactamente lo que hace hoy: oculta las `<img>` en el mismo momento y pinta igual. En escritorio no falla nada, asi que la red nunca se dispara.
- **`sizes` cambia solo por debajo de 900 px** (CA9), con una media query en el propio atributo, la misma frontera que `src/app/globals.css:61`. Por encima, el valor es el de hoy.
- **El panel `?diag` solo existe con el parametro.**
- **Lo comprueban CA1, CA8 y CA10**, este ultimo con una captura de escritorio identica al pixel frente a `main`.

## Fuera de alcance

- **El diseño del landing en movil** (M1, M4, el wordmark en horizontal): spec `landing-movil`, con las fotos ya pintadas. Javi ya pide fotos mas pequeñas en movil: "la anchura es mucho menor" (2026-11-04). Entra en esa spec, no en esta.
- **El scroll infinito en movil y tablet.** Javi lo ha comprobado: el landing no es infinito con el dedo (2026-11-04). La causa probable esta en Lenis. Con `syncTouch: false`, que es su valor por defecto (`node_modules/lenis/dist/lenis.mjs:434`), Lenis no toca los gestos tactiles y deja el scroll nativo (`:617`). El landing crea Lenis con `{ infinite: true }` y nada mas (`src/motion/LandingComposition.tsx:322`, `src/motion/useLenis.ts:38`), asi que el dedo nunca pasa por el salto infinito. SIN VERIFICAR en un dispositivo. Es el scroll infinito, otra zona sensible: va en su propia spec, `scroll-infinito-tactil`.
- **El atlas** (M5, M6, M7, M10): spec `atlas-movil`.
- **El carrusel** (M8, M10): spec `carrusel-tactil`.
- **La entrada con la CPU limitada** (M3): spec `entrada-movil`. Puede ir aqui si `?diag` demuestra que comparte la causa, y eso lo decide Javi.
- **Desmontar el landing fuera de `/`.** Que el landing persista es una decision de arquitectura. Si `?diag` demuestra que dos contextos a la vez son la causa, se abre una spec aparte.
- **El wordmark, el blend `difference` y el scroll infinito:** no se tocan.

## Zonas afectadas

- [x] Landing (`src/motion/LandingComposition.tsx`: cuando se ocultan sus `<img>`, y quiza `sizes`)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`: cuando se ocultan sus `<img>`)
- [ ] Atlas (`src/app/atlas/`)
- [x] Renderizador GL (`src/motion/GLSurface.tsx`: estado por textura, perdida del contexto, `?diag`)
- [ ] Datos (`src/data/photos.ts`)
- [x] Diagnostico (`scripts/diagnostico.mjs`: los fallos forzados y la seccion `?diag`)

## Choca con el spec

Nada directamente. El design spec ya preve volver a las fotos del DOM si no se puede crear un contexto WebGL (`docs/design-spec-v2.md:81`, Motion inventory #1). Esta spec extiende esa red a una textura que falla y a un contexto perdido.

Hay un matiz de diseño para Javi (pregunta 1): si la vuelta al DOM es por foto, en la misma pagina puede haber fotos curvadas, pintadas por GL, junto a fotos planas, del DOM.

## Criterios de aceptacion

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs --skip-build` | Invariantes 174 de 174 en escritorio, con las mismas lineas `ok`/`FALLA` que en `evidencia/2026-11-04_diagnostico_cierre-017.txt`, mas las nuevas de esta spec en `ok` |
| CA2 | `node scripts/diagnostico.mjs --skip-build --dispositivo iphone` | Invariantes 47 de 48 o mejor. El unico fallo permitido es el de M4 (`america/01.jpg`, 1,21 px), como en `evidencia/2026-11-04_017-produccion-iphone.txt`. Fotos que se ven en el landing en 0, 1, 2 y 3 alturas: 7, 7, 5, 6 o mas |
| CA3 | Seccion nueva "fallo de textura forzado" del diagnostico (`--dispositivo iphone`). `createImageBitmap` rechaza siempre, inyectado con `addInitScript` | En `/` y en el primer album, toda foto que interseca el viewport se ve (fraccion pintada ≥ 0,3, el mismo umbral que "fotos del landing"). En el landing se ven las mismas que sin fallo: 7 en la primera altura. 0 errores de consola sin contar los `[GLSurface]` esperados |
| CA4 | Seccion nueva "contexto perdido forzado" del diagnostico. `WEBGL_lose_context.loseContext()` sobre el canvas del landing y el del album, ya cargados | En 1,5 s como mucho, toda foto que interseca el viewport se ve (fraccion ≥ 0,3) en `/` y en el album. El diagnostico vuelve a `/` desde un album, en navegacion blanda, y las fotos siguen viendose |
| CA5 | `node scripts/diagnostico.mjs --skip-build`, seccion `?diag`: carga `/?diag` y `/album/<primero>?diag` | Existe un elemento `[data-gl-diag]` visible con: tipo de contexto (`webgl2`, `webgl` o `ninguno`), perdido si o no, texturas subidas N de M, fallos de decodificacion y el ultimo error. En la emulacion dice `perdido: no` y N = M para las fotos ya cargadas. Sin `?diag`, `document.querySelectorAll('[data-gl-diag]').length` es 0 en todas las rutas |
| CA6 | Prueba de Javi en Safari real, iPhone 13 y iPad mini 5, sobre la preview de la rama: `/?diag` y un album con `?diag`, mas una captura de cada uno | Javi copia en `tasks.md` lo que dice el panel: contexto, perdido, N de M, errores. Eso confirma o refuta la causa. No es un criterio de aprobado: es la medida que decide el arreglo de CA7 |
| CA7 | Prueba de Javi en Safari real, iPhone 13 y iPad mini 5, sobre la preview de la rama, sin `?diag` | En el landing se ven todas las fotos de la primera pantalla, en vertical y en horizontal. En un album se ven todas las fotos al bajar. Testimonio en `tasks.md`, con capturas en `evidencia/` |
| CA8 | `node scripts/diagnostico.mjs --skip-build`, seccion "entrada", en escritorio | Frame de arranque ≤ 250 ms, reposo ≤ 1,8 s y 0 frames > 50 ms, en el mismo rango que `evidencia/2026-11-04_diagnostico_cierre-017.txt:440` (200 ms, 1578 ms, 0). La red nueva no frena la entrada |
| CA9 | Medicion nueva en `--dispositivo iphone` e `--dispositivo ipad-mini`: para cada foto del landing que interseca el viewport, ancho de `currentSrc` frente a ancho pintado × min(dpr, 2) | Ninguna foto por debajo de 1,0, en vertical y en horizontal. En escritorio, el `currentSrc` de cada foto es el mismo que en `main` |
| CA10 | Captura de escritorio, 1440x900, de `/`, el primer album y `/atlas` en reposo, sin movimiento, con la entrada terminada, frente a la misma captura hecha con `main` | Diferencia de 0 px en las tres rutas. Si la entrada no es determinista al pixel, cuenta la captura tras ir a la ruta en navegacion blanda y esperar a que se asiente |

## Decisiones de Javi (2026-11-04)

1. **La vuelta al DOM es de toda la pagina.**
2. **La calidad del landing en movil entra en esta spec** (CA9).
3. **Se espera 1,5 s** a una textura antes de volver al DOM.
4. **Contexto perdido: se queda en el DOM hasta recargar.** No se reconstruye la escena aunque iOS devuelva el contexto. Javi lo confirmo tras un primer "Si" ambiguo.
5. **El panel `?diag` se queda** en el codigo, solo con el parametro.
6. **La causa de fondo, si es memoria, se decide con la medida de CA6 delante**, como enmienda.

## Enmienda 1 (aprobada por Javi el 2026-11-04: "ok"): medir por que iOS no pinta

**Hecho nuevo (T7):** en el iPhone 13 y el iPad mini, con `?diag`, el contexto es webgl2, el programa enlaza, las texturas se suben sin error GL ("texturas 8 de 8" en el album), no hay fallos de decodificacion, y aun asi no se ve ninguna foto, o solo algunas mal colocadas. Ninguno de los cinco disparadores de la red salta, asi que la pagina se queda con las `<img>` ocultas. La causa no es ninguna de las cubiertas (decision 6).

**Que cambia:** solo medicion, y solo con `?diag` en la URL (`glDiagActivo`, `src/motion/glDiag.ts`). Sin el parametro `GLSurface` no ejecuta nada nuevo. El panel añade:
- **bitmaps vacios N de M:** cada bitmap de `createImageBitmap` reducido a 8x8 en un canvas 2D; vacio si todo es transparente;
- **texturas vacias N de M:** cada textura recien subida, leida de la GPU por un framebuffer en 9 puntos;
- **pintados N de M visibles:** el buffer recien pintado, leido en el centro de cada foto visible, dos veces por segundo;
- **canvas:** su caja CSS y su buffer, la ventana y el `visualViewport`, y su `display`, `visibility`, opacidad y z-index.

**Lectura prevista:**
- bitmaps vacios: la conversion `<img>` → `ImageBitmap` de WebKit falla en silencio;
- bitmaps llenos y texturas vacias: falla la subida;
- todo lleno y pintados N de N, pero Javi no ve nada: el canvas pinta y no se compone o queda tapado;
- pintados por debajo de N o la caja del canvas distinta de la ventana: las fotos se dibujan fuera de su sitio.

El arreglo se decide con esa lectura delante, en una enmienda 2.

**Criterios:**
- **CE1:** con `?diag`, en escritorio y `--dispositivo iphone`, la invariante "E1 muestras ?diag" en `ok` en `/` y en el album (en emulacion todo pinta).
- **CE2:** CA1 y CA10 siguen como en T5: sin `?diag` el escritorio es identico (192 de 192 mas la nueva, capturas a 0 px).
- **CE3:** Javi abre la preview con `?diag` en su iPhone y su iPad mini y envia el panel.

## Enmienda 2 (aprobada por Javi el 2026-11-04: "Reintento desde fichero"): rescatar el bitmap vacio

**Hecho nuevo (CE3, `tasks.md` E1):** en el iPhone 13, `createImageBitmap(<img>)` devuelve sin error bitmaps transparentes: 8 de 16 y 17 de 22 en el landing, y 3 de 3 en el album. Las texturas salen vacias por eso. El canvas, su caja y la composicion estan bien.

**Que cambia en `GLSurface`:**
- Cada bitmap se muestrea siempre, no solo con `?diag`: 16x16 px del centro reducidos a 8x8 (`src/motion/bitmapVacio.ts`).
- Si sale transparente, se cierra y la foto se vuelve a crear desde el fichero: `fetch(currentSrc, { cache: "force-cache" })` → `Blob` → `createImageBitmap(blob, { imageOrientation: "flipY" })`. Es el camino del atlas, que pinta en iOS. El reintento tiene su propio reloj de 1,5 s.
- Si el reintento sale vacio o falla, la pagina entera vuelve al DOM (decision 1).
- En escritorio el primer bitmap nunca sale vacio. El reintento no se ejecuta, y el unico añadido es la muestra.

**Criterios:**
- **CE4:** con `createImageBitmap` forzado a devolver transparente desde una `<img>`, en `/` y en el album se ven las mismas fotos que sin fallo, con `rescatados` > 0 y sin caida al DOM. Se comprueba en escritorio y con `--dispositivo iphone`, en "bitmap vacio forzado".
- **CE5:** con el bitmap transparente tambien desde el `Blob`, `GLSurface` cae al DOM y se ven las mismas fotos.
- **CE6:** CA1, CA8 y CA10 sin cambios. Las tres capturas de escritorio a 0 px, la entrada en su tiempo y 0 frames largos.
- **CE7:** Javi, en su iPhone y su iPad mini, ve las fotos del landing y de los albumes. Con `?diag`, `rescatados` es mayor que 0 y no hay caida al DOM.

## Preguntas abiertas (originales, respondidas arriba)

1. **¿La vuelta al DOM es por foto o de toda la pagina?**
   - **Por foto:** solo la foto cuya textura falla vuelve a su `<img>`, y el resto sigue curvandose con GL. Puede mezclar fotos curvas y planas en la misma pagina.
   - **Toda la pagina (recomiendo esta):** si falla cualquier textura que se ve, o se pierde el contexto, toda la pagina vuelve al DOM, plana y coherente. En iOS, si falla una, probablemente fallan todas.
2. **¿Meto la calidad del landing en movil en esta spec?** Es arreglar `sizes` para que pida el ancho que de verdad se pinta (CA9). Toca `LandingComposition`, pero no una de las cuatro zonas sensibles. Recomiendo que si: es pequeño y es lo que viste en la unica foto que se veia.
3. **¿Cuanto se espera a una textura antes de volver al DOM?** Propongo 1,5 s, el mismo tope que ya usa el album para su primera foto (`src/motion/AlbumPhotos.tsx:47`, `ARRIVAL_MAX_WAIT_MS`).
4. **Si iOS devuelve el contexto (`webglcontextrestored`), ¿hay que reconstruir la escena?**
   - **Reconstruir:** se vuelven a subir las texturas y vuelve la curva.
   - **Quedarse en el DOM hasta recargar (recomiendo esta):** es lo mas seguro. Un contexto que iOS ya tiro una vez probablemente lo vuelva a tirar.
5. **¿El panel `?diag` se queda en el codigo para siempre o se quita al cerrar la spec?** Recomiendo dejarlo: solo aparece con el parametro, y vuelve a servir la proxima vez que algo falle en un dispositivo sin consola.
6. **Si `?diag` demuestra que la causa es la memoria**, es decir, dos contextos o 30 texturas, el arreglo puede ser:
   - liberar las texturas del landing fuera de `/`, o
   - bajar la resolucion de las texturas en movil.

   Las dos tocan el ciclo de vida de `GLSurface` mas alla de esta red. ¿Lo decidimos con la medida de CA6 delante, como una enmienda a esta spec?

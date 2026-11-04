# Tareas 017 · Version multidispositivo: medir iPhone e iPad

- **Plan:** `plan.md` (aprobado el 2026-11-03, "apruebo")

Pasos atomicos, en orden. Ninguno toca `src/`, asi que el sitio carga igual que hoy durante toda la spec. Lo que cada paso puede romper es la pasada de escritorio del diagnostico, y su comprobacion lo vigila.

- [x] **T1** · Un contexto unico, `CTX`, en lugar de los 10 literales de 1440x900
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: `node scripts/diagnostico.mjs --skip-build` da 174 invariantes con el mismo resultado que `evidencia/2026-11-02_diagnostico.txt`, salvo B11 (CA1)
  - **Hecho 2026-11-03.** 174 de 174, 0 errores de consola. Comparadas las 174 lineas `ok`/`FALLA` con las del 2026-11-02: solo cambian las 3 de B11 (`NEXT ALBUM empieza arriba`), que fallaban entonces y ahora pasan. Es el comportamiento intermitente ya descrito en `docs/ESTADO.md`, B11. Salida en el scratchpad (`2026-11-03_017-escritorio.txt`), pendiente de copiar a `evidencia/`
  - **Incidente:** al probar T2, un parche que fallo sin escribir nada dejo el script antiguo. El bucle de prueba de flags lo lanzo con un flag desconocido y sin `--skip-build`, y corrio un `next build` completo. Javi no tenia `npm run dev` abierto (el puerto 3000 no respondia), asi que no rompio nada. Desde entonces, toda prueba de flags va con `--skip-build` y `timeout`
- [x] **T2** · `scripts/lib/dispositivo.mjs`: tabla de los 4 perfiles, flags `--dispositivo`, `--horizontal`, `--motor` y `--cpu`, y el lanzador por motor con el bypass de Vercel
  - Fichero(s): `scripts/lib/dispositivo.mjs` (nuevo), `scripts/diagnostico.mjs`
  - Comprobacion: un flag invalido sale con codigo 2 y un mensaje. Sin flags, T1 sigue igual (CA1)
  - **Hecho 2026-11-03.** `--dispositivo nokia`, `--dispositivo` sin valor, `--motor firefox`, `--cpu x` y `--horizontal` sin dispositivo salen con codigo 2 y su mensaje. eslint limpio en los dos ficheros. Sin flags: 173 de 174, y solo cambia `atlas · CA15` (la marca de `norte/03` sale con `norte/04` y hay 2 frames > 50 ms). `--cpu` se valida pero aun no se aplica: eso es T8
  - **CA15 del atlas no lo causa T2.** `--medir /atlas` tres veces con el `scripts/diagnostico.mjs` de `HEAD`, sin cambios de esta spec: falla 1 de 3, junto con `CA3 0 frames > 50 ms en la rueda` (1 frame de 50 ms). Con T2 falla 2 de 3. Es intermitente y anterior a la spec: queda como B12 en `docs/ESTADO.md` al cerrar la sesion. Salidas en el scratchpad (`017-atlas-rep{1,2,3}.txt`, `017-atlas-head-rep{1,2,3}.txt`)
- [x] **T3** · Cabecera del dispositivo y secciones omitidas en modo dispositivo
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: `--dispositivo iphone --motor webkit` imprime 390x664, dpr 3, tactil y `hover: hover` falso. Las secciones de escritorio salen "omitido (--dispositivo)" (CA2)
  - **Hecho 2026-11-03.**
    - **Cabecera:** mide `390x664 · dpr 3 · ontouchstart true · pointer: coarse true · hover: hover false`, igual que el perfil, y las 4 invariantes de cabecera pasan. La barra de scroll sale "omitido (--dispositivo)". Llegada, scroll y textos del album, descifrado y atlas de escritorio no corren, y la cabecera las lista como omitidas.
    - **Segunda pasada:** 33 de 33, 0 errores de consola (`017-t3-iphone-webkit-2.txt`, scratchpad).
    - **Primera pasada:** las 6 rutas agotaron `page.goto` (30 s esperando `load`), pero despues se midieron bien: wordmark `SUQUIA`, canvas 780x1328. No se reprodujo con cada ruta aislada, ni con un `next dev` caliente y la secuencia `/albums`, `/`, `/`, `/albums`, `/about` (con y sin esperas de 3,5 s), ni en la segunda pasada completa. Aquella pasada iba muy lenta (arranque de la entrada a 2147 ms, frente a 626 ms en la segunda). Causa: SIN VERIFICAR; la explicacion mas probable es el primer arranque en frio de WebKit en esta maquina. Desde aqui, si `goto` agota el tiempo, el harness imprime las peticiones pendientes (`logPending`, `scripts/diagnostico.mjs`).
    - **Una vez, con `--medir /`, el wordmark midio `""`** con `landingHidden: 0`. No ha vuelto a salir. SIN VERIFICAR: puede ser el descifrado aun sin resolver en un WebKit lento.
    - **Para el plan:** los tiempos de WebKit en Windows no sirven como aproximacion a un iPhone. El WebGL parece pintarse sin GPU, y la misma medida varia mas del triple entre dos pasadas. Las cifras de CA8 y CA9 se toman de Chromium; WebKit da la parte funcional y de maquetacion
- [x] **T4** · Invariantes por ruta y encaje de las fotos en modo dispositivo
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: las 6 rutas con todas sus invariantes en `iphone` y en `ipad`, en los dos motores. Una linea por cada foto que no quepa o se deforme (CA3, CA5)
  - **Hecho 2026-11-03.**
    - **Que corre:** las invariantes por ruta ya corrian en modo dispositivo desde T1, porque leen `CTX`. Se añade la seccion `fotos enteras` para `/` y los 4 albumes. La lista sale de `src/data/photos.ts`: el carrusel solo enlaza el album abierto, y la primera version encontro uno solo. Para las fotos aun sin cargar, la proporcion natural sale de los atributos `width`/`height`; sin eso, el iPad mini median 15 de 30.
    - **Enmienda al CA5,** confirmada por Javi el 2026-11-03 (enmienda 1 en `spec.md`): una foto cuenta como deformada si pasa del 1 % **y** su alto difiere en mas de 1 px del que da su ancho. En una foto de 112 px de alto, 1 px ya es un 1 %.
    - **Resultado:** iPhone 13 en Chromium, 34 de 35; iPad mini en WebKit, 34 de 35. El unico fallo, en los dos, es `/`: `america/01` mide 150x112 en el iPhone, a 1,21 px de su proporcion (las dos copias), y `norte/03` mide 571x162 en el iPad mini, a 1,63 px. Los 4 albumes pasan. Salidas: `017-t5-iphone-chromium.txt` y `017-t5-ipad-mini-webkit.txt` (scratchpad)
- [x] **T5** · Seccion `fotos del landing`: caja, opacity, interseccion y pixel del canvas, en 0, 1, 2 y 3 alturas
  - Fichero(s): `scripts/diagnostico.mjs`, `scripts/lib/dispositivo.mjs`
  - Comprobacion: a 1440x900 (con un flag de prueba) cuenta como visibles las fotos que el escritorio ya ve. En `iphone`, imprime el total que confirma o refuta "no se ve ninguna foto" (CA4)
  - **Hecho 2026-11-03.** Corre en modo dispositivo, o en escritorio con `--fotos-landing`. "Se ve" exige una opacidad efectiva > 0,5 y al menos un 30 % de pixeles distintos del fondo dentro de la caja, en una captura con `scale: "css"`. Fotos visibles en 0, 1, 2 y 3 alturas:

    | Pasada | Fotos visibles | Invariantes | Salida (scratchpad) |
    |---|---|---|---|
    | Escritorio, `--fotos-landing` | 7, 7, 6, 6 | 175 de 175 | `017-t5-escritorio.txt` |
    | iPhone 13, Chromium | 7, 7, 5, 6 | 34 de 35 | `017-t5-iphone-chromium.txt` |
    | iPad mini, WebKit | 7, 7, 7, 2 | 34 de 35 | `017-t5-ipad-mini-webkit.txt` |

    En los tres, `GLSurface` oculta las 30 `<img>` y el canvas las pinta.
  - **"No se ve ninguna foto" (Javi) NO se reproduce en emulacion.** La diferencia esta entre la emulacion y el Safari de un iPhone real. Hipotesis, SIN VERIFICAR, para la spec de arreglo:
    - el contexto WebGL2 o la subida de texturas fallan en iOS de verdad (`createImageBitmap` con `imageOrientation: "flipY"`, `src/motion/GLSurface.tsx`);
    - `GLSurface` oculta las `<img>` y despues no pinta nada.

    Lo decide CA12, en el iPhone 13 de Javi.
  - **Incidente:** la pasada de WebKit con el primer borrador de T5 cayo con `ReferenceError` (leia `ARRIVAL_BG` antes de declararse) y dejo un `next dev` huerfano en :3100. La siguiente salio con codigo 2 ("puerto ocupado"). Se cerro el proceso con `taskkill` y se repitio
- [x] **T6** · Seccion `gestos`: scroll tactil por CDP, y arrastre y pellizco con `PointerEvent` en el carrusel y el atlas, con y sin movimiento reducido
  - Fichero(s): `scripts/lib/dispositivo.mjs`, `scripts/diagnostico.mjs`
  - Comprobacion: cada gesto imprime antes y despues. Lo que un motor no puede simular sale `NO MEDIBLE` (CA6)
  - **Hecho 2026-11-03.**
    - **Como se simulan:** toques reales por CDP (`Input.dispatchTouchEvent`, `touchSwipe` y `touchPinch` en `scripts/lib/dispositivo.mjs`). El plan proponia `PointerEvent` sinteticos para el carrusel y el atlas, y no sirven: `Atlas.tsx` llama a `setPointerCapture(e.pointerId)` al tocar, y con un id inactivo lanza. Por eso, en WebKit los 5 gestos salen `NO MEDIBLE` y el RESUMEN los lista aparte, sin contarlos como aprobados.
    - **iPhone 13, Chromium, con y sin movimiento reducido:**
      - `/`: scrollY 0 -> 317.
      - `/album/america`: scrollY 0 -> 317.
      - `/albums`: album abierto 01 -> 02.
      - `/atlas`, arrastre de 120 px: lambda0 -0,803 -> -5,284 (-5,222 con movimiento reducido), con la inercia incluida.
      - `/atlas`, pellizco de 80 a 220 px: R 164 -> 450.
      - Resultado: 44 de 45; el unico fallo es el de T4 (`017-t6-iphone-chromium-2.txt`).
    - **Error del harness, corregido:** la primera version tomaba el canvas con `document.querySelector("main canvas")`, que es el del landing oculto (0x0), y arrastraba y pellizcaba en (0,0). El atlas "no se movia". Ahora usa el `<main>` visible
- [x] **T7** · Seccion `visor del atlas`: tocar una marca sola y medir la caja del visor
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: el visor abre y su caja sale impresa contra el viewport (CA7)
  - **Hecho 2026-11-03.**
    - **Como se toca:** a zoom inicial, en el iPhone, todas las fotos van agrupadas. El harness toca la marca sola mas cercana al centro y, si no hay ninguna, el grupo mas cercano, hasta 6 veces o hasta que se abra el visor.
    - **iPhone 13, en los dos motores:** el toque 1 acerca el grupo de 7 de NY, y el toque 2 abre `ny/07`. El visor ocupa x 110 a 390 (280 px de 390, `atlasViewerWidth`), alto completo, dentro del viewport y sin scroll horizontal. 12 de 12 en `--medir /atlas` (`017-t7-iphone-{chromium,webkit}.txt`).
    - **Para la spec de arreglo:** al globo le quedan 110 px a la izquierda del visor
- [x] **T8** · Entrada del landing con perfil y `--cpu`, y seccion `--fluidez-atlas`
  - Fichero(s): `scripts/diagnostico.mjs`, `scripts/lib/dispositivo.mjs`
  - Comprobacion: `--cpu 4` en WebKit sale `NO MEDIBLE (sin CDP)`. La fluidez a 1440x900 da una mediana cercana a 16,7 ms en esta maquina (CA8, CA9)
  - **Hecho 2026-11-03.**
    - **Que se añade:** `--cpu N` (`applyCpu`, CDP `Emulation.setCPUThrottlingRate`) se aplica a la entrada. En WebKit, la entrada sale `NO MEDIBLE` y no se mide a CPU x1 haciendose pasar por xN. La seccion `--fluidez-atlas` mide la duracion de los frames (rAF) durante 2 s de arrastre de ida y vuelta y 1 s de pellizco. Usa toques por CDP en dispositivo con Chromium; en escritorio, arrastre y rueda de raton.
    - **Escritorio, CPU x1:** arrastre mediana 16,7 ms, p95 16,8, 0 frames > 50 ms; rueda p95 33,4, 2 frames > 50 ms.
    - **iPhone 13, Chromium, CPU x1:** arrastre y pellizco a 16,7 ms, 0 frames > 50 ms. El canvas del atlas no limita el dpr: buffer de 1170x1299.
    - **iPhone 13, Chromium, CPU x4:** arrastre p95 50 ms, max 83 ms, 7 frames > 50 ms; pellizco p95 33 ms, 1 frame > 50 ms.
    - **Entrada, iPhone 13, CPU x4, 3 repeticiones:** frame de arranque mediana 2483 ms, max 2700; reposo mediana 6147 ms. En las 3, 6 de los 7 participantes llegan al monton en el mismo frame (por ejemplo 5447 ms): con CPU lenta, el espaciado de la spec 008 (`PILE_JOIN_MIN_GAP_MS`) no se nota. Va a la lista de B7.
    - **Salidas:** `017-t8-*.txt` (scratchpad).
    - **Sin explicar:** en la misma pasada de escritorio, la seccion `atlas` dio 24 de 27 (CA3, CA13 y CA15, todos por frames > 50 ms). Es la familia intermitente de B12, pero aqui corrio justo despues de la medida de fluidez, en otro contexto. Que no influya: SIN VERIFICAR
- [x] **T9** · Linea base: las 16 combinaciones, la CPU×4 y la fluidez, en segundo plano
  - Fichero(s): salidas en el scratchpad con su nombre final; Javi las copia a `evidencia/`
  - Comprobacion: `ls evidencia/*017-linea-base*` (CA10)
  - **Hecho 2026-11-03, pendiente de que Javi copie las salidas a `evidencia/`.**
    - **Que se corrio:** 16 combinaciones con `--repeticiones 3 --fluidez-atlas`; las 8 de Chromium otra vez con `--cpu 4` (entrada y atlas por separado); y escritorio de referencia (fluidez a CPU x1 y x4, entrada a CPU x4). Son 34 salidas `2026-11-03_017-*.txt` en el scratchpad, con `linea-base.sh`.
    - **Primera tanda:** la primera pasada de WebKit cayo (`mouse.wheel` no existe en WebKit movil) y dejo `next dev` huerfano. El `taskkill` del script no lo cerro, porque con `MSYS_NO_PATHCONV=1` recibia `//PID` literal. Todas las siguientes salieron con codigo 2. Se arreglaron las dos cosas y se repitio todo menos las 8 de Chromium, que ya estaban bien. El pellizco en WebKit sale `NO MEDIBLE`, y la medida de fluidez ya no tumba el diagnostico.
    - **Resultados:** en `docs/ESTADO.md`, seccion "Linea base multidispositivo (spec 017)"
- [x] **T10** · Tabla de fallos y lista de specs de arreglo en `docs/ESTADO.md`, con el landing primero
  - Fichero(s): `docs/ESTADO.md`
  - Comprobacion: `grep -n "017" docs/ESTADO.md` (CA11)
  - **Hecho 2026-11-03.** Seccion "Linea base multidispositivo (spec 017)" en `docs/ESTADO.md`: 8 hallazgos (M1 a M8) con su evidencia y 4 specs de arreglo en orden, el landing primero. El resto de `docs/ESTADO.md` lo pone al dia `/cerrar-sesion`
- [ ] **T11** · Preview de Vercel: el diagnostico con `--url` y `--dispositivo iphone`, y Javi lo prueba en su iPhone 13 y su iPad mini 5
  - Fichero(s): `tasks.md` (testimonio)
  - Comprobacion: CA12, CA13

## Cierre

- [ ] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/` (con el `npm run dev` de Javi parado)
- [ ] Criterios de aceptacion de la spec ejecutados
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado
- [ ] Estado de `spec.md` → Implementada

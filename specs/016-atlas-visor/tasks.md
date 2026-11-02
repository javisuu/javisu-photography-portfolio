# Tareas 016 · Atlas: mas zoom y visor de fotos

- **Plan:** `plan.md` (aprobado el 2026-11-01)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

## Medir

- [x] **T1** · Sonda de solo lectura `window.__atlas` (`state()`, `clusters()`, `latticeCount()`) y seccion `atlas` en el diagnostico, ejecutada sobre el codigo de hoy
  - Fichero(s): `src/motion/Atlas.tsx`, `scripts/diagnostico.mjs`
  - Comprobacion: `node scripts/diagnostico.mjs --medir /atlas` da la linea base. Hoy CA2 falla (R maximo ≈ 974 px) y CA4 no encuentra `[data-atlas-viewer]`. CA3 da una cifra de frames. Salida en `evidencia/AAAA-MM-DD_016-linea-base.txt`
  - **Hecho 2026-11-01.** Linea base: 8 de 20 en la seccion `atlas`, 0 errores de consola. Salida: `evidencia/2026-11-01_016-linea-base.txt` (resumen en `:74-79`; copiada por Javi desde el scratchpad, por la regla deny de `evidencia/**`). Cifras:
    - Encuadre por defecto: R 256 (minR 195, maxR 974), caja 1440x609. Reticula: 4423 puntos construidos y 3184 pintados.
    - Par de CA2: norte/05 y sol/01, en San Sebastian, a 40 m. Separarlo a 14 px pide R ≈ 2,24 M. Hoy, en 12 pasos de rueda R llega a 974 y el par sigue agrupado (grupo de 11 fotos).
    - **CA3 ya falla hoy:** 2 frames > 50 ms (el peor, 67 ms) durante la rueda hasta 974. Al maximo, la reticula de todo el globo tiene 48.630 puntos construidos y 43.004 pintados. Es justo lo que corrige T3.
    - CA4 a CA8: no hay visor, sale el panel de lista. Grupo elegido: america/01-04, con 04 (Xilitla) `city`.
    - CA10: 42 parejas exact necesitan zona y no existe `atlas-zones.json`. CA11 pasa (974 ≤ 4563). CA12: sin cita de OSM.
  - Un primer intento midio mal: `document.querySelector("main canvas")` cogia el canvas del landing, montado y oculto (caja 0), y los clics y la rueda caian fuera del globo. Corregido para tomar el `<main>` visible.
  - De paso, `existsSync` (`scripts/diagnostico.mjs:14`) ya se usa (CA10), y desaparece su aviso de import sin usar (paso 5 de `docs/ESTADO.md`). `npx eslint .` del repo entero todavia da 1 aviso, en otro fichero: `scripts/medir-carrusel.mjs:154`, `'S' is defined but never used` (medido el 2026-11-01)
- [x] **T2** · Centroides aprobados por Javi (Puerto Escondido `15.8720, -97.0767` y San Blas `9.5583, -78.9483`, `precision: "city"`) y "New York" → "New York City"
  - Fichero(s): `src/data/photos.ts:206,218,231,241,253` y `:368,380,390,400,410,420`
  - Comprobacion: tsc ok. La linea de cifras de `/atlas` pasa de 26 a 31 fotos, sin contar dos veces Nueva York. Aparecen dos marcas de grupo nuevas (`clusters()` de la sonda)
  - **Hecho 2026-11-01.** tsc ok y 0 `lat: null` en `src/data/photos.ts`. En `/atlas` (`next dev`, 1440x900, 0 errores de pagina), la linea de cifras dice `31 Photographs — 11 Cities — 5 Countries`. La sonda da 6 grupos en el encuadre por defecto, dos de ellos nuevos: Puerto Escondido (america/05-07) y San Blas (america/08-09). Salida en la conversacion

## Zoom

- [x] **T3** · Reticula acotada al viewport: `unproject`, indices anclados a la esfera y recorrido solo del rango visible. Sin tocar todavia el limite del zoom
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: con el encuadre por defecto, `latticeCount()` queda en ±2 % de la linea base. Con zoom maximo y una rotacion, frames > 50 ms ≤ los de la linea base. Invariante del buffer del canvas en verde
  - **Hecho 2026-11-01.** `node scripts/diagnostico.mjs --medir /atlas`: 9 de 20 (antes 8), 0 errores de consola y buffer del canvas = caja x dpr. Salida: `evidencia/2026-11-01_016-t3.txt` (reticula en `:51` y `:54`, resumen en `:79`). Cifras:
    - **Encuadre por defecto:** 3184 puntos pintados, los mismos que en la linea base. Se recorren 15.617 candidatos (tierra y mar) dentro del rango visible.
    - **Rueda hasta R = 974 sobre San Sebastian:** 0 frames > 50 ms (antes 2) y el peor baja de 67 a 17 ms. CA3 pasa. Al maximo se recorren 26.911 puntos y se pintan 12.853. El "43.004 pintados" de la linea base no es comparable: el codigo viejo contaba tambien los puntos fuera del canvas.
    - **Mismos puntos, comprobado pixel a pixel.** Captura del canvas con el `Atlas.tsx` de `HEAD` y con el nuevo, en tres estados: encuadre por defecto, 6 pasos de rueda sin rotar y grupo de San Sebastian centrado a R = 974. 0 pixeles distintos (umbral 8/255) en los tres. Estado final identico en las dos: R 973,6, lambda0 -0,0340, phi0 0,7565. Scripts `shots.mjs` y `diff.mjs` en el scratchpad de la sesion; salida en la conversacion
  - La sonda cambia `built` por `visited` (puntos recorridos en la ultima pasada): ya no hay una reticula construida que contar
- [x] **T4** · Script de mascaras locales: rasterizador extraido a funcion comun, zonas desde `photos.ts`, piramide por zona y `atlas-zones.json`. Dependencia `shapefile` (dev) y `atlas-source/` en `.gitignore`
  - Fichero(s): `scripts/generate-atlas-local-masks.mjs`, `scripts/generate-atlas-land-mask.mjs`, `package.json`, `.gitignore`, `public/atlas/local/`, `src/data/atlas-zones.json`
  - Comprobacion: salen 3 zonas (San Sebastian, Nueva York, San Miguel de Allende). Los PNG suman menos de 300 KB. `land-mask.png` regenerado da el mismo hash que el actual. Una captura de cada nivel, mirada a ojo: la costa de San Sebastian y Manhattan se reconoce
  - **Hecho 2026-11-01.** `node scripts/generate-atlas-local-masks.mjs` tarda 2,3 s: lee 873.918 registros del `.shp` (1,3 GB) y solo parsea los 1830 que tocan una zona. Salen 3 zonas y 7 mascaras de 1024x1024, 76 KB en total:
    - San Miguel de Allende: 3 coordenadas, las mas cercanas a 226 m, needR 590.809. Niveles de 400 y 40 km. 100 % tierra (es interior, como preveia el plan).
    - San Sebastian: 5 coordenadas, a 40 m, needR 3.361.566. Niveles de 400, 40 y 9,1 km (8,9 m/px, maxR 10 M).
    - Nueva York: 6 coordenadas, a 167 m, needR 803.474. Niveles de 400 y 40 km.
    - Mirado a ojo, en un mosaico de los 7 niveles (`preview2.png`, en el scratchpad): se reconocen la costa vasca y las Landas, la bahia de La Concha, y Manhattan con el Hudson y el East River.
  - **`land-mask.png` identico:** regenerado con el rasterizador comun, mismo sha256 (`948d1af1…6ac9`) y 0 bytes distintos al decodificarlo.
  - **Desviaciones del plan:**
    1. **Sin dependencia `shapefile`.** Un lector propio de unas 30 lineas usa el indice `.shx` y la caja delimitadora que encabeza cada registro, y solo parsea los registros de las zonas. Se instalo y se desinstalo: `package.json` queda sin cambios. Con el paquete, el repo daba las mismas 22 vulnerabilidades de `npm audit` que sin el.
    2. **Rasterizador por lineas de barrido** (`scripts/lib/land-raster.mjs`), no la comprobacion punto a punto del script del mundo, que con los vertices de OSM seria demasiado lenta. Usa la misma formula y la misma comparacion (`lng < x`), por eso la mascara del mundo sale identica.
    3. **Paridad por poligono.** La primera pasada pintaba lineas de mar en los bordes de las teselas de 1°: los poligonos partidos de OSM se solapan un poco en esos bordes, y una regla par/impar global cuenta el solape dos veces. Ahora la paridad es por poligono y se unen los poligonos. Antes del arreglo San Miguel daba 99,9 % de tierra (una fila de mar entera, la 771); despues, 100 %.
  - La GeoJSON de Natural Earth se descargo para comprobar el hash y se borro despues, como dice la cabecera del script
- [x] **T5** · Deriva y umbral de inercia escalados por `min(1, 974 / R)`
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: con R ≤ 974, la deriva medida con la sonda (lambda0 en 2 s) es igual a la de la linea base. Con R forzado alto se mueve menos de 1 px/frame en pantalla
  - **Hecho 2026-11-02.** `navScale(R)` y `NAV_SCALE_REF_R = 974`, aplicados a la deriva y a los dos usos de `INERTIA_STOP_RAD`. Medido con la sonda en `evidencia/2026-11-02_016-deriva-y-vuelta.txt`:
    - R 256 (encuadre por defecto): 1,5018 °/s, igual que los 1,5 °/s de `IDLE_DRIFT_DEG_PER_SEC` (`:4`).
    - R 4563: 0,32 °/s, 22,9 px/s en pantalla, 0,38 px/frame (`:6`).
    - R 228.337 (San Sebastian): 17,7 px/s, 0,30 px/frame (`:11`). En pantalla la velocidad queda en el orden de la de R 974, como pide el plan
- [x] **T6** · Mascaras locales en el dibujo: carga perezosa, mascara mas fina por punto y fundido de 200 ms al cargar (sin fundido con reduced motion)
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: sin cambiar aun el limite, ningun PNG local se pide en red (no se pasa de 4563). Forzando la carga, 0 errores de consola
  - **Hecho 2026-11-02, junto con T7** (la carga solo se puede provocar con el limite nuevo; por eso no hubo "forzar" aparte). Medido en `evidencia/2026-11-02_016-deriva-y-vuelta.txt`:
    - Rueda hasta el techo con el centro fuera de toda zona: R 4563 y **ningun PNG local pedido** (`:5`).
    - Centro en San Sebastian: se piden sus 3 niveles, del mas basto al mas fino (`:9`), y ninguno de las otras zonas. 0 errores de consola (`:7`, `:15`).
  - **Desviaciones del plan:**
    1. **La carga empieza a R ≥ 0,5 × 4563**, no "al pasar de 4563": el techo solo sube cuando hay un nivel cargado que cubre el centro (si no, se dibujarian los escalones de 20 km de la mascara del mundo), asi que esperar a pasar de 4563 era circular.
    2. **Ademas del fundido de 200 ms al llegar, una rampa por R** (de 0,5 a 0,6 × 4563): por debajo se dibuja la mascara del mundo como siempre, y cruzar ese R en cualquier sentido nunca hace saltar puntos. Es un fundido cruzado (los puntos que siguen siendo tierra no parpadean), no un fundido desde vacio.
    3. **Decodificacion con `fetch` + `createImageBitmap`**, fuera del hilo principal; en el hilo solo queda el `getImageData`.
- [x] **T7** · `maxR` por posicion (limite de la mascara mas fina que cubre el centro, tope del R necesario de la zona), con vuelta al limite al salir de una zona. `ZOOM_MAX_MULT` se retira
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: seccion `atlas`, CA2 (par de 40 m de San Sebastian a mas de 14 px), CA3 (0 frames > 50 ms durante la rueda hasta el maximo), CA10 (0 parejas fuera de zona) y CA11 (R ≤ 4563 fuera de zona). Salida en `evidencia/AAAA-MM-DD_016-zoom.txt`
  - **Hecho 2026-11-02.** `currentMaxR()` (nivel cargado mas fino bajo el centro, tope `needR`; 4563 fuera), vuelta al techo en `tick` con la curva del recentrado (interpolada en escala logaritmica; al instante con reduced motion), `ZOOM_MAX_MULT` retirado. `MSYS_NO_PATHCONV=1 node scripts/diagnostico.mjs --medir /atlas`: 11 de 20 (antes 9), 0 errores de consola, buffer del canvas = caja x dpr. Salida: `evidencia/2026-11-02_016-zoom.txt`:
    - **CA2:** R final 3.361.566 y el par de 40 m a 21,0 px (`:53`). Grupos pulsados por el camino: 11 → 8 → 7 → 4 → 3 fotos (`:52`).
    - **CA3:** 0 frames > 50 ms en 243 frames de rueda, el peor de 33 ms (`:54`).
    - **CA10:** 0 parejas fuera de zona (`:69`). **CA11:** R 4563 fuera de zona (`:71`).
    - **Vuelta al techo:** desde R 59.254 arrastrando hacia el mar, R vuelve a 4563 en 583 ms (`evidencia/2026-11-02_016-deriva-y-vuelta.txt:14`).
  - **CA2 cambia de procedimiento en el diagnostico** (`zoomFollowing`): un grupo se recentra en la media de sus fotos. La del grupo de 11 cae a unos 60 km de San Sebastian, y al hacer zoom hacia el centro el par salia de la pantalla en R 228.337 (techo del nivel de 400 km). Ahora se hace lo que haria un visitante: rodar y, cada vez que el grupo del par se parte, pulsar el subgrupo. Solo se pulsan grupos: un primer intento pulso una foto suelta, que hoy navega al album, y la medida acabo en otra pagina. **CA3 descuenta los frames de cada clic** (recentrado y panel de lista, que en T12 se sustituye por el visor, con sus propias medidas CA4 a CA8).
  - **Coste de dibujo.** Con el recorrido de clics, CA3 dio 1 a 3 frames de 67 ms. HEAD tiene los mismos picos en el mismo tramo de zoom (hasta 62 ms dibujando la reticula a R ≈ 630 en el encuadre por defecto, medido hoy), que T3 no vio porque medio con el globo centrado en San Sebastian. Un perfil de CPU mostro que el coste era pintar, no calcular. Se hicieron tres cambios:
    1. Los puntos opacos van en un solo trazado y se rellenan una vez; los del borde del disco (alfa < 1) siguen punto a punto.
    2. La proyeccion va en linea, con la trigonometria de fila fuera del bucle.
    3. Cada fila se limita a su semiesfera visible, y se saltan los puntos fuera del canvas. En el encuadre por defecto se recorren 8401 puntos (antes 15.617) para los mismos 3184 pintados (`:51`).
  - **Mismo dibujo:** comparado pixel a pixel con HEAD en los tres estados de T3 (en el tercero, 2 pasos de rueda en vez de 12, porque HEAD no pasa de 974), salen 1, 5 y 0 pixeles distintos, todos en el borde del disco y como mucho de 13/255: los puntos semitransparentes se pintan ahora despues de los opacos. Salida en la conversacion
  - La sonda gana `localMasks()` y `latticeCount().ms` (coste de la ultima pasada de la reticula)
- [x] **T7b** · Enmienda 2: el clic en un grupo acerca hasta partirlo, y San Miguel de Allende se queda sin zona
  - Fichero(s): `src/motion/Atlas.tsx`, `scripts/generate-atlas-local-masks.mjs`, `src/data/atlas-zones.json`, `public/atlas/local/`, `scripts/diagnostico.mjs`
  - Comprobacion: CA13, CA10 con la ciudad excluida y CA2, CA3 y CA11 en verde
  - **Hecho 2026-11-02.** Javi probo T5 a T7 en su maquina ("El resto esta genial") y decidio las dos cosas de la enmienda 2 de `spec.md`.
    - **San Miguel de Allende:** `EXCLUDED_CITIES` en el script de zonas. Al regenerar salen 2 zonas y 5 mascaras: se borran las 2 de San Miguel, y las de San Sebastian y Nueva York salen identicas, sin cambios en git. `atlas-zones.json` gana `excludedCities`, que CA10 acepta.
    - **Clic en un grupo:** `splitR()` calcula el objetivo, 1,5 x 14 px / (mayor arista del arbol minimo de sus fotos). Si es alcanzable en ese sitio (`possibleMaxR`: la zona mas fina que lo cubre, cargada o no), el globo gira y acerca a la vez, y en ese mismo clic se piden las mascaras de la zona. Si no, se abre el grupo: hoy el panel de lista, en T12 el visor. Durante el zoom del clic no actua la vuelta al techo. La rueda lo cancela. Con reduced motion salta al final.
    - `MSYS_NO_PATHCONV=1 node scripts/diagnostico.mjs --medir /atlas`: 12 de 21, 0 errores de consola. Salida en `evidencia/2026-11-02_016-clic.txt`:
      - **CA13:** el grupo de 11 fotos pasa de R 256 a 653 y se parte en 8 + 3. La media queda a 0,00 px del centro, sin frames > 50 ms (peor 17 ms).
      - **CA2:** sigue pasando, ahora con 28 pasos de rueda en vez de 67, porque los clics acercan.
      - **CA3, CA10 y CA11** siguen en verde.
    - **CA4 y CA8** pulsan ahora el grupo de una foto con coordenadas repetidas hasta que se abre (`openGroup`). Eligen Puerto Escondido, 3 fotos `city` en un mismo punto, que se abre al primer clic.
  - **Ajuste (Javi, 2026-11-02):** los grupos que no se pueden partir (San Blas, Puerto Escondido) no acercaban nada. Ahora acercan hasta una vista regional de 2500 km en el lado corto del canvas y luego se abren; el panel provisional se coloca en el centro, donde queda el grupo. Medido: Puerto Escondido se abre a R 1551, y CA2, CA3, CA10, CA11 y CA13 siguen en verde, con 0 errores de consola. Salida en `evidencia/2026-11-02_016-clic-region.txt` (`:59`)
- [x] **T8** · Cita de OpenStreetMap junto a la leyenda, solo en el atlas (`/credits` no se toca, decision de Javi)
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: CA12

  - **Hecho 2026-11-02** (`e3cd5d0`). Debajo de la leyenda, 11 px `#A8A8A8`: "Map data © OpenStreetMap contributors", con enlace a openstreetmap.org/copyright (el unico punto de la leyenda que recibe clics). CA12 pasa (`evidencia/2026-11-02_016-visor.txt:76`)
## Visor

- [x] **T9** · `AtlasMark` gana `capture` y `order`, y `page.tsx` ordena las marcas por album y foto
  - Fichero(s): `src/app/atlas/page.tsx`, `src/motion/Atlas.tsx` (tipo)
  - Comprobacion: tsc ok. `clusters()` devuelve los miembros de cada grupo en el orden del album
  - **Hecho 2026-11-02** (`5196376`). `AtlasMark` gana tambien `albumTitle`, para el enlace del visor. tsc ok. Las marcas salen en el orden de `getOrderedAlbums()` y, dentro de cada album, en el de `getPhotosByAlbum()`. `albumPhotoIndex` sigue siendo el mismo indice que antes. El orden dentro de un grupo lo comprueba CA5
- [x] **T10** · `AtlasViewer`: foto grande sin recortar, informacion (DMS solo si es `exact`), enlace al album, entrada en 200 ms y estado final directo con reduced motion
  - Fichero(s): `src/components/AtlasViewer.tsx`
  - Comprobacion: tsc y lint ok (todavia no se monta)
  - **Hecho 2026-11-02, junto con T11 y T12.** `src/components/AtlasViewer.tsx`. Tambien contiene `toDMS`, que sale de `Atlas.tsx`, y `atlasViewerWidth()`: `min(520, max(min(280, vw), 0,4·vw))`, con un minimo de 280 px solo para que no se rompa en el movil. La entrada es `.atlas-viewer` en `globals.css`: keyframes de opacidad y 16 px, y `animation: none` con reduced motion.
  - **Pie de foto:** sigue el del album (`src/motion/AlbumPhotos.tsx:154-174`): titulo en serif cursiva de 20 px, ciudad y pais en mayusculas de 12 px, y captura en mayusculas de 12 px `#A8A8A8`. No usa los "14 px `#666`" del plan, para que la misma informacion se vea igual en los dos sitios. El contador `01 / 03` si va en 14 px `#666`.
  - **Posicion de la foto:** pegada al pie de foto. Centrada en su hueco, una foto horizontal dejaba mucho blanco hasta el texto; se vio en una captura de comprobacion
- [x] **T11** · Tira de miniaturas a la misma altura, la actual con `scale`, flechas, ← →, Esc
  - Fichero(s): `src/components/AtlasViewer.tsx`
  - Comprobacion: tsc y lint ok
  - **Hecho 2026-11-02.** Miniaturas a 56 px de alto, enteras y con su propio ancho. La actual crece con `scale(1.15)` desde abajo y las demas quedan al 55 % de opacidad. ‹ › y ← → dan la vuelta al llegar al final, y Esc cierra
- [x] **T12** · Visor montado en `Atlas.tsx` en lugar del panel de grupo y del `router.push` de la foto suelta; centro del globo desplazado al espacio libre mientras esta abierto
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: seccion `atlas`, CA4 a CA8. 0 errores de consola

  - **Hecho 2026-11-02.**
    - El visor sustituye al panel de lista y al `router.push` (se quitan `useRouter` y `clusterPanel`).
    - Un grupo que no se puede partir, o una foto suelta, acerca a la vista regional y abre el visor. La foto suelta tambien acerca, como se le propuso a Javi el 2026-11-02 para que todo se comporte igual.
    - El centro del globo se desplaza la mitad del ancho del visor (`centerShiftRef`, con la curva del recentrado). El desplazamiento arranca en el mismo clic que el giro, para que no haya un segundo movimiento al abrirse. Si un arrastre corta el giro, el desplazamiento se deshace.
    - Con el visor abierto, "Reset View" se aparta a su izquierda. "Reset View" tambien cierra el visor.
  - `MSYS_NO_PATHCONV=1 node scripts/diagnostico.mjs --medir /atlas`: **21 de 21**, 0 errores de consola. Salida en `evidencia/2026-11-02_016-visor.txt`:
    - **CA4:** visor abierto en Puerto Escondido (3 fotos), foto entera, 3 miniaturas (`:60-63`).
    - **CA5:** 05 → 06 → 07 (`:65`). **CA7:** sin DMS (`:66`).
    - **CA6:** tapa el 36,1 % del canvas y el globo gira con un arrastre (`:67-69`).
    - **CA8:** opacidad 1 y `transform: none` en la primera muestra (`:71`).
  - **Capturas de comprobacion** (`next dev`, 1440x900, en el scratchpad de la sesion):
    - Grupo de Puerto Escondido: entra Centroamerica entera, y la marca queda en x = 460, el centro del espacio libre.
    - Foto suelta de Xilitla (`city`): el visor no muestra coordenadas
## Cierre

- [ ] `docs/atlas-data-sources.md` (OSM, ODbL, regenerar), `docs/design-spec-v2.md` §5 y changelog, y `CLAUDE.md` (linea del atlas, licencia)
- [ ] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/AAAA-MM-DD_016-completo.txt` (CA1)
- [ ] Contra produccion despues del push de Javi: `evidencia/AAAA-MM-DD_016-produccion.txt`
- [ ] CA9: Javi lo prueba en su maquina y en el movil (testimonio aqui)
- [ ] Estado de `spec.md` → Implementada

# Plan 017 · Version multidispositivo: medir iPhone e iPad

- **Spec:** `spec.md` (aprobada el 2026-11-03)

## Enfoque

Un modo de dispositivo dentro de `scripts/diagnostico.mjs`, activado por flags, que no altera la pasada de escritorio. Sin flags, el script hace exactamente lo de hoy (CA1).

**Flags nuevos:**

| Flag | Valores | Por defecto |
|---|---|---|
| `--dispositivo` | `iphone`, `iphone-max`, `ipad-mini`, `ipad` | ninguno: escritorio |
| `--horizontal` | (sin valor) | vertical |
| `--motor` | `chromium`, `webkit` | `chromium` |
| `--cpu N` | entero ≥ 1 | 1 |

**Contexto del navegador.** Con `--dispositivo`, cada contexto se abre con el perfil de Playwright (`devices["iPhone 13"]`, etc.) en vez de `{ viewport: 1440x900, deviceScaleFactor: 1 }`. El perfil trae viewport, dpr, `isMobile`, `hasTouch` y user agent. Los diez literales de 1440x900 (`scripts/diagnostico.mjs:205`, `:329`, `:482`, `:583`, `:626`, `:708`, `:809`, `:924`, `:990`, `:1124`) pasan a leer una sola constante `CTX`. En escritorio, `CTX` vale lo mismo que hoy. `launchBrowser` (`:59-60`) elige motor con `--motor`, conservando el bypass de Vercel.

**Que secciones corren en modo dispositivo:**

| Seccion actual | En dispositivo | Motivo |
|---|---|---|
| tsc, lint, build | igual | no dependen del navegador |
| invariantes por ruta (`:231-315`) | si (CA3) | son las del sitio, valen en cualquier viewport |
| barra de scroll (`:317-406`) | solo la proporcion y el encaje de las fotos (CA5) | la barra en si no existe en iOS; el gesto se mide aparte |
| llegada al album, scroll del album, textos del album, descifrado, atlas de escritorio | omitidas, con "omitido (--dispositivo)" | sus umbrales y acciones (rueda, hover, posiciones a 1440) son de escritorio; meterlas daria fallos sin sentido. Las specs de arreglo decidiran cuales se adaptan |
| entrada `/` (`:821-954`) | si (CA8), con el perfil y con `--cpu` | ya es informativa |

**Secciones nuevas,** solo en modo dispositivo:
- `cabecera dispositivo` (CA2): lo que mide el navegador. Usa `'ontouchstart' in window` y `matchMedia`, no `maxTouchPoints`.
- `fotos del landing` (CA4):
  - Por cada `.landing-photo`, su caja, su `opacity`, si interseca el viewport, y si el canvas pinta su plano.
  - Para saber si el canvas pinta, se hace `page.screenshot` recortado al centro de la caja y se decodifica en una pagina auxiliar, como ya hace `llegada al album` (`:447-459`). Asi funciona en los dos motores, sin screencast de CDP.
  - Se mide en 0, 1, 2 y 3 alturas de scroll. El scroll se hace con `window.scrollTo` y no con gesto, para no mezclar CA4 con CA6.
- `gestos` (CA6):
  - Chromium: CDP `Input.dispatchTouchEvent` para el scroll nativo de `/` y del album, que en movil puede que Lenis ni toque.
  - Los dos motores: `PointerEvent` sinteticos con `pointerType: "touch"` en el carrusel (`AlbumsCarousel.tsx:890-939`) y el atlas (`Atlas.tsx:1216-1227`, que hace el pellizco con dos `pointerId`). Ambos escuchan eventos de puntero de React.
  - El scroll nativo en WebKit no se puede provocar con eventos sinteticos: sale `NO MEDIBLE`.
  - El valor antes y despues sale de `scrollY`, del indice de la diapositiva abierta (el contador `NN / NN`, `AlbumsCarousel.tsx:1000`) y de `window.__atlas` (`Atlas.tsx:628`).
- `visor del atlas` (CA7): tocar una marca sola con el mismo metodo que la seccion `atlas` de hoy (posicion de pantalla leida de `window.__atlas`) y medir la caja de `.atlas-viewer`.
- `fluidez del atlas` (CA9):
  - Un muestreo de rAF instalado antes de los scripts del sitio, igual que el sampler de la entrada (`:834-863`), durante 2 s de arrastre sintetico y un pellizco.
  - Saca la mediana, el p95 y los frames > 50 ms.
  - La referencia de escritorio sale del mismo codigo, sin `--dispositivo`. Se activa con `--fluidez-atlas`, para no alargar el diagnostico normal.

**CPU×4:** `Emulation.setCPUThrottlingRate` de CDP, como en `scripts/medir-carrusel.mjs:268`. Solo existe en Chromium: con `--motor webkit --cpu 4`, la cifra sale como `NO MEDIBLE (sin CDP)`, nunca como si fuera a CPU×1.

**Codigo compartido.** La tabla de dispositivos, el lanzador por motor, los gestos y el muestreo de frames van a `scripts/lib/dispositivo.mjs`. Asi `diagnostico.mjs` no crece otras 400 lineas sin estructura. El patron es el mismo que `scripts/lib/land-raster.mjs`.

**Alternativa descartada:** un script aparte (`scripts/diagnostico-movil.mjs`). Duplicaria las invariantes por ruta, que son la cicatriz de este proyecto. Con dos copias, tarde o temprano una se quedaria atras.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/lib/dispositivo.mjs` | crear | Tabla de los 4 perfiles con su clave, el lanzador por motor, los gestos tactiles (CDP y `PointerEvent`) y el muestreo de frames por rAF |
| `scripts/diagnostico.mjs` | modificar | Flags `--dispositivo`, `--horizontal`, `--motor`, `--cpu` y `--fluidez-atlas`. Constante `CTX` en lugar de los 10 literales, secciones omitidas en modo dispositivo, las 5 secciones nuevas, y la cabecera y el RESUMEN con el dispositivo |
| `specs/017-version-multidispositivo/tasks.md` | modificar | Tareas, comprobaciones y el testimonio de Javi (CA12) |
| `docs/ESTADO.md` | modificar | Tabla de la linea base y la lista de specs de arreglo (CA11) |
| `CLAUDE.md` | modificar | Una frase en el parrafo de invariantes del diagnostico: existe el modo dispositivo y como se lanza |
| `src/` | ninguno | Fuera de alcance |

No entra ninguna imagen nueva en el repo: el espejo (`.github/workflows/mirror.yml`) no necesita excepciones.

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Al sustituir los 10 literales por `CTX` cambia algo de la pasada de escritorio | Baja | Alto: se pierde la linea base de 174 | T1 lo hace solo, y se compara linea a linea el bloque de invariantes con `evidencia/2026-11-02_diagnostico.txt` (CA1). B11 se trata como intermitente |
| Los perfiles emulados no se parecen a un iPhone real (WebKit de Windows no es Safari de iOS; Chromium emulado tampoco) | Alta | Medio: una cifra puede no reproducirse en el dispositivo | Se mide en los dos motores y el testimonio de CA12 contrasta. Una diferencia se anota como defecto del harness, no se corrige el sitio por ella |
| Los gestos sinteticos no recorren el mismo camino que un dedo real (por ejemplo, Lenis sin `syncTouch`) | Media | Medio | Cada gesto imprime antes y despues. Lo que no se pueda provocar sale `NO MEDIBLE`, nunca un aprobado. CA12 lo cubre |
| La lectura de pixel confunde "canvas no pinta" con "foto clara sobre fondo claro" | Media | Medio: un falso "no se ve" en CA4 | Se lee una zona interior (con `ARRIVAL_INSET_PX`, `:417`), no un pixel. Se cuenta la fraccion distinta del fondo, como `ARRIVAL_BLANK_MAX_FRACTION` (`:420`), y en cada foto dudosa se guarda el recorte en el scratchpad para mirarlo |
| 16 combinaciones, mas la CPU×4, tardan mucho | Alta | Bajo | Cada combinacion es un comando aparte, con `--skip-build`. T9 los lanza en bucle, en segundo plano |
| `next build` mientras Javi tiene `npm run dev` abierto le rompe el servidor (memoria del proyecto) | Media | Bajo | Todas las pasadas de dispositivo van con `--skip-build`. El diagnostico completo de cierre se lanza solo cuando Javi haya parado su servidor |

## Vuelta atras

- **Rama:** `feat/017-version-multidispositivo`. La crea Javi: el agente no tiene permiso para `git switch` (`docs/ESTADO.md`, "Rama").
- **Como se revierte:** `git revert` del commit o los commits de la rama. No toca `src/`, asi que el sitio desplegado no cambia en ningun caso.
- **Que invariante avisaria de que esto ha roto algo:** CA1, el diagnostico de escritorio sin flags, con 174 invariantes y el mismo resultado que `evidencia/2026-11-02_diagnostico.txt`. Si da otro numero o un fallo nuevo, el cambio de `CTX` o del lanzador ha tocado la pasada de escritorio.

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| `node scripts/diagnostico.mjs --skip-build`, comparado con el 2026-11-02 | CA1 | `evidencia/2026-11-0X_017-escritorio.txt` |
| Las 16 combinaciones con `--skip-build --dispositivo <d> [--horizontal] --motor <m>` | CA2 a CA7 | `evidencia/2026-11-0X_017-linea-base-<motor>-<d>[-h].txt` |
| Las 8 combinaciones de Chromium con `--repeticiones 3 --cpu 4`, y las 16 con `--repeticiones 3` | CA8 | en las mismas salidas, o `...-cpu4.txt` |
| `--fluidez-atlas` en las 16 combinaciones, con y sin `--cpu 4` en Chromium, mas escritorio | CA9 | `evidencia/2026-11-0X_017-fluidez-atlas.txt` |
| `ls evidencia/*017-linea-base*` | CA10 | — |
| `grep -n "017" docs/ESTADO.md` | CA11 | — |
| Javi en su iPhone 13 y su iPad mini 5 sobre la preview de la rama | CA12 | testimonio en `tasks.md` |
| `VERCEL_BYPASS=... node scripts/diagnostico.mjs --url <preview> --dispositivo iphone`, y lo mismo contra produccion | CA13 | `evidencia/2026-11-0X_017-preview.txt` |

La regla deny `Write(evidencia/**)` (`.claude/settings.json`) obliga a copiar cada salida a mano. El agente la deja en el scratchpad con el nombre final y Javi la copia, como hasta ahora (`docs/ESTADO.md`, "Esperando a").

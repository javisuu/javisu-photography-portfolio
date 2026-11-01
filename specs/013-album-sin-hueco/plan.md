# Plan 013 · Pagina de album sin hueco al llegar

- **Spec:** `spec.md` (aprobada el 2026-10-31)

## Enfoque

Primero se mide y despues se cambia. La seccion nueva `llegada al album` de `scripts/diagnostico.mjs` se escribe antes que el arreglo, y tiene que dar rojo sobre el codigo de hoy. Asi se demuestra que ve el hueco.

En `src/motion/AlbumPhotos.tsx`, la fila de la foto 1 (`[data-photo-index="0"]`, padre directo de su `<img>`, con el pie dentro) se monta con `opacity: 0` inline, tambien en el HTML del servidor. Si empezara visible, la carga directa repetiria el parpadeo de hoy. `GLSurface` recibe `readyNodeCount={1}` y `onTexturesReady`. Cuando dispara, un bucle de rAF escribe la `opacity` inline de esa fila de 0 a 1 en 400 ms con ease-out.

El fundido tiene que ser por rAF y no una `transition` de CSS. `GLSurface` lee `node.parentElement.style.opacity`, el valor inline (`src/motion/GLSurface.tsx:421`). Con una `transition`, ese valor salta a `1` de golpe y el plano GL, que es lo que se ve con GL activo, apareceria sin fundido. Es el mismo patron que la entrada del landing (`docs/design-spec-v2.md:159`).

Hay tres salidas que no esperan a la textura:
- Si `onAvailabilityChange(false)`, la fila pasa a 1 sin esperar.
- Si `onTexturesReady` no llega en 1,5 s, arranca el fundido igualmente.
- Con `prefers-reduced-motion`, la fila pasa de 0 a 1 en un solo frame cuando llega la senal.

La foto 1 lleva `preload` y `fetchPriority="high"`.

**Descartado:** cambiar `GLSurface` para ocultar cada `<img>` por separado (opcion 2). Lo descarto Javi.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/diagnostico.mjs` | modificar | Seccion nueva `llegada al album`, ver "Verificacion" |
| `src/motion/AlbumPhotos.tsx` | modificar | `opacity` inline de la fila 0, fundido por rAF, `readyNodeCount={1}` y `onTexturesReady` en `<GLSurface>`, salida sin GL, tiempo maximo de 1,5 s, reduced motion, y `preload` + `fetchPriority="high"` en la foto 1 |
| `src/app/album/[slug]/page.tsx` | modificar | Solo el comentario de las lineas 44-46, que dice que el Flip es la entrada |
| `docs/design-spec-v2.md` | modificar | §3 (`:43`): la entrada es el fundido de la foto 1, sin transicion desde el carrusel. §2 (`:38`): fuera la frase del jump-into. Motion inventory #4 (`:83`): retirado, con fecha y motivo. Entrada nueva en el registro de cambios |
| `CLAUDE.md` | modificar | Stack: GSAP sin uso previsto. Build order §3: fuera el "jump-into transition", y la linea de "Current focus". Architecture rules: `AlbumPhotos` pasa a ser el primer llamador de `onTexturesReady`/`readyNodeCount` (hoy dice que no los usa nadie) |
| `docs/ROADMAP.md` | modificar | F3, tarea 9: "Retirada (2026-10-31, spec 013)" |

`src/motion/GLSurface.tsx` no se toca.

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Cambiar la identidad de `onAvailabilityChange` o `readyNodeCount` relanza el efecto de `GLSurface`, que reconstruye la escena entera (`src/motion/GLSurface.tsx:459`) | Media | Alto | `readyNodeCount` es la constante `1`. `onAvailabilityChange` sigue siendo un setter de `useState` (estable). `onTexturesReady` se lee por cierre y no esta en las dependencias (`:453-458`), pero se pasa igual una funcion estable (`useCallback` sin dependencias, que escribe en refs) |
| Sin JavaScript, la foto 1 no se ve nunca (empieza a `opacity: 0` en el HTML) | Baja | Medio | Una regla `<noscript>` con `opacity: 1 !important` para `[data-photo-index="0"]`. Si choca con el React de la pagina, se acepta y se apunta en `docs/ESTADO.md` |
| El fundido de 400 ms retrasa la foto respecto a hoy, donde aparece de golpe | Alta | Bajo | Es el objetivo. CA5 acota el retraso a la linea base mas el fundido, y Javi ajusta la duracion viendolo |
| Leer pixeles del screencast da falsos "en blanco" (compresion JPEG, bordes, sombras) | Media | Medio | Se mide solo el interior de la caja de la foto 1 (menos 8 px por lado), con ±2 por canal sobre `#FAFAFA`, y la seccion tiene que dar rojo antes del arreglo (T2) |
| `--disable-3d-apis` no impide crear un contexto WebGL en el Chromium de Playwright | Baja | Bajo | T2 comprueba que `onAvailabilityChange(false)` se cumple: la `<img>` queda `visible` |

## Vuelta atras

- **Rama:** `feat/013-album-sin-hueco`, creada por Javi desde `main`. El agente no puede hacer `git switch`.
- **Como se revierte:** `git revert` de los commits de `src/motion/AlbumPhotos.tsx`. La seccion del diagnostico y los cambios de documentacion pueden quedarse.
- **Que invariante avisaria de que esto ha roto algo:** `llegada al album` (hueco y parpadeo), `textos del album` (la fila 0 no debe cambiar de geometria), `barra de scroll` (proporcion de las fotos y canvas = viewport en el album) y 0 errores de consola.

## Verificacion

La seccion `llegada al album`, para cada uno de los 4 albumes o el que se pida con `--medir`:
- Pasadas: carrusel → album, NEXT ALBUM y carga directa, con `--repeticiones N`.
- Una pasada con `reducedMotion: "reduce"`.
- Una pasada en un Chromium propio con `--disable-3d-apis`.
- Muestras por rAF: `opacity` inline de la fila 0, `visibility` y `complete` de su `<img>`, y su caja.
- Fotogramas de `Page.startScreencast`. Cada fotograma se decodifica en la propia pagina (`createImageBitmap` y `getImageData`) y se clasifica como "en blanco", "con foto" o "parcial" segun el interior de la caja de la foto 1.

| Comprobacion | CA | Salida |
|---|---|---|
| Linea base con la seccion nueva, sobre el codigo de hoy, en local y en produccion | CA2, CA3 y CA5 (base) | `evidencia/2026-10-31_013-linea-base-diagnostico.txt` y `evidencia/2026-10-31_013-linea-base-produccion.txt` |
| `node scripts/diagnostico.mjs` completo despues del arreglo | CA1 a CA8 en local | `evidencia/AAAA-MM-DD_013-completo.txt` |
| `node scripts/diagnostico.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 3` tras el push | CA2 a CA6 en produccion | `evidencia/AAAA-MM-DD_013-produccion.txt` |
| Javi abre los albumes en su maquina | CA9 | Testimonio en `tasks.md` |

La salida va al scratchpad y Javi la copia a `evidencia/`, por la regla deny.

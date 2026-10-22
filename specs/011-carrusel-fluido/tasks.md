# Tareas 011 · Carrusel fluido

- **Plan:** `plan.md` (aprobado el 2026-10-22)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. Cada tarea que toca `src/` va en un commit propio de `feat/011-carrusel-fluido` (plan, "Vuelta atras"). Las salidas van al scratchpad; Javi las copia a `evidencia/` con los `cp` que le de el agente.

Orden: primero la medida, despues lo que no cambia el aspecto (fisica por tiempo, escrituras, `memo`, contra-escala) y al final lo que si lo cambia (muelle, cola, grano).

- [x] **T1** · Script de medida en el repo (CA1)
  - Fichero(s): `scripts/medir-carrusel.mjs` (crear)
  - Cambio: junta `medir-carrusel-album.mjs` y `medir-pliegue.mjs` del scratchpad, con `--url`, `--cpu`, `--repeticiones`, `--geometria`, `--fps 30|120` y `--trace` (plan, parte 0). Escenarios: llegada, trackpad, raton, fling fuerte, rafaga, giro brusco, paso y paso atras. Cuenta tambien las escrituras por frame de `width`, `left`, `right` y `filter` (`MutationObserver`) y los albumes avanzados por fling
  - Comprobacion: `node scripts/medir-carrusel.mjs --url https://javisu-photography-portfolio.vercel.app --cpu 1` y `--cpu 4` reproducen las cifras del scratchpad: 3 o mas a medio plegar en el fling fuerte, salto max 58–63 px, p95 de rueda 33–50 ms a CPU×1. Salida: `2026-10-2X_011-linea-base-repo.txt`
  - **Hecho, con tres desvios de la medida, no del sitio.** Salidas (`--repeticiones 3`): `2026-10-22_011-linea-base-repo-cpu1.txt` y `-cpu4.txt`.
    - **Muestreo.** Las cajas tienen que leerse despues del tick del carrusel en el mismo frame. Leidas antes, el script vio saltos de 558 px que no se pintan: el render de React del commit escribe el ancho de "abierta" en la diapositiva nueva y el tick siguiente lo sobrescribe antes de pintar. Se leen en una microtarea encolada cuando la pagina pide su siguiente frame.
    - **La medida alteraba la cadencia.** Una primera version juntaba todos los callbacks de rAF de la pagina en uno; con eso la rueda daba p95 16,8 ms, y con los callbacks nativos 33,4 ms, en la misma hora. A 60 fps quedan nativos; el envoltorio solo se usa con `--fps`.
    - **Salto: 37–39 px, no 58–63.** Es el mismo salto (el borde derecho de la diapositiva que se cierra, cuando arranca el pliegue de la siguiente). El script del scratchpad tomaba como mediana el elemento 3 de 6 ordenados; con la mediana de verdad, el mismo frame da 38 px. Comprobado volviendo a pasar el script viejo con los tiempos de frame: 59,1 px en el fling, con frames de 17 ms. El salto se normaliza ademas a px por 16,67 ms, para que un frame perdido no cuente como salto.
    - **Cadencia muy variable.** La mediana de 3 pasadas dio p95 16,7–16,8 ms en todos los escenarios, a CPU×1 y ×4. Pasadas sueltas de la misma tarde dieron p95 33–50 ms. El script da tambien la peor pasada.
  - Linea base, mediana de 3, produccion `78e6737`:
    - **Pliegue:** frames con 3 o mas a medio plegar: fling fuerte 209 (max 5 a la vez), rafaga 60, giro 0, paso 0. Salto max: 37,6 · 37,1 · 19,9 · 4,6 px.
    - **CA9:** el fling fuerte avanza **11 albumes** y se para a los **804 ms** de la ultima entrada.
    - **Escrituras por frame en movimiento:** width 0,7–4, left/right 0, filter 0,1–0,2. En reposo, 1,3 mutaciones de `style` por frame (`div.absolute`, sin cambio de `width` ni `transform`).
    - **Estilo por frame:** 0,45–0,59 ms a CPU×1 y 1,2–1,8 ms a CPU×4. La evidencia del scratchpad decia 9–15 ms a CPU×4; aqui no se reproduce.
    - **Llegada:** CPU×1 frame max 33 ms; CPU×4 frame max 167 ms y una long task de 159 ms. 7 portadas en pantalla, 6 de ellas `lazy`.
- [x] **T2** · Geometria de referencia (CA7)
  - Fichero(s): ninguno
  - Comprobacion: `medir-carrusel.mjs --url <produccion> --geometria` guarda caja y recorte de cada marco en reposo, al llegar y tras `ArrowRight`, `ArrowRight`, `ArrowLeft`. Salida: `2026-10-2X_011-geometria-antes.json`. Una segunda pasada da 0 px de diferencia con la primera (si no, la medida no sirve como referencia)
  - **Hecho.** `2026-10-22_011-geometria-antes.json` y `.txt`: segunda pasada a **0 px** en los 5 estados. Se anadio un segundo `ArrowLeft`: el primero no llega a cambiar de album (contador 03 → 03), asi que sin el no se comprobaba ningun commit hacia atras.
  - **CA8 ya se cumple hoy, tal como esta escrito.** A 30 y a 120 fps el reposo da 0–0,1 px frente a 60. La fisica por frame recorre la misma distancia en el mismo numero de frames, sea cual sea la frecuencia; lo que cambia es el tiempo. Para que T3 tenga algo que medir, `--geometria` da tambien el tiempo hasta el reposo (`2026-10-22_011-fps-antes.txt`). Con `ArrowLeft 1`, que solo mueve la tira: **694 ms a 60 fps, 344 a 120 y 1402 a 30**. Es decir, a 120 Hz la tira va al doble de velocidad.
- [ ] **T3** · Fisica por tiempo (CA8)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: friccion, avance e impulsos escalados por `dt / 16.67` (plan, parte 1). Las constantes no cambian
  - Comprobacion: `--geometria` local a 60 fps = T2 (±1 px); con `--fps 30` y `--fps 120`, la misma diapositiva abierta y el mismo reposo (±1 px). tsc y lint ok
- [ ] **T4** · Escrituras solo si cambian y `memo` por diapositiva (CA3, CA4)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: cada diapositiva guarda lo ultimo escrito y no lo reescribe si es igual. La diapositiva pasa a un componente con `React.memo`; un commit re-renderiza solo las dos que cambian de `isActive`. Blur y velo siguen igual en esta tarea
  - Comprobacion: `--geometria` = T2 (±1 px). En reposo, 0 escrituras de estilo por frame. Recalculo de estilo por frame a CPU×4, comparado con T1
- [ ] **T5** · Contra-escala (CA3, CA4, CA7; riesgo 1)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: el marco mide el ancho natural, lleva `scaleX(w / natural)` con `transform-origin` en el borde anclado, y un hijo la escala inversa. La imagen deja de escribir `left`/`right`; el anclaje congelado pasa al origen. `will-change: transform`
  - Comprobacion:
    - `--geometria` = T2 (±1 px), caja y recorte
    - 0 escrituras por frame de `width`, `left` o `right` en todos los escenarios
    - riesgo 1: captura a mitad de pliegue frente a la misma imagen en reposo, recortada a la misma zona, comparada al pixel con `sharp`. Si la diferencia media pasa de 2 niveles de gris o los bordes tiemblan, se cambia a `clip-path: inset()` y se anota aqui
- [ ] **T6** · Muelle de apertura y de `restOffsetPx` (CA6)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: `openness` y `restOffsetPx` pasan a un muelle criticamente amortiguado con `ω` ≈ 18,6 rad/s, por tiempo (plan, parte 2). Sale `OPENNESS_TAU_MS`
  - Comprobacion: salto maximo de borde ≤ 8 px por encima de su mediana en los cuatro escenarios de pliegue (hoy 58–63 px). `--geometria` = T2 (±1 px). Si no llega, se ajusta `ω` y se anota el valor
- [ ] **T7** · Un album de cada vez (CA5, CA9)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: cola de commits con `MAX_COMMITS_EN_COLA` = 1; un commit espera a que la pareja anterior quede a menos de 0,5 px y la fija exacta; tope suave de `offsetPx` mientras espera; un commit en sentido contrario retarga la misma pareja (plan, parte 3)
  - Comprobacion: 0 frames con 3 o mas diapositivas a medio plegar en todos los escenarios. CA6 sigue cumpliendose, tambien en la tira (riesgo 3). Albumes por fling fuerte y tiempo hasta el reposo, antes (T1) y despues, anotados aqui para CA11
- [ ] **T8** · Grano sobre negro (decisiones 3 y 8, CA4)
  - Fichero(s): `scripts/generate-grain.mjs` (crear), `public/textures/grano.png` (crear), `src/motion/AlbumsCarousel.tsx`
  - Cambio: textura 256x256 en escala de grises, semilla fija. Fuera `filter: blur()`, su transicion y el velo. Panel negro con el grano dentro del hijo contra-escalado, `pointer-events: none`, `opacity` = `PANEL * (1 - openness)`. En `next dev`, `?panel=100|90` cambia `PANEL`
  - Comprobacion: dos ejecuciones de `generate-grain.mjs` dan el mismo hash. 0 escrituras de `filter` por frame. El panel no tapa el clic en la diapositiva abierta ni el arrastre. Con reduced motion el pliegue sigue (decision 2)
- [ ] **T9** · Llegada (CA2)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx` (y nada fuera del carrusel)
  - Cambio: primero `--trace` de la llegada para encontrar el frame de 233 ms. Despues, `loading="eager"` en las portadas visibles al llegar y lo que el trace senale dentro del carrusel. Si la causa esta fuera (el landing persistente, por ejemplo), se para y se anota aqui sin arreglarlo
  - Comprobacion: CA2 con `--repeticiones 3`, antes y despues
- [ ] **T10** · Medida final local y diagnostico (CA2 a CA10)
  - Comprobacion:
    - `medir-carrusel.mjs --cpu 1` y `--cpu 4`, local. Salida: `2026-10-2X_011-despues-local.txt`
    - `--geometria`, y con `--fps 30` y `--fps 120`. Salida: `2026-10-2X_011-geometria-despues.json`
    - `node scripts/diagnostico.mjs` en verde (CA10). Salida: `2026-10-2X_diagnostico_011.txt`
- [ ] **T11** · Revision de Javi (CA11)
  - Comprobacion: Javi prueba `/albums` en `npm run dev` con su trackpad, con `?panel=100` y `?panel=90`, y elige. Su testimonio va aqui
  - Despues: `PANEL` queda en el valor elegido y se quita la lectura de `?panel`. Si pide ajustes de `ω` o de `MAX_COMMITS_EN_COLA`, se repiten T6/T7 y T10
- [ ] **T12** · Documentacion
  - Fichero(s): `docs/design-spec-v2.md` §2 y su Changelog, `CLAUDE.md` (build order, carrusel)
  - Comprobacion: `git diff main --stat` solo muestra los ficheros de la tabla del plan, mas `specs/011-carrusel-fluido/`
- [ ] **T13** · Produccion, tras el merge y el push de Javi
  - Comprobacion: `medir-carrusel.mjs --url <produccion> --cpu 1` y `--cpu 4`. Salida: `2026-10-2X_011-produccion.txt`

## Cierre

- [ ] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/`
- [ ] Criterios de aceptacion de la spec ejecutados
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado
- [ ] Estado de `spec.md` → Implementada

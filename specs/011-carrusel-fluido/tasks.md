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
- [x] **T3** · Fisica por tiempo (CA8)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: friccion, avance e impulsos escalados por `dt / 16.67` (plan, parte 1). Las constantes no cambian
  - Comprobacion: `--geometria` local a 60 fps = T2 (±1 px); con `--fps 30` y `--fps 120`, la misma diapositiva abierta y el mismo reposo (±1 px). tsc y lint ok
  - **Hecho.** `velocity *= FRICTION ** frames`, con `frames = dt / REFERENCE_FRAME_MS`. Los impulsos (rueda, tecla, arrastre desde el frame anterior) no se escalan: ya son impulsos.
  - **Desvio del plan.** El avance `offsetPx += velocity * frames` (Euler) dejaba el reposo a 8,6–18 px del de 60 fps, a 30 fps, y a 4,4–8,7 px a 120. A 30 fps, el segundo `ArrowLeft` acababa incluso en otro album. El avance usa ahora `stepDistanceFactor(frames)`, que hace que la serie sume exactamente lo mismo que con pasos de un frame, sea cual sea la duracion del paso, y vale exactamente 1 a 60 Hz.
  - Resultado (`2026-10-22_011-t3-fps.txt`, local con `next start`): reposo frente a T2: **0 px a 60 y 30 fps, ≤ 0,2 px a 120**. tsc y lint ok.
  - Tiempo hasta el reposo con `ArrowLeft 1`, que solo mueve la tira (`2026-10-22_011-fps-antes.txt`, produccion, frente a local):

    | | 30 fps | 60 fps | 120 fps |
    |---|---|---|---|
    | Antes | 1134 ms | 690 ms | 415 ms |
    | Despues | 696 ms | 688 ms | 692 ms |
- [x] **T4** · Escrituras solo si cambian y `memo` por diapositiva (CA3, CA4)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: cada diapositiva guarda lo ultimo escrito y no lo reescribe si es igual. La diapositiva pasa a un componente con `React.memo`; un commit re-renderiza solo las dos que cambian de `isActive`. Blur y velo siguen igual en esta tarea
  - Comprobacion: `--geometria` = T2 (±1 px). En reposo, 0 escrituras de estilo por frame. Recalculo de estilo por frame a CPU×4, comparado con T1
  - **Hecho, con un cambio mas que el plan.** Chrome ya no genera mutacion cuando se escribe el mismo valor (en reposo, produccion da 0 mutaciones en 1 s; script `reposo-mut.mjs`, en el scratchpad). Lo caro era otra cosa: con la tira en marcha, cada diapositiva recibia un `transform` nuevo en cada frame, unas 30. Ahora las diapositivas se colocan en coordenadas de una fila (`computeFrame` con desplazamiento 0), y solo la fila lleva `translateX(-renderOffsetPx)`, con `will-change: transform`. Es la misma suma: `x` es lineal en `renderOffsetPx`.
    - `Slide` con `memo`. La geometria inicial solo se lee al montar y no entra en la comparacion. Desaparece el estado `renderOffsetSnapshot`.
    - El cursor `grab`/`grabbing` pasa al contenedor de la tira; la diapositiva abierta sigue con `pointer`, por el enlace.
    - Cada marco lleva `data-carousel-slide`, que es lo que busca el script de medida.
  - **Geometria:** `--geometria` frente a T2: **0 px** en los 5 estados.
  - **Escrituras de `style` por frame, local, CPU×4, mediana de 3** (`2026-10-22_011-t3-local-cpu4.txt` frente a `-t4-cpu4.txt`):

    | | T3 | T4 |
    |---|---|---|
    | Trackpad | 30,9 | 12,3 |
    | Fling fuerte | 36,9 | 23,7 |
    | Paso y paso atras | 29 | 1,1 |

  - **Estilo por frame: el ruido no deja concluir.** Medido igual (local, CPU×4, mediana de 3):
    - paso y paso atras: 1,46 → 0,26 ms;
    - trackpad: 1,19 → 1,15 ms;
    - con pliegue sube: fling 2,12 → 2,78 ms, rafaga 1,83 → 2,53 ms.

    Quitar `will-change` de la fila lo empeora todo (fling 3,33 ms, trackpad 1,85 ms; `2026-10-22_011-t4-sinwc-cpu4.txt`), y se deja. Entre pasadas casi iguales, la cifra de estilo varia hasta un 50 %. CA3 se juzga en T10, sin blur (T8) y con la contra-escala (T5).
  - El reposo da 4–6 mutaciones por frame en `div.absolute`, sin cambio de `width` ni de `transform`, en las dos versiones. Viene de la medida: a los 0 ms de reposo de produccion sin script se llega sin el. Causa SIN VERIFICAR.
- [x] **T5** · Contra-escala (CA3, CA4, CA7; riesgo 1)
  - **Hecho.** El marco mide siempre el ancho natural y lleva `translateX(x) scaleX(w / natural)` con origen en su borde izquierdo. Un hijo lleva `scaleX(natural / w)`, con origen en el borde anclado (`100% 0` hacia delante, `0 0` hacia atras), y la imagen dentro solo lleva su deriva.
    - Desvio menor del plan: el origen del marco es siempre el izquierdo. El resultado en pantalla es el mismo y la `x` de `computeFrame` se usa tal cual.
    - Sin `will-change` en los marcos: una capa propia se rasteriza a la escala de su transform, y era la via del riesgo 1.
  - **Geometria:** frente a T2, **0 px** en los 5 estados.
  - **CA4:** escrituras de `width` por frame **0** en todos los escenarios (antes 0,7–4), y `left`/`right` 0–0,1. Layout por frame a CPU×4: fling 0,66 → 0,16 ms, trackpad 0,44 → 0,06 ms (`2026-10-22_011-t5-cpu4.txt`).
  - **Estilo por frame:** sube otra vez: fling 3,97 ms, rafaga 4,40 ms. Queda pendiente de T8, que quita las transiciones de `filter` que corren justo en esos escenarios; ver la nota de ruido de T4.
  - **Riesgo 1:** `nitidez.mjs` (scratchpad) congela los rAF a 250, 400 y 550 ms de un `ArrowRight`. Compara en gris la franja visible de la portada que se abre con la misma franja ya en reposo; T4 se mide igual, como control (`nitidez/`).

    | | 250 ms | 400 ms | 550 ms |
    |---|---|---|---|
    | T4, ancho | media 6,62 (max 75) | 0,22 (43) | 0,62 (46) |
    | T5, contra-escala | 3,72 (65) | **0** (0) | **0,29** (19) |

    A 250 ms la diferencia es el `blur` de 300 ms que aun se esta quitando, en las dos versiones. Desde 400 ms la contra-escala es igual o mas nitida que el ancho. No hace falta la reserva `clip-path`.
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: el marco mide el ancho natural, lleva `scaleX(w / natural)` con `transform-origin` en el borde anclado, y un hijo la escala inversa. La imagen deja de escribir `left`/`right`; el anclaje congelado pasa al origen. `will-change: transform`
  - Comprobacion:
    - `--geometria` = T2 (±1 px), caja y recorte
    - 0 escrituras por frame de `width`, `left` o `right` en todos los escenarios
    - riesgo 1: captura a mitad de pliegue frente a la misma imagen en reposo, recortada a la misma zona, comparada al pixel con `sharp`. Si la diferencia media pasa de 2 niveles de gris o los bordes tiemblan, se cambia a `clip-path: inset()` y se anota aqui
- [x] **T6** · Muelle de apertura y de `restOffsetPx` (CA6)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: `openness` y `restOffsetPx` pasan a un muelle criticamente amortiguado con `ω` ≈ 18,6 rad/s, por tiempo (plan, parte 2). Sale `OPENNESS_TAU_MS`
  - Comprobacion: salto maximo de borde ≤ 8 px por encima de su mediana en los cuatro escenarios de pliegue (hoy 58–63 px). `--geometria` = T2 (±1 px). Si no llega, se ajusta `ω` y se anota el valor
  - **Hecho, CA6 todavia no.** `springStep` es el paso exacto del muelle (misma curva a cualquier frecuencia), con `SPRING_OMEGA` = 18,6. La apertura no pasa de 0 ni de 1, y al llegar se fija exacta, con lo que la diapositiva deja de escribirse.
  - **Geometria:** frente a T2, **0 px**. El reposo tras una tecla baja de 800–930 ms a 690–720 ms: el muelle acaba, la exponencial tenia cola.
  - **Salto max de borde, local, mediana de 3** (`2026-10-22_011-t6-cpu1.txt`; antes, linea base de T1):

    | | Antes | Despues |
    |---|---|---|
    | Fling fuerte | 37,6 px | 26,5 px |
    | Rafaga | 37,1 px | 25,1 px |
    | Giro brusco | 19,9 px | 8,7 px |
    | Paso y paso atras | 4,6 px | 4,6 px |

  - Los peores saltos que quedan son de diapositivas plegadas del lado no anclado, empujadas por la apertura de la nueva activa mientras otra pareja sigue a medio plegar. Eso lo cambia la cola de T7; `ω` se revisa despues de T7, no antes.
- [x] **T7** · Un album de cada vez (CA5, CA9)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: cola de commits con `MAX_COMMITS_EN_COLA` = 1; un commit espera a que la pareja anterior quede a menos de 0,5 px y la fija exacta; tope suave de `offsetPx` mientras espera; un commit en sentido contrario retarga la misma pareja (plan, parte 3)
  - Comprobacion: 0 frames con 3 o mas diapositivas a medio plegar en todos los escenarios. CA6 sigue cumpliendose, tambien en la tira (riesgo 3). Albumes por fling fuerte y tiempo hasta el reposo, antes (T1) y despues, anotados aqui para CA11
  - **Hecho; CA5 si, CA6 no.** `MAX_QUEUED_COMMITS` = 1, `outgoingIdxRef` y `pairSettled()`. Mientras espera, la velocidad hacia fuera pierde la fraccion de paso ya pasada, y en el tope (2 pasos) se para. Los numeros salen de `2026-10-22_011-t7-cpu1.txt`, local, mediana de 3.
  - **Geometria:** frente a T2, **0 px**.
  - **CA5:** frames con 3 o mas a medio plegar: **0** en los cuatro escenarios (fling fuerte antes: 209). Maximo, 2.
  - **CA9:** el fling fuerte avanza **8 albumes** (antes 11) y se para a los **658 ms** de la ultima entrada (antes 804).
  - **CA6, salto max de borde:** fling 13 px, rafaga 25,3, giro brusco 5,6, paso y paso atras 3. Lo que queda es la aceleracion de arranque del propio muelle. Cuando una portada empieza a abrirse, las diapositivas plegadas del lado no anclado pasan de moverse ~4 px por frame a ~30 en tres frames. Es continuo en velocidad, pero la medida de CA6 (frente a la mediana de 6 vecinos) lo cuenta.
  - **Probado `ω` = 12** (`2026-10-22_011-t7-omega12.txt`), que acaba en unos 780 ms en lugar de 500: fling 7 px, rafaga 11,8, giro 8,7. Tampoco llega, y el fling baja a 5 albumes. Se deja en 18,6. Bajar `ω` hasta cumplir CA6 haria el pliegue claramente mas lento que los "~450 ms" de hoy: es una decision de sensacion, y va a Javi en T11, junto con si 8 px era el umbral correcto para un arranque continuo.
- [x] **T8** · Grano sobre negro (decisiones 3 y 8, CA4)
  - **Hecho.** `scripts/generate-grain.mjs`: semilla 11, gris medio 16, desviacion 13 (gaussiana), PNG de 256x256 y 60 KB. Dos ejecuciones dan el mismo sha256, `94529d9d…041b`.
    - El panel va dentro del hijo contra-escalado (el grano no se estira), con `pointer-events: none`, y su opacidad la escribe el bucle: `PANEL_OPACITY * (1 - openness)`.
    - Fuera `filter: blur()`, su transicion y el velo. `Slide` ya solo depende de `isActive` para re-renderizarse.
    - `?panel=100|90` se lee solo fuera de produccion, marcado `PLACEHOLDER`, y se quita en T11.
  - **Geometria:** frente a T2, **0 px**. **CA4:** `filter` 0 escrituras por frame en todos los escenarios, igual que `width`.
  - **Estilo por frame, local, CPU×4, mediana de 3** (T3 de `2026-10-22_011-t3-local-cpu4.txt`; T8 de `-t8-cpu4.txt`):

    | | T3 | T8 |
    |---|---|---|
    | Trackpad | 1,19 ms | 0,41 ms |
    | Raton | 1,48 ms | 0,76 ms |
    | Fling fuerte | 2,12 ms | 0,76 ms |
    | Rafaga | 1,83 ms | 0,54 ms |

    Las subidas de T4 y T5 eran las transiciones de `blur`: sin ellas, CA3 (≤ 2 ms) se cumple con margen.
  - **Clic y arrastre** (`t8-ver.mjs`, scratchpad):
    - El clic en la diapositiva abierta navega al album, con y sin reduced motion; el arrastre hacia la izquierda avanza; 0 errores.
    - El mismo arrastre en produccion va y viene entre albumes (01 → 04 → 01 → 02 → 03 → 04 → 03 → 04 → 01, `drag-debug-prod.mjs`). En la rama solo avanza, un album de cada vez.
  - **Reduced motion:** el pliegue sigue (decision 2): no hay rama de reduced motion en el carrusel.
  - **Capturas:** `t8/normal-reposo.png` y `t8/normal-pliegue.png`, en el scratchpad.
  - Fichero(s): `scripts/generate-grain.mjs` (crear), `public/textures/grano.png` (crear), `src/motion/AlbumsCarousel.tsx`
  - Cambio: textura 256x256 en escala de grises, semilla fija. Fuera `filter: blur()`, su transicion y el velo. Panel negro con el grano dentro del hijo contra-escalado, `pointer-events: none`, `opacity` = `PANEL * (1 - openness)`. En `next dev`, `?panel=100|90` cambia `PANEL`
  - Comprobacion: dos ejecuciones de `generate-grain.mjs` dan el mismo hash. 0 escrituras de `filter` por frame. El panel no tapa el clic en la diapositiva abierta ni el arrastre. Con reduced motion el pliegue sigue (decision 2)
- [x] **T9** · Llegada (CA2)
  - **Trace** (`--trace`, CPU×4, local): el frame mas largo de la llegada (183 ms) es una sola llamada de 168 ms dentro de `.next/static/chunks/11pxbv08d7b0-.js`, el chunk de `react-dom` (contiene `hydrateRoot`). Es la hidratacion de React.
  - **La causa esta fuera del carrusel.** La tarea larga aparece igual en rutas sin carrusel (`llegada-rutas.mjs`, CPU×4, 3 cargas por ruta; `2026-10-22_011-t9-llegada-rutas.txt`):
    - `/albums`: 154, 219 y 247 ms;
    - `/about`: 232, 254 y 237 ms;
    - `/credits`: 214, 237 y 233 ms.

    Lo comun a las tres es el landing persistente, montado desde el layout raiz en todas las rutas. Segun el plan, aqui se para y se anota, sin arreglarlo. Queda para una spec propia.
  - **Lo que si es del carrusel:** las portadas que se ven al montar (`initial.onScreen`) pasan a `loading="eager"`. Las que se montan despues, en los bordes de la tira, siguen `lazy`.
  - **CA2, llegada a CPU×1** (`2026-10-22_011-t9-cpu1.txt`, mediana de 3): frame max **33 ms** (≤ 50), 0 long tasks.
  - **A CPU×4** (`-t9-cpu4.txt`): long task de **217 ms**. CA3 pide que ninguna pase de 200 ms: **no se cumple**, por la hidratacion comun de arriba.
  - **Portadas:** 9 "en pantalla" y 2 `lazy`, frente a 6 de 7 antes. La medida cuenta como en pantalla la caja del hijo contra-escalado, que mide el ancho natural, asi que esas 2 son portadas con la caja dentro del viewport pero la franja visible fuera. Las 9 estaban cargadas a +2,5 s.
  - Fichero(s): `src/motion/AlbumsCarousel.tsx` (y nada fuera del carrusel)
  - Cambio: primero `--trace` de la llegada para encontrar el frame de 233 ms. Despues, `loading="eager"` en las portadas visibles al llegar y lo que el trace senale dentro del carrusel. Si la causa esta fuera (el landing persistente, por ejemplo), se para y se anota aqui sin arreglarlo
  - Comprobacion: CA2 con `--repeticiones 3`, antes y despues
- [x] **T10** · Medida final local y diagnostico (CA2 a CA10)
  - **Salidas:**
    - fluidez, `e48c320`, local, mediana de 3: `2026-10-22_011-t9-cpu1.txt` y `-t9-cpu4.txt` (T9 ya era el codigo final);
    - geometria: `2026-10-22_011-geometria-despues.txt` y los `.json` de 30, 60 y 120 fps;
    - diagnostico: `2026-10-22_diagnostico_011.txt`.

  | CA | Resultado | |
  |---|---|---|
  | CA1 | Linea base reproducida, con los tres desvios de medida de T1 | si |
  | CA2 | CPU×1, trackpad y raton: 0 frames >25 ms y 0 >50 ms, tambien en la peor pasada. Llegada: frame max 33 ms | si |
  | CA3 | CPU×4, trackpad y raton: p50 16,7 ms, p95 16,7 ms. Estilo 0,43 y 0,75 ms por frame. Llegada: una long task de 217 ms, la hidratacion comun a todas las rutas (T9) | si, salvo la llegada |
  | CA4 | Escrituras de `width` y `filter` por frame: 0 en todos los escenarios; `left`/`right` 0–0,1 | si |
  | CA5 | Frames con 3 o mas diapositivas a medio plegar: 0 en los 4 escenarios (max 2) | si |
  | CA6 | Salto max de borde, CPU×1: fling 13,1 px, rafaga 26,5, giro 5,8, paso 4,6 (limite 8) | **no**: fling y rafaga (T7) |
  | CA7 | Reposo frente a T2: 0 px en los 5 estados | si |
  | CA8 | Reposo a 30 y 120 fps: 0 y ≤ 0,3 px. Tiempo hasta el reposo 667–733 ms a las tres frecuencias | si |
  | CA9 | Fling fuerte: **8 albumes** en 652 ms (antes, 11 en 804) | para Javi |
  | CA10 | Diagnostico: tsc, eslint y build ok · 0 errores de consola en 6 rutas · **105 de 105** · entrada 200 ms, 0 frames >50 ms | si |

  - **Peor pasada:** la peor de las 3, en todos los escenarios y a CPU×1 y ×4, da 0 frames >25 ms. En la linea base, pasadas sueltas daban p95 33–50 ms.
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

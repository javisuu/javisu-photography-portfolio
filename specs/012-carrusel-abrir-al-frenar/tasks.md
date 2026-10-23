# Tareas 012 · Carrusel: abrir al frenar

- **Plan:** `plan.md` (aprobado el 2026-10-23)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. Cada tarea que toca `src/` va en un commit propio de `feat/012-carrusel-abrir-al-frenar`. Las salidas van al scratchpad, y Javi las copia a `evidencia/` con los `cp` que le de el agente.

- [x] **T1** · Medida nueva y linea base (CA1)
  - Fichero(s): `scripts/medir-carrusel.mjs`
  - Cambio: en el fling fuerte y la rafaga, el script mide (plan, parte 4):
    - diapositivas distintas que pasan de la mitad de su apertura, y la velocidad de la tira cuando lo hicieron;
    - velocidad de la tira por frame;
    - del cruce del umbral hacia abajo a la primera apertura (y al commit, si lo hay);
    - el encaje: borde anclado en reposo frente a su linea, y album final frente al activo en el cruce.
  - Comprobacion: contra produccion (`f662c7d`), `--repeticiones 3`. Reproduce la linea base del scratchpad (10 cambios de album y 11 que pasan de la mitad). Salida `2026-10-23_012-linea-base.txt`
  - **Hecho, con un hallazgo que cambia la prueba.** `stopStats` mide lo de la spec 012 en los escenarios hacia delante.
    - **La velocidad de la tira** es la mediana del movimiento de las diapositivas a dos o mas posiciones por delante de la abierta, por 16,67 ms. Con una sola daba picos falsos de 77 px/frame en los cambios de album.
    - **La linea del encaje** es el borde derecho de la abierta en `ArrowRight 1` de `evidencia/2026-10-22_011-geometria-antes.json`.
  - **Hallazgo: los escenarios de siempre nunca llegan al umbral.** `page.mouse.wheel` espera la ida y vuelta de cada evento, asi que la tira va mucho mas despacio que con un trackpad:
    - fling fuerte: max **8,5 px/frame**;
    - rafaga: max **4,4**;
    - una tecla da 18 de golpe.

    El calculo de la spec ("unos 26 px/frame", SIN VERIFICAR) suponia un evento por frame, y no es asi. Con el umbral en 20, ninguno de esos escenarios cambiaria.
  - **Escenario nuevo, "trackpad real":** 40 eventos de 60 px, uno por frame, despachados desde la pagina como los de un trackpad. Llega a **30 px/frame** (p90 26,1), lo que da el calculo para un evento por frame.
    - Primera version: solo llegaban 13 de 40 eventos. Se despachaban sobre el enlace de la abierta, que React quita del DOM en cada cambio de album, y un evento sobre un nodo suelto no llega al carrusel. Ahora el elemento bajo el centro se busca en cada evento (`wheel-debug.mjs`, scratchpad).
  - **Linea base, produccion `f662c7d`, mediana de 3** (`2026-10-23_012-linea-base.txt`):

    | | Fling fuerte | Rafaga | Trackpad real |
    |---|---|---|---|
    | Velocidad max de la tira | 8,5 px/frame | 4,4 | 30 |
    | Cambios de album | 11 | 4 | 9 |
    | Pasan de la mitad de su apertura | 12 | 5 | 10, **5 con la tira a mas de 20 px/frame** |
    | Al frenar | no pasa del umbral | no pasa | abre a 150 ms del cruce; un cambio de album mas (+1) a 167 ms |
    | Borde de la abierta en reposo frente a su linea | −2,1 px | −55,1 px | −19,1 px |

    CA1 decia "10 cambios y 11 que pasan de la mitad", del script del scratchpad; el script del repo da 11 y 12 en el mismo fling. CA2, CA3 y CA3b se juzgan sobre todo en "trackpad real", el unico que pasa del umbral.
  - **Correccion (en T3): la linea del encaje estaba mal.** El reposo de `ArrowRight 1` no esta en la linea: una tecla recorre ~207 px, hace un commit y deja 65 px de sobra. La linea buena es la de la llegada (offsetPx 0): borde derecho a 980,5 px, frente a 915,5. El script ya la usa. La fila del borde de la tabla, con la linea buena: fling fuerte **−67,1 px**, rafaga **−120,1** (medidas otra vez en T3, sin encaje) y trackpad real **−84,1** (−19,1 − 65,0, calculado; no se volvio a medir produccion).
- [x] **T2** · Estado rapido/lento y destino de la activa (CA2, CA3)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: `OPEN_SPEED` = 20 con histeresis a 16. La activa apunta a 0 mientras la tira va rapida y a 1 cuando va lenta. La estela, sin cambios (plan, partes 1 y 2)
  - Comprobacion:
    - CA2: ninguna pasa de la mitad por encima del umbral;
    - CA3: la apertura empieza en menos de 100 ms desde el cruce;
    - CA4 y CA5: reposo ±1 px a 60, 30 y 120 fps;
    - tsc y lint ok.
  - **Hecho.** `isFastRef` se actualiza justo despues de la friccion (paso 1); el destino de la activa es `!isFastRef.current ? 1 : 0` (paso 4). Local, `next start`, mediana de 3 (`2026-10-23_012-t2-cpu1.txt` y `-t2-geometria.txt`, scratchpad):
    - **CA2, trackpad real:** 4 diapositivas pasan de la mitad, **0 con la tira a mas de 20 px/frame** (linea base: 10, 5 por encima). Fling fuerte y rafaga sin cambios (12 y 5): no llegan al umbral.
    - **CA3, pendiente de T3:** al cruzar, la tira aun lleva inercia y hace un cambio de album mas (+1 a 167 ms), asi que la que queda abierta empieza a abrirse con ese commit. Es lo que resuelve el encaje.
    - **CA4 y CA5:** reposo ok frente a la referencia de la 011, diferencia max 0,1 px a 60 fps, 0 a 30 y 0,3 a 120.
    - CA5 de la 011 (nada por delante cambia de ancho): 0 frames. 0 frames >50 ms y 0 errores de consola.
    - tsc y lint ok.
- [x] **T3** · Encaje tras un scroll rapido (CA3b)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: `wasFastRef` y `snapIdxRef`. Muelle de `offsetPx` hacia el activo o el siguiente, el mas cercano, empezando con la velocidad que llevaba la tira. Una entrada nueva lo cancela. La activa no se abre hasta llegar a `snapIdx` (plan, parte 3)
  - Comprobacion:
    - CA3b: borde anclado en su linea ±1 px; album final igual al activo en el cruce, o el siguiente, nunca el anterior;
    - CA3: tiempo del cruce al commit anotado;
    - CA4 y CA5 sin cambios (una tecla no encaja);
    - tsc y lint ok.
  - **Hecho, con un cambio frente al plan: no toda entrada nueva cancela el encaje.** Un trackpad sigue mandando eventos cada vez mas pequenos en el mismo sentido despues del gesto (la cola de inercia). Con "cualquier entrada cancela", esa cola movia la tira despues de encajar: −1,6 px de la linea en el escenario nuevo con cola (abajo).
    - **La regla:** mientras encaja, la entrada alimenta una velocidad "libre", la que tendria la tira sin el encaje, que empieza en la velocidad del cruce. Una cola solo frena su caida; un gesto nuevo, o una tecla, la hace subir. El encaje acaba si sube mas de `SNAP_RESUME_PX` = 2 px/frame sobre su minimo, con entrada en sentido contrario o con un arrastre. Ya encajada, la tira sigue en su linea hasta que la velocidad libre baja de `SNAP_RELEASE_PX` = 0,5 (la cola se ha agotado).
    - **El caso que pierde:** un scroll lento y constante que empieza justo cuando la tira frena se lee como cola y no la mueve hasta que se suelta. Para T5.
  - **Escenario nuevo en el script, "trackpad con inercia":** 20 eventos de 60 px y una cola de 60 eventos de 60·0,93^k px, uno por frame.
  - **Medida local, `next start`, mediana de 3** (`2026-10-23_012-t3-cpu1.txt` y `-t3-geometria.txt`, scratchpad):

    | | Trackpad real | Trackpad con inercia |
    |---|---|---|
    | Pasan de la mitad (con la tira a mas de 20) | 3 (0) | 2 (0) |
    | CA3: apertura desde el cruce | 0 ms | 0 ms |
    | CA3b: album final frente al del cruce | +0 | +0 |
    | CA3b: borde de la abierta frente a su linea | **0 px** | **0 px** |

    Fling fuerte y rafaga no pasan del umbral y siguen como en T2. CA5 de la 011: 0 frames. 0 frames >50 ms, 0 errores de consola. Geometria (CA4, CA5): ok, diferencia max 0,1 px a 60 fps, 0 a 30 y 0,3 a 120.
  - **El encaje al siguiente** no sale en esos dos escenarios, asi que se comprobo de dos formas mas (scratchpad):
    - **En el navegador** (`barrido-encaje.mjs`): de 26 a 46 eventos de 60 px, los 11 terminan con el borde a **0,00 px** de la linea y el contador nunca retrocede.
    - **Simulacion numerica del bucle** (`sim-encaje.mjs`, copia de la fisica sin DOM): de 15 a 60 eventos, a 30, 60 y 120 fps, con y sin cola, el encaje va al activo 21–27 veces y al siguiente 19–25 por tanda. **0 fallos:** siempre offsetPx 0, album final igual al elegido, nunca el anterior, y la activa no se abre antes del commit cuando va a la siguiente.
    - **Un gesto nuevo durante el encaje mueve la tira** (`sim-gesto.mjs`): una muesca de 100 px despues del encaje recorre 51,75 px, lo mismo que hoy.
  - **"Giro brusco" pasa de 1 cambio de album a 0.** No es una regresion: los escenarios van seguidos en la misma pagina, y el anterior ahora acaba encajado en la linea en lugar de a 19 px dentro del paso, asi que este empieza desde otra posicion. Ese escenario nunca pasa del umbral.
- [x] **T4** · Medida final local y diagnostico (CA2 a CA7)
  - Comprobacion:
    - `medir-carrusel.mjs --repeticiones 3` a CPU×1 y ×4;
    - `--geometria --comparar evidencia/2026-10-22_011-geometria-antes.json` a 60, 30 y 120 fps;
    - `node scripts/diagnostico.mjs` en verde;
    - salidas en el scratchpad, y una tabla de CA aqui.
  - **Hecho.** Local, `next build` + `next start`, codigo de `9db1f93`. Salidas en el scratchpad: `2026-10-23_012-t3-cpu1.txt` (CPU×1), `2026-10-23_012-despues-cpu4.txt`, `2026-10-23_012-t3-geometria.txt` y `2026-10-23_diagnostico_012.txt`.

    | CA | Resultado | Cumple |
    |---|---|---|
    | CA2 | Ninguna diapositiva pasa de la mitad con la tira a mas de 20 px/frame, en ningun escenario, a CPU×1 y ×4. Trackpad real: 3 pasan de la mitad en todo el gesto (linea base: 10, 5 por encima del umbral). Fling fuerte y rafaga no llegan al umbral (max 8,5 y 4,4 px/frame; 10,1 y 5 a CPU×4) y no cambian | Si, en los escenarios que pasan del umbral |
    | CA3 | La que queda abierta empieza a abrirse a 0 ms del cruce, en los dos escenarios que lo cruzan, a CPU×1 y ×4. Del cruce al commit, cuando el encaje va al siguiente: solo en el barrido y la simulacion (T3), no medido en ms | Si |
    | CA3b | Borde de la abierta a 0 px de su linea y album final +0 frente al del cruce, en trackpad real y con inercia, a CPU×1 y ×4. Barrido de 26 a 46 eventos: 0,00 px. Simulacion: 0 fallos, nunca el anterior | Si |
    | CA4 | Reposo tras `ArrowRight` ×2 y `ArrowLeft` ×2 frente a la 011: diferencia max 0,1 px | Si |
    | CA5 | Lo mismo a 30 fps (0 px) y 120 fps (0,3 px) | Si |
    | CA6 | 0 frames >50 ms en todos los escenarios, CPU×1 y ×4. Estilo a CPU×4: max 1,43 ms por frame (fling fuerte). Nada por delante de la que se abre cambia de ancho: 0 frames | Si |
    | CA7 | tsc, lint y build ok · 0 errores de consola en 6 rutas · 105 de 105 invariantes | Si |
    | CA8 | Pendiente: T5 | — |

    CA1 decia "10 cambios y 11 que pasan de la mitad"; el script del repo da 11 y 12 en el mismo fling (T1).
- [x] **T5** · Revision de Javi (CA8)
  - Comprobacion: Javi prueba `/albums` en `npm run dev` con su trackpad, frente a cynx.io. Testimonio aqui. Si pide ajustes del umbral (20/16) o del encaje, se repiten T2/T3 y T4
  - **Hecho: no lo da por bueno.** Pide tres cambios de modelo, recogidos en la enmienda 1 de `spec.md` (aprobada el 2026-10-23), con su plan en `plan.md`. Se hacen en E1 a E6.

### Enmienda 1

Antes de cada `next build`, Javi para su `npm run dev`: comparten `.next/`, y un build con el dev abierto lo rompe (2026-10-23: landing en negro y 404 en `/albums`).

- [ ] **E1** · Medida de la enmienda
  - Fichero(s): `scripts/medir-carrusel.mjs`
  - Cambio (plan de la enmienda, parte 5):
    - escenario "lento ida y vuelta" (60 x 4 px cada 40 ms, pausa de 2,5 s, vuelta);
    - por cada cambio de album, el centro de la abierta frente a 720 en el frame anterior al commit, y el borde de entrada de la que llega al pasar de 110,5 px;
    - el encaje medido por el centro de la abierta;
    - el tope de apertura a 30 px/frame o mas.
  - Comprobacion: linea base local con el codigo de `efad305`, `--repeticiones 3`. Salida `2026-10-23_012e-linea-base.txt`
- [ ] **E2** · Geometria centrada y commit a medio paso (CA2, CA3, CA4, CA9)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: `computeFrame` centrado y sin sentido; commit en `|offsetPx| > STEP/2`; fuera `restOffsetPx` y `anchorRestOffsetPx` (plan de la enmienda, partes 1 y 2)
  - Comprobacion:
    - CA2 y CA3 en el escenario lento;
    - CA9 en todos;
    - referencia de geometria nueva a 60 fps, y CA4 a 30 y 120 contra ella;
    - tsc y lint ok.
- [ ] **E3** · Apertura con la velocidad (CA10)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio: la activa apunta a `amp(v)` (1 por debajo de 16 px/frame, 0,2 a 30 o mas); fuera el destino de T2 (plan de la enmienda, parte 3)
  - Comprobacion: CA10 en "trackpad real"; CA12 de la 011 (la estela decrece); tsc y lint ok
- [ ] **E4** · Encaje y teclas (CA3b, CA4)
  - Fichero(s): `src/motion/AlbumsCarousel.tsx`
  - Cambio (plan de la enmienda, parte 4):
    - el encaje va al album mas cercano a donde pararia la friccion, el activo o el siguiente;
    - fuera la espera de la activa a `snapIdx`;
    - una tecla pone el encaje en el album de al lado, en lugar de dar velocidad (fuera `KEY_KICK_PX`).
  - Comprobacion: CA3b en "trackpad real" y "con inercia"; CA4 (una tecla, centrado ±1 px); sin encaje en el escenario lento; tsc y lint ok
- [ ] **E5** · Medida final local y diagnostico (CA2 a CA10)
  - Comprobacion: `--repeticiones 3` a CPU×1 y ×4; geometria a 60, 30 y 120 fps; `node scripts/diagnostico.mjs` en verde; tabla de CA aqui
- [ ] **E6** · Revision de Javi (CA8)
  - Comprobacion: Javi prueba `/albums` en `npm run dev` con su trackpad, frente a cynx.io. Testimonio aqui
- [ ] **T6** · Documentacion
  - Fichero(s): `docs/design-spec-v2.md` §2 ("Commit is position-triggered" y "no snap-back") y su Changelog, `CLAUDE.md` (build order, carrusel)
  - Comprobacion: `git diff main --stat` solo muestra los ficheros de la tabla del plan, mas `specs/012-carrusel-abrir-al-frenar/`
- [ ] **T7** · Produccion, tras el merge y el push de Javi
  - Comprobacion: `medir-carrusel.mjs --url <produccion> --repeticiones 3`, a CPU×1 y ×4. Salida `2026-10-2X_012-produccion.txt`

## Cierre

- [ ] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/`
- [ ] Criterios de aceptacion de la spec ejecutados
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado
- [ ] Estado de `spec.md` → Implementada

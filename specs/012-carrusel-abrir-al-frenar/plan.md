# Plan 012 · Carrusel: abrir al frenar

- **Spec:** `spec.md` (aprobada por Javi el 2026-10-23). Plan aprobado por Javi el 2026-10-23

## Enfoque

Todo cabe en el bucle de fisica de `src/motion/AlbumsCarousel.tsx`. No cambian `computeFrame`, el pintado, el grano ni la estela. Tres piezas, de la que no cambia lo que se ve en reposo a la que si.

### 1. "Rapido": un estado con histeresis (decisiones 1 y 5)

- `velocityRef` ya va en px por frame de referencia (1/60 s, spec 011, T3), asi que el umbral es por tiempo y vale igual a 30, 60 y 120 Hz (CA5).
- **La tira pasa a "rapida"** cuando `|velocity|` supera `OPEN_SPEED` = 20 (decision 1).
- **Vuelve a "lenta"** cuando baja de `OPEN_SPEED * 0,8` = 16. Sin ese margen, un trackpad que ronda los 20 px haria que la portada se abriera y cerrara cada pocos frames.
- Con reduced motion se comporta igual (decision 5).

### 2. Quien se abre (CA2, CA3)

Hoy la activa apunta a apertura 1 siempre (`:721`). Pasa a:
- **Rapida:** 0. Ninguna se abre, y la que estaba abierta se pliega con su muelle.
- **Lenta:** 1, como hoy.

La estela (`:719`) no cambia: sigue con la velocidad y detras de la activa, abierta o no (decision 2).

**Por que no se abre la siguiente antes de llegar a ella.** El commit en el mismo sentido es continuo porque la diapositiva que va a ser activa mide exactamente 110 px justo antes (`:185`, comentario de `computeFrame`). Abrirla antes del commit romperia esa continuidad y daria un salto. Por eso, si el encaje va a la siguiente, la apertura empieza en el commit, no al cruzar el umbral (pieza 3).

### 3. Encaje despues de un scroll rapido (decision 3, CA3b)

- `wasFastRef` se activa al pasar a rapida y se borra con el encaje.
- **Al pasar de rapida a lenta**, si `wasFastRef` esta activo, se elige el album de llegada, `snapIdxRef`:
  - **el siguiente en el sentido de la marcha**, si `offsetPx * travelDir ≥ STEP_DISTANCE / 2`;
  - **el activo**, si no.
  - Nunca el anterior: con `travelDir` como referencia, las dos unicas opciones son el activo y el siguiente.
- **Mientras encaja**, `offsetPx` deja la friccion y va con un muelle criticamente amortiguado (`springStep`, `:116`, `ω` = 18,6) hacia `(snapIdx − activeIdx) · STEP_DISTANCE`:
  - empieza con la velocidad que llevaba la tira (px/frame a px/s), asi que no hay cambio brusco;
  - si va a la siguiente, cruza `STEP_DISTANCE` y el commit de siempre la hace activa. El destino pasa a ser 0, sin salto, porque la formula ya resta el commit;
  - `velocityRef` sigue la velocidad del muelle, asi que la estela tambien.
- **Al llegar** (a menos de 0,01 px y casi parada), `offsetPx` queda en 0 exacto: el borde anclado, en su linea fija (CA3b).
- **Cualquier entrada nueva** (rueda, tecla o arrastre) cancela el encaje y devuelve la tira a la friccion de siempre.
- **Sin scroll rapido no hay encaje**, como hoy (§2, "no snap-back").

Mientras encaja hacia la siguiente, la activa todavia es la anterior, y no se abre: abrirla para plegarla enseguida seria justo lo que la spec quiere evitar. La apertura empieza en el commit hacia `snapIdx`.

**Lectura de CA3.** CA3 dice que la activa empieza a abrirse en menos de 100 ms desde que la velocidad cruza el umbral. Se mide asi:
- si el encaje va al activo, desde el cruce;
- si va al siguiente, desde su commit. El tiempo hasta ese commit se anota aparte, para Javi.

### 4. Medida (CA1 a CA3b)

`scripts/medir-carrusel.mjs` gana, en el fling fuerte y la rafaga:
- **Diapositivas distintas que pasan de la mitad de su apertura** (CA1 y CA2).
- **Velocidad de la tira por frame.** Sale del borde de una diapositiva a dos o mas posiciones por delante de la abierta: esas no cambian de ancho (spec 011, CA5), asi que se mueven exactamente con la tira.
- **Para cada diapositiva que pasa de la mitad, a que velocidad lo hizo.** Con eso, CA2 es: ninguna por encima del umbral.
- **Tiempo del cruce hacia abajo a la primera apertura** (CA3), y del cruce al commit si el encaje va a la siguiente.
- **Encaje** (CA3b):
  - borde anclado de la abierta en reposo frente a su linea. La linea sale de la geometria de referencia: borde derecho de la abierta en `ArrowRight 1` de `evidencia/2026-10-22_011-geometria-antes.json`;
  - album final frente al activo en el frame del cruce: igual o el siguiente, nunca el anterior.

### Descartado

- **Abrir la siguiente antes del commit**, para que florezca antes. Rompe la continuidad del commit (`:185`) y vuelve el salto que la spec 011 quito.
- **Encajar ajustando la velocidad**, en lugar de con un muelle. El reposo dependeria de la friccion y no caeria exacto en la linea: no cumpliria CA3b ±1 px.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/motion/AlbumsCarousel.tsx` | modificar | `OPEN_SPEED` y su histeresis; destino de la activa segun rapida/lenta; encaje con `wasFastRef`, `snapIdxRef` y muelle de `offsetPx`; cancelacion con entrada nueva |
| `scripts/medir-carrusel.mjs` | modificar | Diapositivas que pasan de la mitad, velocidad de la tira, tiempos del cruce y encaje (CA1 a CA3b) |
| `docs/design-spec-v2.md` | modificar | §2: "Commit is position-triggered" (la apertura si depende de la velocidad) y "no snap-back" (salvo tras un scroll rapido). Changelog |
| `CLAUDE.md` | modificar | Una linea en el build order, en el carrusel |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| El encaje se nota como un tiron hacia atras cuando va al activo y la tira ya habia pasado casi medio paso | Media | Medio | Elige el mas cercano (como mucho medio paso) y arranca con la velocidad que llevaba. Javi lo juzga en CA8; si molesta, el umbral de "mitad" se puede inclinar hacia delante |
| El muelle se pasa del destino y cruza un commit de mas | Baja | Medio | Solo empieza por debajo de 20 px/frame. A esa velocidad, con `ω` = 18,6, se pasa de unos 25 px como mucho, menos de un paso. Se mide en CA3b |
| La portada abre y cierra con un trackpad que ronda el umbral | Media | Medio | La histeresis 20/16; CA2 la mide; Javi ajusta en CA8 |
| Una tecla (18 px/frame) cerca del umbral cambia el reposo | Baja | Alto | CA4 y CA5: una tecla no llega a 20, asi que no hay encaje |

## Vuelta atras

- **Rama:** `feat/012-carrusel-abrir-al-frenar`
- **Como se revierte:** un commit por pieza; `git revert` del que falle, o no fusionar la rama
- **Que avisaria de que esto ha roto algo:**
  - CA4 y CA5, el reposo frente a `evidencia/2026-10-22_011-geometria-antes.json`;
  - CA6, los criterios de la 011 en `scripts/medir-carrusel.mjs`;
  - las invariantes del diagnostico en `/albums`.

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| `medir-carrusel.mjs --url <produccion> --repeticiones 3`, antes de tocar nada, con la medida nueva | CA1 | `evidencia/2026-10-23_012-linea-base.txt` |
| `medir-carrusel.mjs --repeticiones 3`, local, despues | CA2, CA3, CA3b, CA6 | `evidencia/2026-10-2X_012-despues-cpu1.txt` |
| `medir-carrusel.mjs --cpu 4 --repeticiones 3`, local | CA6 | `evidencia/2026-10-2X_012-despues-cpu4.txt` |
| `medir-carrusel.mjs --geometria --comparar …`, a 60, 30 y 120 fps | CA4, CA5 | `evidencia/2026-10-2X_012-geometria.txt` |
| `node scripts/diagnostico.mjs` | CA7 | `evidencia/2026-10-2X_diagnostico_012.txt` |
| Revision de Javi en `npm run dev` | CA8 | Testimonio en `tasks.md` |
| Lo mismo contra produccion, tras el push | CA2, CA3, CA3b | `evidencia/2026-10-2X_012-produccion.txt` |

El agente no puede escribir en `evidencia/` (`.claude/settings.json:27`). Las salidas van al scratchpad y Javi las copia con los `cp` que le de el agente.

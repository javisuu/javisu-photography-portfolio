# Plan 011 · Carrusel fluido

- **Spec:** `spec.md` (aprobada por Javi el 2026-10-22). Plan aprobado por Javi el 2026-10-22

## Enfoque

Primero se mide y despues se cambia. Cada parte de abajo resuelve un CA concreto, y su orden en `tasks.md` es tambien el orden de riesgo: lo que no cambia el aspecto va antes.

### 0. Medida en el repo (CA1)

`scripts/medir-carrusel.mjs` junta los dos scripts del scratchpad (`medir-carrusel-album.mjs` y `medir-pliegue.mjs`), con flags al estilo del diagnostico:
- `--url <base>`: por defecto, un `next start` sobre el build local, en el puerto 3100 como el diagnostico;
- `--cpu N`: throttling de CDP;
- `--repeticiones N`: da la mediana de las cifras de fluidez;
- `--geometria`: solo CA7 y CA8.

Salida por escenario (llegada, trackpad, raton, fling fuerte, rafaga, giro brusco, paso y paso atras):
- fluidez: p50, p95, frames >25 y >50 ms, recalculo de estilo por frame, long tasks;
- pliegue: diapositivas a medio plegar por frame y maximo salto por borde;
- escrituras por frame: `width`, `left`, `right` y `filter` de los marcos y las imagenes, con un `MutationObserver` sobre `style` que compara el valor anterior (CA4);
- albumes avanzados y tiempo hasta el reposo en el fling (CA9).

Con `--geometria` saca la caja de cada marco y el recorte de cada imagen en reposo, al llegar y tras `ArrowRight`, `ArrowRight` y `ArrowLeft`. Con `--fps 30|120` limita o acelera `requestAnimationFrame` desde un `addInitScript`, para CA8.

Se ejecuta contra produccion **antes de tocar el carrusel**. Esa salida es la linea base del repo y tiene que reproducir las cifras del scratchpad (CA1).

### 1. Fisica por tiempo, no por frame (CA8)

`FRICTION`, la integracion de la velocidad y los impulsos de rueda y teclado pasan a escalarse por `dt / 16,67 ms`:
- friccion: `velocity *= FRICTION ** (dt / 16.67)`;
- avance: `offsetPx += velocity * (dt / 16.67)`.

A 60 Hz da exactamente los mismos numeros que hoy, asi que las constantes de sensacion no cambian (fuera de alcance de la spec). A 30 o 120 Hz, el mismo gesto acaba en el mismo sitio.

### 2. El pliegue: un muelle por diapositiva (CA5, CA6)

Hoy `openness` es una exponencial (`src/motion/AlbumsCarousel.tsx:466-470`): arranca a velocidad maxima (el salto de 58–63 px) y no se para nunca del todo (unos 1050 ms hasta 0,5 px).

Pasa a ser un **muelle criticamente amortiguado**, con posicion y velocidad por diapositiva y por tiempo. `ω` es unos 18,6 rad/s: queda a menos de 0,5 px de su destino en unos 500 ms, cerca de los "~450 ms" de hoy (`:69`).
- Arranca con velocidad 0: no hay salto al empezar.
- Si cambia el destino a medio camino (un giro), conserva su velocidad: frena y vuelve, sin cambio brusco.

`restOffsetPx`, la correccion de posicion que se aplica al girar (`:428-436`), pasa al mismo muelle. Su vuelta a 0 tampoco arranca de golpe. Si el muelle no llega a 8 px de salto en CA6, el ajuste es de `ω`, no del modelo.

### 3. Un album de cada vez (decision 6, CA5, CA9)

Un commit nuevo **espera** a que la pareja anterior este quieta: las dos diapositivas a menos de 0,5 px de su ancho final, y entonces se fijan exactas (un ajuste menor de 0,5 px no se ve).
- Mientras espera, `offsetPx` sigue integrando la entrada, pero con un tope suave (velocidad amortiguada al acercarse) de `STEP_DISTANCE * (1 + MAX_COMMITS_EN_COLA)`. La tira no se escapa y tampoco frena en seco.
- Los commits pendientes se ejecutan en orden, uno detras de otro, como en cynx.io.
- `MAX_COMMITS_EN_COLA` empieza en 1. CA9 da la cifra de albumes por fling para que Javi la vea en CA11.
- Un commit en sentido contrario a la pareja en marcha no espera: es un giro. Retarga los muelles de la misma pareja, que vuelven por donde venian, sin abrir una tercera.

La continuidad algebraica del commit en el mismo sentido (`src/motion/AlbumsCarousel.tsx:131-142`) no depende de cuando se haga el commit, solo de que reste exactamente `STEP_DISTANCE`. Esperar no la rompe.

### 4. Pliegue sin layout (CA3, CA4)

Hoy el marco cambia `width` en cada frame (`:520`) y la imagen cambia `left`/`right` (`:539-540`).

Pasa a la **contra-escala**: el marco mide siempre el ancho natural de su portada y tiene `overflow: hidden`.
- El marco lleva `scaleX(w / anchoNatural)`, con `transform-origin` en el borde anclado.
- Un hijo lleva la escala inversa, `scaleX(anchoNatural / w)`, con el mismo origen, y dentro la imagen y su deriva.
- Las dos escalas se anulan en pantalla, asi que la imagen se ve a su tamano real y recortada al ancho `w`.
- Todo es `transform`, con `will-change: transform`: sin layout ni repintado por frame.

El anclaje congelado de la imagen (`:202-228`) pasa de `left`/`right` al `transform-origin`, con la misma regla. `computeFrame` no cambia: sigue dando `width` y `x`; solo cambia como se escriben.

**Escrituras solo si cambian.** Cada diapositiva guarda el ultimo transform escrito y no lo reescribe si es igual. Las diapositivas quietas (casi todas) dejan de invalidar estilo en cada frame.

Alternativa de reserva: `clip-path: inset()` en el marco. Evita el layout pero repinta, y se usa solo si la contra-escala deja la imagen borrosa durante el pliegue (riesgo 1).

### 5. Profundidad: grano sobre negro, sin `filter` (decisiones 3 y 8, CA4)

- **Fuera:** `filter: blur()` y su transicion (`:694-695`), y el velo por distancia (`:23-28`, `:705-708`).
- **Dentro, en cada diapositiva:** un panel encima de la imagen, dentro del hijo contra-escalado para que no se deforme. Es negro con una textura de grano en mosaico, y su `opacity` sale de la apertura de esa diapositiva: `PANEL * (1 - openness)`. Se escribe en el mismo bucle; `opacity` es solo de composicion.
- **La textura:** `public/textures/grano.png`, de 256x256 px en escala de grises. La genera una vez `scripts/generate-grain.mjs`, con `sharp` (ya en `devDependencies`) y una semilla fija: el fichero sale identico en cada ejecucion. No es una foto, asi que no hay que tocar el `--path` del espejo.
- **Opaco o al 90 %:** `PANEL` es una constante. Para que Javi compare, `next dev` acepta `?panel=100` o `?panel=90` en `/albums`. El parametro se lee solo en desarrollo y se quita en la tarea final, cuando Javi elija.

### 6. Re-render del commit y llegada (CA2, CA3)

- Cada diapositiva pasa a un componente con `React.memo`. Un commit solo re-renderiza las dos que cambian de `isActive` (el enlace), el titulo y el contador, no las ~30 de la tira. Sin blur ni velo, no les queda ninguna prop que dependa de la distancia.
- **Llegada:** las portadas que se ven al llegar (la activa y las vecinas dentro del viewport) pasan a `loading="eager"`; hoy solo la activa lleva `priority` (`:700`).
- El frame de 233 ms de la llegada no tiene causa verificada. La tarea de la llegada graba primero un trace con `--trace` (CDP `Tracing`, como `scripts/perfil-arranque.mjs`) y arregla lo que salga. Si es algo fuera del carrusel (el landing persistente, por ejemplo), se para y se anota, sin arreglarlo aqui.

### Descartado

- **Pasar el carrusel a WebGL, como cynx.io.** Seria un segundo renderizador GL ademas de `GLSurface` (zona que ha roto el sitio antes), y `CLAUDE.md` deja el carrusel fuera de `GLSurface`. La contra-escala consigue lo mismo en DOM.
- **GSAP para el pliegue.** No esta instalado (`package.json:12-18`), y su entrada esta prevista con la transicion Flip, que es otra spec. Un muelle son pocas lineas.
- **Igualar el tamano de las portadas abiertas.** Javi lo descarto (decision 7).

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/medir-carrusel.mjs` | crear | Medida de fluidez, pliegue, saltos, escrituras y geometria (CA1 a CA9) |
| `scripts/generate-grain.mjs` | crear | Genera `public/textures/grano.png`, deterministico |
| `public/textures/grano.png` | crear | Textura de grano 256x256, escala de grises |
| `src/motion/AlbumsCarousel.tsx` | modificar | Fisica por tiempo; muelles de apertura y de `restOffsetPx`; cola de commits; contra-escala; panel de grano; `memo` por diapositiva; portadas visibles en `eager` |
| `docs/design-spec-v2.md` | modificar | §2: un album de cada vez, pliegue con muelle, grano sobre negro en lugar de blur y velo, excepcion de reduced motion. Changelog |
| `CLAUDE.md` | modificar | Una linea en el build order, en el carrusel: spec 011, que cambio y por que |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| 1. La contra-escala deja la imagen borrosa o con bordes que tiemblan durante el pliegue: Chrome puede rasterizar la capa a otra escala | Media | Alto: la foto es lo que se mira | Se comprueba con capturas a mitad de pliegue frente a la imagen en reposo, al pixel. Si falla, la reserva es `clip-path: inset()` |
| 2. Esperar a la pareja anterior hace que un fling se sienta frenado | Media | Medio | Es la decision 6. CA9 lo cuantifica y Javi lo prueba en CA11. `MAX_COMMITS_EN_COLA` y `ω` son los dos mandos |
| 3. El tope suave de `offsetPx` mientras espera se nota como un freno | Media | Medio | CA6 mide los saltos de borde tambien en la tira, no solo en el pliegue |
| 4. La geometria en reposo cambia sin querer al reescribir como se pinta | Baja | Alto | CA7 compara caja y recorte al pixel con la linea base, antes y despues de cada tarea que toca el pintado |
| 5. El grano se ve distinto de lo que Javi imagina | Media | Bajo | Es un PNG regenerable con otra semilla o contraste. Las dos opacidades se comparan en `next dev` antes de nada mas |
| 6. El panel tapa el clic o el arrastre | Baja | Medio | `pointer-events: none`, como el velo de hoy (`:706`) |

## Vuelta atras

- **Rama:** `feat/011-carrusel-fluido`
- **Como se revierte:** cada parte va en un commit propio de la rama. `git revert` del commit que falle, o no fusionar la rama. `main` no se toca hasta CA11.
- **Que avisaria de que esto ha roto algo:**
  - CA7 (geometria en reposo frente a la linea base);
  - las invariantes del diagnostico en `/albums`: un solo `<main>` visible, sin scroll horizontal ni barra, 0 errores de consola;
  - CA5 y CA6, en el script del carrusel.

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| `medir-carrusel.mjs --url <produccion> --cpu 1` y `--cpu 4`, antes de tocar nada | CA1 | `evidencia/2026-10-2X_011-linea-base-repo.txt` |
| `medir-carrusel.mjs --geometria`, antes | Referencia de CA7 | `evidencia/2026-10-2X_011-geometria-antes.json` |
| `medir-carrusel.mjs --cpu 1` y `--cpu 4`, local, despues | CA2 a CA6, CA9 | `evidencia/2026-10-2X_011-despues-local.txt` |
| `medir-carrusel.mjs --geometria`, y con `--fps 30` y `--fps 120` | CA7, CA8 | `evidencia/2026-10-2X_011-geometria-despues.json` |
| `node scripts/diagnostico.mjs` | CA10 | `evidencia/2026-10-2X_diagnostico_011.txt` |
| Revision de Javi en `npm run dev`, con `?panel=100` y `?panel=90` | CA11 | Testimonio en `tasks.md` |
| Lo mismo contra produccion, tras el push de Javi | CA2 a CA6 | `evidencia/2026-10-2X_011-produccion.txt` |

El agente no puede escribir en `evidencia/` (`.claude/settings.json:27`). Las salidas van al scratchpad y Javi las copia con los `cp` que le de el agente.

## Enmienda 1 (2026-10-22): scroll libre y estela por velocidad

- **Spec:** `spec.md`, enmienda 1. Aprobado por Javi el 2026-10-22

### 1. Sin cola

Sale la espera de T7: `MAX_QUEUED_COMMITS`, `outgoingIdxRef`, `pairSettled()`, el freno suave y el tope de `offsetPx`, y con ellos el `?cola=libre` de prueba. Los commits vuelven a encadenarse como antes de T7, pero cada diapositiva sigue con su muelle (T6), asi que ninguna cambia de destino de golpe.

### 2. La estela

Hoy el destino de apertura es binario: 1 la activa, 0 las demas. Pasa a ser:

- **La activa:** 1, como hoy.
- **Las del lado ya recorrido** (el no anclado: `absIndex = activa - travelDir * k`, con k = 1, 2, 3...): un ancho extra sobre la plegada, `ESTELA_MAX_PX * v * ESTELA_DECAE^(k-1)`, convertido en apertura dividiendo entre (natural − 110) y con tope en 1.
  - `v` es la velocidad de la tira normalizada: `clamp(|velocity| / ESTELA_VELOCIDAD_PLENA, 0, 1)`.
  - Valores de partida, sacados de las capturas de Javi (cynx a ~1,34 px de pantalla por px CSS): `ESTELA_MAX_PX` = 180, `ESTELA_DECAE` = 0,6, `ESTELA_VELOCIDAD_PLENA` = 30 px por frame. Se ajustan con Javi en la revision.
- **Las del lado hacia el que se avanza:** 0, como hoy.

El muelle de cada diapositiva sigue a su destino, y como `velocity` cambia de forma continua, la estela tambien. Con la tira quieta `v` = 0, y todas vuelven a 110: el reposo no cambia (CA7, CA8).

`computeFrame` coloca el lado anclado partiendo del borde fijo y usando solo los anchos de ese lado: la estela, que esta en el otro lado, no lo mueve.

### 3. Medida

- `scripts/medir-carrusel.mjs` gana dos cifras para los escenarios solo hacia delante: anchos por delante de la abierta (CA5 nuevo) y monotonia de la estela (CA12).
- "A medio plegar" se sigue contando, pero deja de ser criterio.

### Riesgos

| Riesgo | Mitigacion |
|---|---|
| La estela se ve como un acordeon y no como cynx | Tres constantes, y Javi las prueba en `next dev`. Si no se acierta, se deja el scroll libre sin estela, que ya le gusta mas |
| Una estela que crece mientras otra pareja se abre vuelve a dar saltos | CA6 se mide igual que antes, en los 4 escenarios |

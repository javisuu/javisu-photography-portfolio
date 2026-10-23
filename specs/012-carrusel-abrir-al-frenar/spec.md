# Spec 012 · Carrusel: abrir al frenar

- **Estado:** Aprobada por Javi el 2026-10-23. T1 a T4 hechos (`efad305`). **Enmienda 1 aprobada** el mismo dia (revision de Javi, T5); su plan, pendiente
- **Fecha:** 2026-10-23 · revisada el mismo dia con las respuestas de Javi
- **Requiere decision de Javi:** Si (choca con el spec: §2 dice que el commit no depende de la velocidad; ver "Choca con el spec"). No toca ninguna de las cuatro zonas que han roto el sitio: el carrusel tiene su propio bucle y no usa `GLSurface` (`CLAUDE.md`, "Architecture rules")

## Problema

Durante un scroll rapido, el carrusel abre cada album que pasa. El destino de apertura de la diapositiva activa es 1 en cuanto cambia de album, sea cual sea la velocidad (`src/motion/AlbumsCarousel.tsx:721`), y el cambio de album va por posicion (`:683`). Ademas, las diapositivas recien pasadas quedan entreabiertas segun la velocidad: es la estela de la spec 011, enmienda 1 (`:96-98`, `:719`).

Medido en produccion (`f662c7d`, 1440x900) con el fling fuerte de `scripts/medir-carrusel.mjs` (60 eventos de rueda de 50 px cada 8 ms), 3 pasadas (`2026-10-23_012-linea-base.txt`, scratchpad):
- **10 cambios de album** en cada pasada.
- **11 diapositivas distintas pasan de la mitad de su apertura**, contando la abierta al llegar y las de la estela.
- **11 o 12 diapositivas a medio plegar** en el peor frame.

La referencia es cynx.io. Segun la descripcion de su carrusel que trajo Javi el 2026-10-23, sin verificar contra el sitio:
- un proyecto solo se abre cuando esta centrado **y** el carrusel va despacio (menos de 0,25 proyectos por frame);
- durante un scroll rapido no se abre ninguno: pasa una fila de tiras, y la central "florece" al frenar.

Tres cifras de esa descripcion coinciden con lo medido en cynx para la spec 011: hueco de 24 px, alto abierto de 55vh (495 px a 900 de alto) y tira de una columna (~105 px).

Javi lo eligio el 2026-10-23 como la primera de tres mejoras (`specs/011-carrusel-fluido/tasks.md`, T17, decision (a)). Las otras dos, la disolucion con ruido y la entrada en `/albums`, van en specs propias.

## Decisiones (Javi, 2026-10-23)

| # | Pregunta | Decision |
|---|---|---|
| 1 | Umbral de velocidad | 20 px por frame de referencia para empezar, ajustable en la revision (CA8) |
| 2 | Estela mientras se va rapido | Se mantiene. "They are not unfolded completely neither are folded": una aproximacion intermedia, como cynx |
| 3 | Encaje al frenar | Si, despues de un scroll rapido, al proyecto mas cercano. Nunca en sentido contrario: solo el que esta activo o el siguiente en el sentido de la marcha, nunca el anterior. Sin scroll rapido, la tira sigue sin encajar, como hoy |
| 4 | Titulo y contador | Se actualizan en cada album que pasa, como hoy |
| 5 | Reduced motion | Se mantiene el pliegue, si no choca con esta spec. No choca: el umbral y el encaje solo cambian cuando se abre |
| 6 | Numeracion | Esta es la 012; la pagina de album en blanco pasa a la 013 |

## Objetivo

- Mientras la tira va rapida, no se abre ninguna portada: pasan tiras plegadas.
- Al frenar por debajo de un umbral de velocidad, se abre la que ha quedado activa, con el muelle de hoy.
- Si venia de un scroll rapido, la tira encaja en el proyecto activo o en el siguiente en el sentido de la marcha, el mas cercano de los dos, nunca en el anterior.
- En reposo, el carrusel queda exactamente como hoy.

## Fuera de alcance

- La disolucion con ruido al revelar la foto (decision (b)) y la entrada de las diapositivas en `/albums` (decision (c)): specs propias.
- Cambiar el aspecto o el tamano de las portadas (escala, anchos iguales): Javi lo descarto el 2026-10-23.
- El grano, la contra-escala, la fisica por tiempo y el muelle de la spec 011. Se usan tal cual.
- Movil y tactil (F4).

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [x] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion

Y `scripts/medir-carrusel.mjs`, para medir los criterios nuevos (CA2 y CA3).

## Choca con el spec

- **§2, "Commit is position-triggered, not velocity-triggered … no separate 'flick' threshold"** (`docs/design-spec-v2.md:28`). El cambio de album seguiria siendo por posicion, pero la apertura pasaria a depender de la velocidad, que es justo lo que ese punto descarta. Requiere decision de Javi.
- **§2, "no snap-back"** (`docs/design-spec-v2.md:28`). Decidido por Javi (decision 3): hay encaje, pero solo despues de un scroll rapido, y nunca hacia el proyecto anterior. Por debajo del umbral, la tira sigue quedandose donde se deja.
- **§2, "Free scrolling with a trail"** (`docs/design-spec-v2.md:29`). La estela se describe detras de "the open one". Decidido (decision 2): sigue mientras se va rapido, detras de la activa aunque esta no se abra.
- **`prefers-reduced-motion`.** La spec 011 mantuvo el pliegue con reduced motion (decision 2; `docs/design-spec-v2.md:34`). Se mantiene tambien aqui (decision 5).
- Nada mas: las fotos no se recortan ni cambian de color, y no hay parallax de cursor.

## Criterios de aceptacion

Las cifras salen de `scripts/medir-carrusel.mjs`, en sus mismas condiciones: 1440x900, mediana de 3 pasadas, primero local (`next build` + `next start`) y despues contra produccion tras el push.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/medir-carrusel.mjs --url <produccion> --repeticiones 3`, antes del cambio | Reproduce la linea base: fling fuerte con 10 cambios de album y 11 diapositivas que pasan de la mitad de su apertura |
| CA2 | `node scripts/medir-carrusel.mjs`, fling fuerte y rafaga | Mientras la tira va por encima del umbral de velocidad, ninguna diapositiva pasa de la mitad de su apertura. En todo el fling solo pasa de la mitad la que queda abierta al final, mas la abierta al llegar |
| CA3 | Igual, en el frame en que la velocidad cruza el umbral hacia abajo | La activa empieza a abrirse en menos de 100 ms, y se abre con el muelle de hoy: en reposo, a menos de 0,5 px de su ancho natural en unos 500 ms |
| CA3b | Igual, al acabar el fling fuerte y la rafaga | El reposo final encaja: el borde anclado de la abierta en su linea fija, ±1 px. El album final es el activo cuando la velocidad cruzo el umbral, o el siguiente en el sentido de la marcha, nunca el anterior |
| CA4 | `node scripts/medir-carrusel.mjs --geometria --comparar evidencia/2026-10-22_011-geometria-antes.json` | Reposo igual que hoy, ±1 px, tras `ArrowRight`, `ArrowRight`, `ArrowLeft` y `ArrowLeft`: una sola tecla no pasa del umbral y abre como siempre |
| CA5 | Igual, con `--fps 30` y `--fps 120` | El mismo reposo, ±1 px. El umbral va por tiempo, no por frame |
| CA6 | `node scripts/medir-carrusel.mjs --cpu 1` y `--cpu 4` | Se mantienen los criterios de la spec 011 en produccion (`evidencia/2026-10-23_011-produccion-cpu1.txt` y `-cpu4.txt`): 0 frames >50 ms, estilo ≤ 2 ms por frame a CPU×4, y nada por delante de la que se abre cambia de ancho |
| CA7 | `node scripts/diagnostico.mjs` | tsc, lint y build ok · 0 errores de consola · las invariantes que haya en `main` (hoy 105 de 105) |
| CA8 | Revision de Javi en `npm run dev`, con su trackpad, frente a cynx.io | Javi da por bueno el "florecer al frenar". Es testimonio |

## Preguntas abiertas

Ninguna. Las seis se cerraron el 2026-10-23 (ver "Decisiones"). Se dejan tal como se le hicieron a Javi, para el registro:

1. **Umbral de velocidad.** cynx usa 0,25 proyectos por frame. En el carrusel, un proyecto es un paso de 142 px (`STEP_DISTANCE`, `src/motion/AlbumsCarousel.tsx:46`), asi que serian unos 35 px por frame. Para comparar:
   - el fling fuerte de la medida llegaria a unos 26 px por frame. Es un calculo, SIN VERIFICAR: 2,25 px por evento (`WHEEL_SENSITIVITY` = 0,045, `:54`) con un evento por frame y `FRICTION` = 0,92 (`:53`). Si es asi, nunca pasaria del umbral de cynx. Se mide en CA1;
   - una tecla da 18 px por frame (`KEY_KICK_PX`, `:56`).

   Propuesta: empezar mas bajo que cynx, en unos 20 px por frame (abajo con una tecla, arriba con un fling), y ajustarlo en tu revision. ¿Te vale?
2. **¿La estela sigue?** Mientras no hay ninguna abierta, ¿las tiras recien pasadas siguen entreabiertas segun la velocidad (lo que aprobaste en la 011), o van todas plegadas como en la descripcion de cynx? En tus capturas de cynx, a velocidad media, si habia anchos intermedios.
3. **¿Encaje al frenar?** cynx redondea al proyecto mas cercano despues de un scroll rapido. Hoy, por debajo de un paso, la tira se queda donde la dejas, sin volver (`docs/design-spec-v2.md:28`, "no snap-back"). ¿Se mantiene, o quieres el encaje de cynx?
4. **Titulo y contador.** Mientras se va rapido, ¿se actualizan en cada album que pasa, como hoy, o solo al abrirse el final?
5. **Reduced motion.** ¿Se mantiene tambien aqui el pliegue con `prefers-reduced-motion`, como decidiste en la 011?
6. **Numeracion.** Esta spec toma el 012, que estaba reservado para la pagina de album que se ve en blanco al principio. Esa pasa a la 013, salvo que prefieras otro orden.

## Enmienda 1 (2026-10-23): umbral a medio paso y abierta centrada

- **Estado:** aprobada por Javi el 2026-10-23

### Que vio Javi en la revision (T5)

Probado en `npm run dev` con su trackpad, codigo de `efad305`. Tres cosas:

1. **"La idea es intentar abrir cada imagen."** Hoy una se abre y la anterior se cierra solo en el commit. En cynx, al frenar, la que llega empieza a abrirse como si fuera a abrirse entera, hasta que pasa un limite y la que queda abierta del todo es la siguiente: "una pelea armonica de plegar y desplegar, no tan rigida como ahora".
2. **Donde empieza a abrirse.** Aqui, a toda velocidad, practicamente en el centro. En cynx, mas hacia el lado por el que entra: `[_ X _ _]` con el carrusel moviendose de izquierda a derecha, y `[_ _ X _]` en el otro sentido.
3. **El salto.** Al cambiar de sentido no deberia haber salto: la ultima se pliega y la otra se despliega ocupando el sitio libre. De `[ A A B B ]` a `[ A B B C ]`, nada implica un salto.

Y despues: cynx "tiene el mismo problema". Lo resuelve con un umbral: a muy poca velocidad el carrusel se mueve, pero pasado el umbral la imagen se pliega de golpe. "Eso hace el borde mas flexible en los dos sentidos."

### Lo que hace cynx, medido

Filmado el 2026-10-23 con GPU real, a unos 29 frames por segundo: scroll muy lento hacia delante (60 eventos de 4 px cada 40 ms), pausa de 2,5 s y vuelta atras igual. En el scratchpad: frames en `cynx-lento/`, anchos por frame en `cynx-lento/anchos.json` y hoja de contacto `cynx-lento-hoja.jpg`. Scripts `cynx-lento.mjs` y `cynx-anchos.py`. Paso de cynx: plegada 105 + hueco 24 = 129 px.

- **La abierta reposa centrada:** 380–1059 px, centro en 719,5 de 1440 (`cynx/cynx-00-reposo.jpg`, 2026-10-22).
- **A muy poca velocidad no se abre nada poco a poco.** La tira entera se desliza con la abierta abierta del todo, unos 62 px en 3,9 s.
- **Umbral simetrico, a medio paso** (64,5 px).
  - Hacia delante, el cambio salta cuando el centro de la abierta se ha separado del centro de la pantalla unos 62–66 px.
  - Tras la pausa, reposo a −25 px. Al volver, salta a unos +62, a la misma distancia del otro lado.
- **El cambio es una animacion, no va por posicion.** La vieja se pliega y la nueva se despliega en unos 0,6 s: 441 y 300 px a los 4,1 s, la vieja a 117 px a los 4,7 s.
- **Sin salto.**
  - Durante el cambio, las de los dos lados solo se mueven con la tira: izquierda 190 → 185 px, derecha 1150 → 1146.
  - La vieja conserva su borde exterior y la nueva el suyo, asi que la nueva ocupa exactamente el sitio que deja la vieja.
  - En cynx todas las portadas miden lo mismo.
- **Sin encaje tras un scroll lento:** durante la pausa se quedo a −25 px.

### Lo que hay en el codigo detras de cada punto

- **1 y 2.**
  - **El commit es a un paso entero (142 px) y en un solo sentido** (`src/motion/AlbumsCarousel.tsx`, paso 3 del bucle).
  - La siguiente no se abre antes (plan, "Por que no se abre la siguiente antes de llegar a ella"). Cuando se abre, ya esta casi en el centro.
  - Ademas, T2 no deja que la activa se abra con la tira rapida, y eso quita la "pelea".
- **3. El reposo depende del sentido.**
  - Hacia delante se fija el borde derecho de la abierta en `centro + Wavg/2` = 980,5 px; hacia atras, el izquierdo en `centro − Wavg/2` = 459,5 (`:245-251`, `2026-10-22_011-geometria-antes.json`).
  - Una portada de 667 px reposa en 313,5–980,5 o en 459,5–1126,5 segun de donde venga: 146 px de diferencia.
  - Cada cambio de sentido lo corrige con un salto de `restOffsetPx`, que luego se relaja con el muelle (`:776`). Es el salto que ve Javi, y el "salto max de borde" de la medida: fling fuerte 23,2 px (`2026-10-23_012-t3-cpu1.txt`). CA6 de la 011 pedia 8; Javi lo acepto sin cumplirse.

### Decisiones nuevas (Javi, 2026-10-23)

| # | Pregunta | Decision |
|---|---|---|
| 7 | Cuando cambia la abierta (sustituye el commit a un paso entero) | **Umbral a medio paso, en los dos sentidos, como cynx.** La abierta puede separarse del centro hasta medio paso (71 px) hacia cualquier lado. Pasado ese punto, la vieja se pliega y la siguiente se despliega con el muelle de hoy, no por posicion. Con cambios seguidos, los muelles se solapan: esa es la "pelea" |
| 8 | Donde empieza a abrirse | **En el lado por el que entra.** Sale solo de la 7: al saltar el umbral hacia delante, el borde de la que llega esta entre 868,5 y 1014,5 px segun el ancho de la abierta (centro 720 − 71 + ancho/2 + hueco 32, con anchos de 375 a 667), en el tercer cuarto (`[_ _ X _]`). Hacia atras, el espejo |
| 9 | Con velocidad (sustituye el umbral 20/16 de las decisiones 1 y 2) | **Se funde en tiras, sin umbral.** Lo que se abre baja poco a poco con la velocidad, pero no a cero. A 30 px/frame o mas, como mucho un 20 % del ancho extra (una portada de 375 px llega a unos 163, frente a 110 plegada); por debajo de 16 px/frame, del todo. Nota de Javi, a toda velocidad de derecha a izquierda: `[\|\|][\|\|\|][\|\|\|][\|][\|]`. La que se abre lo intenta, pero llega la siguiente y la anterior se cierra; por eso las tiras de la zona de apertura se ven mas anchas que las plegadas. Las que han quedado mas lejos hacia el lado ya recorrido estan mas plegadas: la estela |
| 10 | Encaje (sustituye la 3) | **Solo tras un scroll rapido**, al album mas cercano y nunca al anterior, como en T3. Tras un scroll lento no hay encaje: la tira reposa donde se deja, con la abierta a menos de medio paso del centro. Una tecla lleva exactamente al album siguiente, centrado |
| 11 | Donde reposa la abierta | **Centrada en la pantalla**, sea cual sea su ancho y venga de donde venga, como cynx. La posicion de cada diapositiva depende solo de la posicion de la tira y de cuanto esta abierta cada una, nunca del sentido ni de cual es la activa. Asi un cambio de sentido no necesita correccion, y no hay salto |

**Consecuencias:**
- **Las portadas no miden lo mismo:** de 375 a 667 px, y en cynx todas igual. Durante un cambio, las de fuera de la pareja se deslizan poco a poco la mitad de la diferencia de ancho hacia cada lado, nunca de golpe.
- **El reposo cambia:** una portada de 667 px pasa de 313,5–980,5 a 386,5–1053,5, y una de 375, de 605,5–980,5 a 532,5–907,5. CA4 necesita una referencia nueva.
- **Una tecla** hoy deja 65 px de sobra (T3). Con la decision 10 llega exactamente.
- **El arrastre:** mientras el dedo esta puesto no hay encaje.
- **Reduced motion** sigue con el pliegue (decision 5).

### Choca con el spec

- **§2 de `docs/design-spec-v2.md`:**
  - las lineas fijas X_RIGHT/X_LEFT y el borde anclado segun el sentido pasan a la abierta centrada;
  - "Commit is position-triggered" sigue valiendo, pero a medio paso y en los dos sentidos;
  - "no snap-back" se mantiene tras un scroll lento, no tras uno rapido (como en T3).
- **Spec 011, CA5:** "nada por delante de la que se abre cambia de ancho" sigue valiendo, porque solo cambian de ancho la pareja y la estela. Pero durante un cambio, las de fuera de la pareja ya no estan quietas: se deslizan la mitad de la diferencia de ancho.
- **Objetivo de la 012 ("en reposo, exactamente como hoy") y CA4:** el reposo pasa a centrado.

### Criterios que cambian

Mismas condiciones que los de arriba. Los que no salen aqui se mantienen: CA6 (fluidez y coste), CA7 (diagnostico) y CA8 (revision de Javi). El script gana un escenario lento de ida y vuelta, como el filmado en cynx.

| # | Comando | Resultado esperado |
|---|---|---|
| CA2 (sustituye) | `node scripts/medir-carrusel.mjs`, escenario lento de ida y vuelta | La abierta cambia cuando su centro se separa del centro de la pantalla medio paso (71 px, ±3), hacia delante y hacia atras; nunca antes |
| CA3 (sustituye) | Igual, primer frame en que la que llega pasa de 110,5 px | Su borde de entrada esta en el tercer cuarto hacia delante (720–1080 px) y en el segundo hacia atras (360–720) |
| CA3b (sustituye) | `node scripts/medir-carrusel.mjs`, "trackpad real" y "con inercia" | Tras un scroll rapido: una sola abierta, centrada ±1 px, y las demas a 110 ± 0,5 px. Album final igual al del cruce o el siguiente, nunca el anterior. Tras un scroll lento: la abierta a menos de 71 px del centro, sin encaje |
| CA4 (sustituye) | `node scripts/medir-carrusel.mjs --geometria <salida> --comparar <referencia nueva>`, a 60, 30 y 120 fps | A la llegada, la abierta centrada ±1 px. `ArrowRight` deja el album siguiente centrado ±1 px; `ArrowRight` + `ArrowLeft`, la geometria de la llegada ±1 px. La referencia nueva se toma a 60 fps con este codigo |
| CA9 (nuevo) | `node scripts/medir-carrusel.mjs`, todos los escenarios, incluidos los cambios de sentido | Sin salto: ningun borde mas de 8 px por encima de la mediana de sus 6 vecinos. Es el CA6 de la 011, que no se cumplio (23,2 px) |
| CA10 (nuevo) | Igual, "trackpad real" (30 px/frame) | Con la tira a 30 px/frame o mas, ninguna diapositiva pasa del 20 % de su ancho extra. La estela decrece con la distancia hacia el lado recorrido (CA12 de la 011) |

### Preguntas abiertas

Ninguna. Las tres se cerraron el 2026-10-23:
1. **Donde reposa la abierta:** centrada (decision 11), tras ver que cynx tambien lo hace.
2. **Cuanto se abren a toda velocidad:** un 20 % del ancho extra a 30 px/frame (decision 9). Se ajusta en la revision.
3. **Numeracion:** enmienda 1 de la 012, que no esta fusionada y tiene CA8 abierto.
   - T2 y T3 se rehacen sobre el modelo nuevo.
   - Se quedan la medida de T1, el escenario con inercia y la regla de la cola de T3.

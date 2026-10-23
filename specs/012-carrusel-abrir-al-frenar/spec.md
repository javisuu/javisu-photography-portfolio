# Spec 012 · Carrusel: abrir al frenar

- **Estado:** Aprobada por Javi el 2026-10-23
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

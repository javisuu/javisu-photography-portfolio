# Spec 016 · Atlas: mas zoom y visor de fotos

- **Estado:** Aprobada (Javi, 2026-11-01: "OK ambos revisados")
- **Fecha:** 2026-10-31
- **Requiere decision de Javi:** Si (motivo: diseno nuevo del atlas, que cambia `docs/design-spec-v2.md` §5). No toca ninguna de las cuatro zonas sensibles

## Problema

Lo que dijo Javi el 2026-10-31:
- El atlas "ha encantado a la gente", "en movil es lo unico que va" y "es muy divertido", pero tenia "muchas contradicciones de diseno".
- "Todas las coordenadas estan introducidas de cada imagen, por lo que la precision puede ser milimetrica", y le gustaria "poder enfocar mas".
- No quiere la lista que sale hoy al abrir un grupo.

En el codigo:
- **Zoom.** El radio del globo va de `0,32` a `1,6` veces `min(ancho, alto)` (`src/motion/Atlas.tsx:54-55`, `:332-333`). El limite venia de la reticula de puntos. Desde que la reticula se remuestrea a 7 px en pantalla con cualquier zoom (`src/motion/Atlas.tsx:48`, `:154`), el punto que obligo a limitarlo ya no existe. SIN VERIFICAR: que la reticula aguante zooms mucho mayores sin perder rendimiento.
- **Grupos.** Las marcas a menos de 14 px en pantalla se agrupan (`src/motion/Atlas.tsx:62`, `:548-576`). Con el zoom maximo de hoy, las fotos de una misma ciudad siguen agrupadas.
- **Clic.** En un grupo, el globo se centra y se abre un panel de 240 px con la lista de fotos (`src/motion/Atlas.tsx:800-803`, `:881-900`). En una foto suelta, se centra y salta a su album (`:805-808`).
- **Coordenadas.** 26 de 31 fotos tienen `lat`/`lng` y 5 siguen a `null` (Puerto Escondido x3 y San Blas x2, `src/data/photos.ts:206,218,231,241,253`). Van al centroide de su ciudad (decision 1). 6 fotos son de precision `city` (centroide de la ciudad), y 25 `exact`.

## Objetivo

Se puede acercar el globo lo bastante como para separar las fotos de una misma ciudad que tengan coordenadas exactas. Al abrir una foto o un grupo, un visor lateral muestra las fotos una a una, con su informacion, sin salir del atlas y con el globo visible.

## Propuesta (decisiones de Javi del 2026-10-31)

- **Mas zoom.** Se sube `ZOOM_MAX_MULT` hasta que dos fotos `exact` de la misma ciudad se separen, y se comprueba que la reticula de puntos sigue fluida.
- **El globo se queda.** El visor se despliega en un lateral y el globo sigue visible y usable al lado.
- **El visor** sustituye a la lista de grupo y tiene:
  - la foto actual en grande, entera y sin recortar;
  - su informacion: titulo, ciudad y pais, datos de captura, coordenadas DMS solo si es `exact`, y enlace a su album;
  - abajo, una tira pequena con **solo las fotos del grupo** abierto, desplegadas una junto a otra, la actual un poco mas grande, y flechas para pasar a la anterior o la siguiente. Un carrusel sencillo, nada parecido al de `/albums`.
- **Foto suelta.** Abre el visor con una sola foto, sin tira y con un enlace a su album, en lugar de saltar directamente al album.

## Fuera de alcance

- El modelo de navegacion del globo: rotacion sin paneo, inercia, deriva en reposo y zoom con rueda o pellizco (`docs/design-spec-v2.md` §5). Solo cambia el limite del zoom.
- La version movil del visor, mas alla de que no rompa: va con la pasada de movil e iPad (paso 8 de `docs/ESTADO.md`). Como encaja el visor en un movil en vertical se decide alli.

## Zonas afectadas

- [x] Atlas (`src/motion/Atlas.tsx`, `src/app/atlas/page.tsx`)
- [x] Datos (`src/data/photos.ts`): centroide de ciudad en las 5 fotos sin coordenadas
- [x] Diagnostico (`scripts/diagnostico.mjs`): visor, zoom y canvas
- [x] Documentacion (`docs/design-spec-v2.md` §5)

## Choca con el spec

- `docs/design-spec-v2.md` §5 describe el panel de lista de los grupos y que un clic en una foto suelta abre su album. Esta spec cambia las dos cosas, por decision de Javi.
- Reglas duras de `CLAUDE.md`: ninguna en contra. La foto grande del visor no se recorta y cabe en el viewport. Las miniaturas de la tira tampoco: van enteras, a la misma altura. La interfaz sigue en grises. No hay parallax de cursor. Con reduced motion, el visor aparece sin animacion.
- Hay que respetar la precision: una foto `city` nunca muestra coordenadas DMS en el visor (`CLAUDE.md`, "Architecture rules", `place`).

## Criterios de aceptacion

A 1440x900 salvo que se diga otra cosa.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` | tsc, lint y build ok; 0 errores de consola; todas las invariantes en verde, incluida la del buffer del canvas del atlas = caja x dpr |
| CA2 | Seccion nueva `atlas`: zoom al maximo sobre el par de fotos `exact` mas cercano de una misma ciudad | Las dos marcas a mas de 14 px en pantalla (`CLUSTER_THRESHOLD_PX`), es decir, separadas |
| CA3 | Misma seccion: rueda de zoom continua hasta el maximo, frames por rAF | 0 frames > 50 ms despues del primero, con CPU x1 |
| CA4 | Misma seccion: clic en un grupo | Se abre el visor (`[data-atlas-viewer]`), no la lista de hoy. La foto grande cabe en el viewport y su proporcion se desvia < 1 % de la natural. La tira tiene tantas miniaturas como fotos el grupo |
| CA5 | Misma seccion: flecha siguiente, N veces en un grupo de N | La foto grande pasa por todas las del grupo, en orden, sin repetir |
| CA6 | Misma seccion: el globo con el visor abierto | El canvas sigue visible (su caja no queda tapada mas de un X %, fijado en el plan) y responde a un arrastre: cambia la rotacion |
| CA7 | Misma seccion: visor de una foto `city` | Sin coordenadas DMS en el visor |
| CA8 | Misma seccion con `reducedMotion: "reduce"` | El visor aparece sin fundido ni desplazamiento: `opacity` y `transform` finales en la primera muestra |
| CA9 | Javi lo prueba en su maquina y en el movil | Le convence (testimonio) |

## Decisiones de Javi (2026-10-31)

| # | Pregunta | Decision |
|---|---|---|
| 1 | Las 5 fotos sin coordenadas | Van juntas en su ubicacion geografica: el centroide de su ciudad, con `precision: "city"`. Puerto Escondido x3 y San Blas x2 forman un grupo cada una. Los valores los escribe el agente en `src/data/photos.ts:206,218,231,241,253` (dato de lugar, no EXIF) y Javi los revisa antes del commit |
| 2 | Clic en una foto suelta | Abre el visor con esa foto y un enlace a su album, en vez de saltar al album |
| 3 | Visor en movil | Se decide en la pasada de movil e iPad. Aqui solo tiene que no romper |
| 4 | Miniaturas de la tira | Enteras, a la misma altura y con anchos distintos |
| 5 | Hasta donde llega el zoom | Lo justo para separar las fotos `exact` de una misma ciudad. Las `city` comparten centroide y siempre van en grupo |

## Preguntas abiertas

- Ninguna.

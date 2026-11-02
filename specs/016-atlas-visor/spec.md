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

## Enmienda 1 (2026-11-01): submapas locales

- **Estado:** Aprobada (Javi, 2026-11-01: "OK", junto con `plan.md`).
- **Respuestas de Javi a las preguntas del plan (2026-11-01):**
  1. La cita de OSM va solo en el atlas, junto a la leyenda. `/credits` no se toca.
  2. Centroides propuestos aceptados: Puerto Escondido `15.8720, -97.0767` y San Blas `9.5583, -78.9483`.
  3. El recorte de la miniatura del hover se queda como esta ("da igual"). En los datos, "New York" pasa a "New York City" en las 6 fotos (`src/data/photos.ts:368,380,390,400,410,420`), para que la linea de cifras cuente una sola ciudad.

**Hecho nuevo**, medido al redactar el plan sobre `src/data/photos.ts` y `public/atlas/land-mask.png`:
- El par de fotos `exact` con coordenadas distintas mas cercano de una misma ciudad esta en San Sebastian, a 40 m (norte/05 y sol/01). Para separarlo con margen hace falta R ≈ 3,4 millones de px. Hoy el maximo es 1,6 x 609 ≈ 974 px (`src/motion/Atlas.tsx:55`).
- La mascara del mundo mide 2048x1024 (unos 20 km por pixel) y sale de Natural Earth 110m (`docs/atlas-data-sources.md`). Por encima de R ≈ 4563 px, un pixel de la mascara ocupa mas de 14 px en pantalla, o sea dos puntos de la reticula: la costa se ve en escalones. A nivel de calle, toda la pantalla cae dentro de un solo pixel: todo puntos o todo vacio.
- 7 pares de fotos `exact` tienen coordenadas identicas (Porto do Son x2, NY 02=03, Villaquiran x3 y dos pares de San Sebastian). No se separan con ningun zoom: el visor los muestra como grupo.

**Decision de Javi (2026-11-01): submapas locales.** Por encima del limite de la mascara del mundo, solo en las zonas con fotos que lo necesitan, la reticula pasa a leer mascaras locales de alta resolucion. Se generan desde la costa de OpenStreetMap. Fuera de esas zonas, el zoom se para en el limite de la mascara del mundo.

Cambios en la spec:
- **Decision 5** pasa a ser: el zoom llega a separar las fotos `exact` con coordenadas distintas de una misma ciudad, pero solo dentro de una zona local. En cada punto, el zoom maximo es el que permite la mascara mas fina que cubre el centro de la vista.
- **Zonas afectadas**, se anaden: `scripts/generate-atlas-local-masks.mjs` (nuevo), `public/atlas/local/` (mascaras generadas), `src/data/atlas-zones.json` (generado) y `docs/atlas-data-sources.md`. Tambien una dependencia de desarrollo para leer shapefiles.
- **Licencia:** los datos de OSM son ODbL y obligan a citar "© OpenStreetMap contributors". La cita va en el propio atlas. Si ademas va en `/credits` (pagina cerrada), lo decide Javi (pregunta 1 de `plan.md`).
- **CA2** pasa a decir: zoom al maximo sobre el par de fotos `exact` con coordenadas **distintas** mas cercano de una misma ciudad.
- **CA nuevos:**

| # | Comando | Resultado esperado |
|---|---|---|
| CA10 | Seccion `atlas`: toda pareja de coordenadas `exact` distintas que no se separa a R = 4563 px cae dentro de una zona de `src/data/atlas-zones.json` | 0 parejas fuera de zona (avisa si alguien anade fotos y no regenera las zonas) |
| CA11 | Seccion `atlas`: con el centro fuera de toda zona, rueda de zoom hasta el tope | R final ≤ 4563 px |
| CA12 | `/atlas` en reposo | El texto "OpenStreetMap" esta en el DOM y es visible |

## Enmienda 2 (2026-11-02): el clic acerca, y San Miguel sin zoom profundo

- **Estado:** Decidida por Javi (2026-11-02), tras probar el zoom de T5 a T7 en su maquina: "El resto esta genial".
- **Que dijo:** "san miguel de allende no me interesa que este con tanto zoom", y esperaba que al pulsar un grupo desde lejos ("espana con 13") el globo "se enfocara mas sobre espana", "y asi con el resto".
- **Decisiones (respuestas a dos preguntas cerradas, 2026-11-02):**
  1. **Clic en un grupo: acercar y luego visor.** El globo gira hacia el grupo y hace zoom hasta que el grupo se parte. Cuando el grupo ya no se puede partir, el clic abre el visor. Hay dos casos: todas sus fotos estan en el mismo punto, o el zoom necesario pasa del techo posible en ese sitio.
  2. **San Miguel de Allende, siempre agrupada.** Se quita su zona: no tiene mapa local y su zoom se para en 4563 px, como fuera de zona. Sus 3 fotos `exact` (a 226 m) se ven como un grupo que se abre en el visor.

Cambios en la spec:
- **Fuera de alcance** deja de incluir el clic: el modelo de navegacion (rotacion sin paneo, inercia, deriva, rueda y pellizco) no cambia, pero el clic en un grupo ahora tambien acerca. Es la unica forma de zoom que no es rueda ni pellizco, y siempre va hacia el centro del grupo.
- **Zoom del clic:** objetivo R = 21 / (mayor salto angular del arbol minimo que une las fotos del grupo), es decir 1,5 veces el umbral de agrupado de 14 px. Si ese R pasa del techo posible en el centro del grupo (la zona mas fina que lo cubre, cargada o no, o 4563 px), el grupo no se puede partir y se abre el visor sin zoom. El giro y el zoom van juntos, con la curva del recentrado; el zoom se interpola en escala logaritmica.
- **Zonas:** `scripts/generate-atlas-local-masks.mjs` gana una lista de ciudades excluidas (`EXCLUDED_CITIES`), que se escribe tambien en `src/data/atlas-zones.json` (`excludedCities`).
- **CA4** pasa a decir: clic en un grupo que **no se puede partir** abre el visor.
- **CA10** pasa a decir: toda pareja `exact` distinta que no se separa a 4563 px cae en una zona, **salvo las de una ciudad de `excludedCities`**.
- **CA nuevo:**

| # | Comando | Resultado esperado |
|---|---|---|
| CA13 | Seccion `atlas`: clic en el grupo mas grande del encuadre por defecto y espera a que acabe la animacion | Las fotos del grupo quedan repartidas en 2 o mas grupos, la media en pantalla de sus fotos queda a menos de 2 px del centro del canvas y no hay frames > 50 ms durante la animacion |

**Ajuste a la enmienda 2 (Javi, 2026-11-02),** tras probarla: "con las de panama no funciona y con las de puerto escondido el zoom quizas es mas pequeno que en otras, no quiero algo agresivo pero si un zoom que englobe centro america". San Blas (las 2 fotos de Panama) y Puerto Escondido (3) tienen todas sus fotos en un mismo punto (centroide `city`), asi que no se podian partir y el clic solo giraba el globo. Ahora un grupo que no se puede partir tambien acerca antes de abrirse, hasta una vista regional: 2500 km en el lado corto del canvas (`CLICK_REGION_KM`; R ≈ 1550 a 1440x900). Si ya se esta mas cerca, no aleja.

## Enmienda 3 (2026-11-02): un solo visor, un recorrido por todo el archivo

- **Estado:** Decidida por Javi (2026-11-02): "usar un unico visor para todas las imagenes para dar asi 2 formas de navegar la pagina. Obviamente las fotos tendran que estar agrupadas por proximidad geografica. Un grafo al estilo hamiltoniano (es una broma)".
- **Decisiones (respuestas a tres preguntas cerradas, 2026-11-02):**
  1. **Tira:** todas las fotos, en el orden del recorrido, con un hueco entre lugares. La tira se desplaza para que la actual este siempre a la vista.
  2. **El globo acompana:** si la foto siguiente esta cerca, el globo solo gira. Si esta lejos (de Mexico a Espana), se aleja a mitad del viaje y vuelve a acercarse al llegar, como un vuelo. Siempre termina en la vista regional de la enmienda 2.
  3. **Entrada:** un boton en el atlas abre el visor en la primera foto del recorrido. Ademas, "el visor se despliega tambien si se hace click sobre una imagen, de forma que coincidira a medio recorrido": pulsar una foto suelta, o un grupo que ya no se puede partir, abre el visor en esa foto, dentro del recorrido completo.

Cambios en la spec:
- **El visor** deja de mostrar "solo las fotos del grupo abierto": recorre todo el archivo. El pie de foto, el enlace al album, las flechas y las teclas no cambian. Las flechas dan la vuelta al llegar al final.
- **Recorrido:** un camino abierto que pasa una vez por cada lugar (ciudad). Se calcula al compilar en `src/app/atlas/page.tsx`: vecino mas cercano desde cada lugar mas 2-opt, y se queda el mas corto. Empieza por el extremo cuyo lugar aparece antes en el orden de los albumes. Dentro de un lugar, las fotos van en el orden del album.
- **Clic en un grupo que se puede partir:** no cambia (acerca hasta partirlo, enmienda 2).
- **CA4** pasa a decir: el visor se abre en la primera foto del grupo pulsado y la tira tiene una miniatura por cada foto del atlas.
- **CA5** pasa a decir: N-1 veces "siguiente" desde la foto abierta pasa por todas las fotos del atlas, en el orden del recorrido y sin repetir.
- **CA nuevos:**

| # | Comando | Resultado esperado |
|---|---|---|
| CA14 | Seccion `atlas`: el recorrido que expone la sonda | Cada ciudad aparece en un solo tramo seguido, y el recorrido es mas corto que seguir las fotos en el orden de los albumes |
| CA15 | Seccion `atlas`: "siguiente" desde la ultima foto de un lugar hacia el siguiente lugar del recorrido que este mas lejos | El centro de la vista acaba a menos de 2 px de la foto, R en la vista regional, y 0 frames > 50 ms durante el vuelo |
| CA16 | Seccion `atlas`: el boton de entrada | Abre el visor en la primera foto del recorrido |

**Ajuste a la enmienda 3 (Javi, 2026-11-02),** tras probarla: "el recorrido deberia de ser mas zoomeado, por ejemplo en ny el zoom tiene que llegar hasta la foto individual. No me gusta la barra deslizadora que ha aparecido debajo del grupo de imagenes del visor". Cada paso del recorrido, y la apertura del visor con un clic, aterriza ahora con el zoom de esa foto: 1,5 veces el umbral de agrupado (14 px) respecto a la foto mas cercana que este en otro punto. Las fotos que comparten punto no cuentan, porque nunca se separan. Ese zoom tiene dos topes: no pasa del techo posible en ese sitio (San Miguel se queda en 4563) ni baja de la vista regional. La tira sigue desplazandose, pero sin barra visible. **CA15** pasa a decir: el centro a menos de 2 px de la foto, y la foto sola en su marca (o solo con las que comparten su punto), sin frames > 50 ms.

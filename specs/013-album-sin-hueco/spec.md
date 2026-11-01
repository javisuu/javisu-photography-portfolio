# Spec 013 · Pagina de album sin hueco al llegar

- **Estado:** Aprobada (Javi, 2026-10-31: "Todo OK")
- **Fecha:** 2026-10-31
- **Requiere decision de Javi:** Si (motivo: GLSurface, solo como consumidor; ver "Choca con el spec"). La spec no cambia `src/motion/GLSurface.tsx`: usa dos props que ya existen y que hoy no usa ningun llamador (`onTexturesReady` y `readyNodeCount`, `src/motion/GLSurface.tsx:147-161`). Aun asi, depende de cuando dispara esa senal, que forma parte del ciclo de vida de `GLSurface`

## Problema

Al llegar a `/album/<slug>` se ve el bloque del titulo y el hueco de la primera foto queda en blanco un momento antes de que aparezca la foto. Javi lo ve "1 segundo (o menos)" en todos los casos de llegada (conversacion del 2026-10-31). Es B9 de `docs/ESTADO.md`.

Medido en produccion el 2026-10-31, 1440x900, dpr 1, 3 repeticiones por caso. Script: `b9-medir.mjs` (scratchpad de la sesion). Salida: `evidencia/2026-10-31_013-linea-base.txt` (SIN VERIFICAR que Javi la haya copiado; si no, esta en `b9/b9-resumen.txt` del scratchpad):

| Llegada | Lo que se ve (fotogramas de screencast, repeticion 1) |
|---|---|
| Desde el carrusel (`/albums`, clic) | Titulo "America" con el hueco en blanco ~70 ms (fotograma 206 ms en blanco, 273 ms con foto) |
| Desde NEXT ALBUM | Titulo "Norte" con el hueco en blanco ~150 ms (fotogramas 1083 a 1200 ms en blanco, 1233 ms con foto) |
| Carga directa (`/album/norte`) | Parpadeo: foto a 417 ms, **en blanco** a 467 ms, foto otra vez a 483 ms |

La red no es la causa principal: la foto 1 llega 50-80 ms despues del clic (~74 KB, `_next/image?...&w=1080`). En una maquina con dpr mayor y red real el hueco crece, que es lo que ve Javi (SIN VERIFICAR: no se ha medido con dpr > 1 ni con red limitada).

Causa, segun el codigo:
- `AlbumPhotos` oculta **todas** las `<img>` (`visibility: hidden`) en cuanto `GLSurface` avisa de que hay contexto WebGL (`src/motion/AlbumPhotos.tsx:49`, `:90`, `:184`).
- `GLSurface` avisa justo al arrancar el bucle (`src/motion/GLSurface.tsx:441`), antes de tener ninguna textura. Cada textura espera a que su `<img>` cargue, se decodifica con `createImageBitmap` y se sube de 2 en 2 por frame (`src/motion/GLSurface.tsx:289-297`, `:99`).
- Entre las dos cosas no se ve ni la `<img>` ni el plano GL. En la carga directa la `<img>` llega a pintarse antes de que haya contexto, por eso parpadea.
- Las fotos del album no llevan `priority` (`src/motion/AlbumPhotos.tsx:77-91`), asi que la primera se pide como `lazy`, el valor por defecto de `next/image`.

## Objetivo

Al llegar a una pagina de album, la foto 1 no aparece hasta que puede pintarse, y entonces entra con un fundido corto. Nunca se ve su hueco en blanco ni la foto desaparecer despues de haberse visto.

## Propuesta (opcion 1 + complemento 3, elegidas por Javi el 2026-10-31)

- **Fundido de entrada:** las fotos que estan en pantalla al llegar empiezan a `opacity: 0`, puesta inline en el padre de cada `<img>`. Es el canal que `GLSurface` ya lee por plano (`src/motion/GLSurface.tsx:419-423`, `CLAUDE.md`, "Architecture rules"). `AlbumPhotos` pasa `readyNodeCount` y `onTexturesReady`. Cuando las texturas de esas fotos estan subidas, el padre pasa a `opacity: 1` con un fundido.
- **Sin GL:** si `onAvailabilityChange` da `false`, las fotos se muestran sin esperar, igual que hoy.
- **Prioridad:** la primera foto del album se carga con `preload` y `fetchPriority="high"`. En Next 16.3.2 `priority` esta obsoleto en favor de `preload` (`node_modules/next/dist/shared/lib/get-img-props.d.ts:23-28`). `preload` quita el `lazy` y anade la precarga, pero no toca `fetchPriority` (`node_modules/next/dist/shared/lib/get-img-props.js:271`, `:569-588`).
- **Reduced motion:** se espera igual a que la foto este lista, pero aparece de golpe, sin fundido.

## Fuera de alcance

- Cambiar `src/motion/GLSurface.tsx` (opcion 2: ocultar cada `<img>` cuando su textura este lista). Descartada por Javi el 2026-10-31.
- Cualquier transicion animada entre el carrusel y el album. Javi no la quiere (2026-10-31); ver "Decisiones" y la pregunta abierta 1.
- B8, el contador tapado por las fotos de las filas desplazadas a la derecha.
- El carrusel, el landing y su `GLSurface`.
- Las fotos que no estan en pantalla al llegar: aparecen al hacer scroll como hoy, salvo que la pregunta abierta 2 diga otra cosa.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`): solo se consume su API, no se modifica
- [ ] Datos (`src/data/photos.ts`)
- [x] Diagnostico (`scripts/diagnostico.mjs`): seccion nueva `llegada al album`, ver CA2 a CA4
- [x] Documentacion (`docs/design-spec-v2.md` §3, `CLAUDE.md`, "Architecture rules")

## Choca con el spec

Nada contra las reglas duras de `CLAUDE.md`:
- No se recorta ninguna foto ni cambia su tamano.
- No hay color en la interfaz.
- No hay parallax de cursor.
- El fundido es solo de `opacity`.
- Se respeta `prefers-reduced-motion`.

**Contradice `docs/design-spec-v2.md:43`**, que dice que la entrada de la pagina de album **es** la transicion carrusel→album (GSAP Flip, "No hero"). Javi decidio el 2026-10-31 que no quiere ninguna animacion de transicion entre el carrusel y el album. Este fundido pasa a ser la entrada de la pagina en todos los casos, y §3 se actualiza en esta spec. La retirada del Flip del Motion inventory (#4), de `CLAUDE.md` y de `docs/ROADMAP.md` (F3, tarea 9) esta pendiente de que Javi la confirme (pregunta abierta 1).

## Criterios de aceptacion

Todos a 1440x900, contra produccion despues del despliegue y en local antes de fusionar. "Foto 1" es la `<img>` de `[data-photo-index="0"]`. "Hueco en blanco" es un fotograma en el que la caja de la foto 1 esta entera del color de fondo (`#FAFAFA`, ±2 por canal) mientras su padre tiene `opacity` 1.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` | tsc, lint y build ok; 0 errores de consola; todas las invariantes en verde (hoy 122 de 122, `evidencia/2026-10-28_diagnostico.txt`), mas las nuevas de CA2 a CA4 |
| CA2 | `node scripts/diagnostico.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 3`, seccion `llegada al album`, en los tres casos (carrusel, NEXT ALBUM, carga directa) | 0 fotogramas de hueco en blanco en las 9 pasadas. Linea base: 70 ms, 150 ms y un parpadeo de 1 fotograma (`evidencia/2026-10-31_013-linea-base.txt`) |
| CA3 | Misma seccion, misma pasada | La foto 1 nunca pasa de verse a no verse: en la secuencia de fotogramas de su caja no hay ningun fotograma "con foto" seguido de uno "en blanco". Linea base: 1 de 1 en carga directa |
| CA4 | Misma seccion, con `reducedMotion: "reduce"` | 0 fotogramas de hueco en blanco, y la `opacity` del padre de la foto 1 pasa de 0 a 1 entre dos muestras de rAF consecutivas (sin fundido) |
| CA5 | Misma seccion: tiempo desde el clic hasta el primer fotograma con la foto 1 a `opacity` 1 | Mediana de 3 no peor que la linea base mas la duracion del fundido. La linea base exacta se toma en la primera tarea, porque hoy el script no separa "foto visible" de "foto entera" |
| CA6 | Seccion `llegada al album`: atributos de la foto 1 en los 4 albumes | `loading="eager"` y `fetchpriority="high"` en la `<img>` de `[data-photo-index="0"]`, y `loading="lazy"` en las demas |
| CA7 | Seccion `llegada al album` con WebGL desactivado (`--disable-gpu --disable-webgl` en el Chromium de la seccion) | La foto 1 se ve sin esperar a ninguna senal de GL: `opacity` 1 y `visibility: visible` en la primera muestra con la `<img>` cargada |
| CA8 | Seccion `textos del album` y `barra de scroll` del diagnostico | Sin regresion: mismos resultados que en `evidencia/2026-10-28_diagnostico.txt` |
| CA9 | Javi abre un album desde el carrusel, desde NEXT ALBUM y recargando, en su maquina | No ve el hueco en blanco (testimonio, no medida) |

## Decisiones de Javi (2026-10-31)

| # | Pregunta | Decision |
|---|---|---|
| 1 | Transicion carrusel→album | Ninguna. El fundido es la entrada del album en todos los casos |
| 4 | Que se funde | La foto, su pie y su texto lateral entran juntos. En las filas sin texto el padre de la `<img>` ya es la fila entera (`src/motion/AlbumPhotos.tsx:166-171`). En las filas con texto es solo la celda de la foto (`:157`), asi que hay que llevar la misma `opacity` al resto de la fila sin romper la lectura de `GLSurface`, que mira el `parentElement` directo (`src/motion/GLSurface.tsx:421`) |
| 5 | Duracion y curva | Se empieza con 400 ms y ease-out, y Javi lo ajusta viendolo en `npm run dev` |
| 6 | Red de seguridad | Si: si `onTexturesReady` no dispara en 1,5 s, el fundido arranca igualmente. `GLSurface` solo escucha `load` (`src/motion/GLSurface.tsx:296-297`), asi que una foto que falla no lo dispararia nunca |

## Preguntas resueltas antes del plan (2026-10-31)

1. **Retirar el Flip.** Confirmado por Javi ("Todo OK"). Se retiran la tarea 9 de F3 (`docs/ROADMAP.md`), el #4 del Motion inventory (`docs/design-spec-v2.md:83`), la frase de §3 (`:43`) y la de §2 (`:38`), las menciones de `CLAUDE.md` y el comentario de `src/app/album/[slug]/page.tsx:44-46`. GSAP deja de tener uso previsto.
2. **Que fotos esperan.** Solo la foto 1. Medido en produccion en los 4 albumes, a 1440x900, 1920x1080 y 2560x1440: al llegar solo la foto 1 esta en pantalla, con su borde superior a 471 px (`b9-preguntas.mjs`, scratchpad de la sesion, salida en la conversacion). Asi que `readyNodeCount = 1`. La foto 1 nunca lleva texto (`src/data/photos.ts:52`), asi que su `<img>` cuelga directamente de la fila, con el pie (`src/motion/AlbumPhotos.tsx:166-171`). Basta con fundir esa fila.
3. **`priority` en Next 16.** Esta obsoleto; se usa `preload` (ver "Propuesta").
7. **Navegacion entre albumes.** NEXT ALBUM monta un `GLSurface` nuevo: al pasar de `america` a `norte`, el `<main>` visible tiene 1 canvas, y no es el de antes (`b9-preguntas.mjs`, salida en la conversacion). `onTexturesReady` dispara en cada llegada y basta con la API actual.

## Preguntas abiertas

- Ninguna.

## Enmienda 1 (2026-10-31): la transicion carrusel→album sigue en pie; `eager` en vez de `preload`

1. **No se retira el Flip.** Despues de probar el arreglo, Javi: "Esta bien", pero "se detecta como que la primera foto no esta precargada lo que da el efecto de que aparece despues", y "el problema principal es la carga de la primera foto, solucionable con una transicion carrusel->album". Se anula la decision 1 de la tabla. No se tocan `docs/design-spec-v2.md:38`, `:43` y `:83`, `CLAUDE.md` ni `docs/ROADMAP.md` (T6 sale de la spec). La transicion queda para una spec propia, sin numero todavia.
2. **`loading="eager"` + `fetchPriority="high"` en vez de `preload`.** Con `preload`, en `next dev` la foto 1 tardaba ~2,4 s en cargar, frente a ~230 ms sin el (una pasada de cada uno, `2026-10-31_013-arreglo.txt` y `013-sin-preload.txt`, scratchpad de la sesion). `eager` se comparo despues, una tanda detras de otra: la foto 1 carga en 120-220 ms y el contexto GL llega en 345-794 ms, como en la linea base (`brygl5lgf.output`, scratchpad; la tanda `lazy` de la comparacion se corto y no tiene datos). CA6 cambia en consecuencia: `loading="eager"` y `fetchpriority="high"` en la foto 1.
3. **CA3 y CA7, criterio ajustado** (`scripts/diagnostico.mjs`, seccion `llegada al album`):
   - CA3 solo cuenta como parpadeo un fotograma en blanco con la fila a opacity 1 despues de haberse visto la foto. Al venir del carrusel o de NEXT ALBUM, el primer fotograma aun es la pagina anterior, y se contaba como "foto vista".
   - CA7 pide que, sin WebGL, la foto acabe visible sin fundido. Antes de hidratar, la fila esta a 0 por el HTML del servidor.

## Enmienda 2 (2026-11-01): sin fundido

Medido en produccion, CA5 no se cumplia del todo: el fundido sumaba sus 400 ms a la espera de la textura. NEXT ALBUM llegaba a 717 ms frente a un limite de 617, y el carrusel a 715 frente a 706 (`evidencia/2026-11-01_013-produccion.txt`, `tasks.md` T8). Javi: "pues entonces eliminamos el efecto, ¿que sentido tiene?, se solucionara con una transicion carrusel->album".

- La fila de la foto 1 sigue oculta hasta que su textura esta subida (o 1,5 s, o sin WebGL), pero pasa de 0 a 1 en un frame, sin fundido. Se mantiene lo que quita el hueco en blanco y el parpadeo.
- El diagnostico comprueba "sin fundido" en todas las llegadas, no solo con reduced motion.
- CA5 pasa a medir el retraso frente a la linea base, sin sumar fundido. En local (`evidencia/2026-11-01_013-enmienda2.txt`, medianas de 3), frente a la linea base local (`evidencia/2026-10-31_013-linea-base-diagnostico.txt`):

| Llegada | Ahora | Linea base | Diferencia |
|---|---|---|---|
| Carrusel | 385 ms | 349 ms | +36 ms |
| NEXT ALBUM | 534 ms | 519 ms | +15 ms |
| Carga directa | 778 ms | 287 ms | +491 ms |

La carga directa sube porque antes la `<img>` del DOM se pintaba antes que GL y luego desaparecia (el parpadeo de CA3). Ahora la foto espera a GL y no desaparece. Javi ya acepto esa espera: la llegada lenta la resolvera la transicion.

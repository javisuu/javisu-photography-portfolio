# Spec 019 · Transicion carrusel → album

- **Estado:** Aprobada (Javi, 2026-11-14)
- **Fecha:** 2026-11-14
- **Requiere decision de Javi:** Si (motivo: GLSurface, porque cambia su ciclo de vida en la pagina de album: inactivo durante el vuelo y `readyNodeCount` de 1 a 2. Ademas toca el carrusel, dado por cerrado en `CLAUDE.md`, y se aparta del design spec §3 y del inventario de motion #4, ver "Choca con el spec")

## Intencion de Javi (texto literal, fuente de verdad)

> **Qué se busca**
> El carrusel y la página de álbum no son dos páginas: son dos estados de la misma. El carrusel es el álbum sin montar. Abrirlo no navega a otro sitio, lo monta delante del usuario. Al salir, se desmonta.
>
> **Qué ocurre**
> Al clicar la lámina abierta, el título del álbum viaja desde su posición en el carrusel hasta su posición en el bloque de título de la página. Una sola imagen asciende al primer hueco del álbum y se desrecorta: su ventana crece hasta el rect completo de esa foto y la imagen interior pasa de recorte a cuadro entero, revelándose al final del recorrido. Todo lo demás desciende y sale por abajo, en cascada de izquierda a derecha, sin fundirse: se va a algún sitio, no se muere.
>
> El elemento compartido real es el título, no una foto. Existe en los dos estados, es texto —sin recorte, sin aspecto, sin textura— y es lo que hace que se lean como una sola página. El trabajo con las imágenes es teatro encima de eso. Si hay que recortar esta transición, el viaje del título es lo último que se quita.
>
> **Los dos casos son la misma animación**
> Cuando la portada ya es la primera foto (norte, ny), la lámina abierta asciende. Cuando no lo es (america, sol), la portada desciende hacia su posición real en la secuencia —foto 5 de 9 en América, 7 de 7 en Sol— y otra lámina ocupa el primer hueco. En los dos álbumes desajustados la portada y la primera foto tienen dimensiones idénticas, así que no hay morfismo entre aspectos: en ambos casos el movimiento es el mismo desrecorte y solo cambia qué textura hay dentro. Que la portada de Sol sea la última foto del álbum no es un apaño: el álbum abre por la primera imagen y cierra sobre la que el usuario estaba mirando.
>
> **Lo que no se negocia**
> Las láminas que vuelan llevan las fotos del álbum abierto, nunca las de otro álbum. El relevo de textura ocurre en los primeros 80 ms, solo sobre láminas desenfocadas, nunca sobre la abierta.
> Todo el vuelo ocurre en DOM, con GLSurface inactivo. GL entra cuando el DOM ya ha asentado, esperando las dos primeras texturas antes de ocultar los <img>. Nunca se compositan canvas y DOM a la vez.
> Solo transform y opacidad. Ninguna foto se recorta al llegar a su sitio.
> Con prefers-reduced-motion no hay transición: fundido y nada más.
>
> **Lo que se acepta**
> Solo el primer hueco está en pantalla; los demás quedan bajo el pliegue. Por eso una imagen asciende y todo lo demás desciende: no es una concesión, es la única versión que se puede ver.
> La vuelta solo se desmonta si el usuario no ha hecho scroll. En cualquier otro caso es un fundido rápido, con el título como continuidad en los dos sentidos. La asimetría es deliberada.

### Decisiones de Javi que el texto ya implica

- **Permiso para tocar `src/motion/AlbumsCarousel.tsx`**, cerrado segun `CLAUDE.md` (pedido el 2026-11-01). El texto describe que hacen las laminas del carrusel al abrir, asi que lo da por hecho. Se anota como permiso concedido para esta spec, no para otras.
- **Cambio del ciclo de vida de `GLSurface` en la pagina de album:** inactivo durante el vuelo y espera a 2 texturas en vez de 1 (hoy `readyNodeCount={1}`, `src/motion/AlbumPhotos.tsx:246`).
- **La portada no cambia en `src/data/photos.ts`** (pregunta del 2026-11-12, respondida: no).

### Respuestas de Javi a las preguntas abiertas (2026-11-14)

Literal, en la conversacion de la sesion. Precisan la intencion y, donde chocan con ella, ganan:

1. **Panel y relevo.** Las laminas plegadas no estan borrosas: siguen con su panel de grano puesto. "El objetivo es reutilizar los componentes para montar la nueva página desde la anterior." La lamina que ocupa el primer hueco es una de las ya plegadas: se desplaza y se despliega, se ve negra y luego se convierte en la imagen que toca. **Solo cambia de textura esa una**, porque es la unica afectada. Las demas conservan su portada bajo el panel.
2. **Arquitectura:** capa persistente en el layout raiz. La URL cambia al clicar y el vuelo continua por encima.
3. **america y sol:** ocupa el primer hueco la rendija de la izquierda de la abierta, porque las de la derecha bajan. Las demas de la izquierda se van por arriba.
4. **norte y ny:** vale que no haya desrecorte, solo escala y traslacion de la lamina abierta.
5. **Titulo:** el titulo y la descripcion ("lugar — año") viajan, pero no como un bloque unido: cada uno por su cuenta. El relevo al texto de la pagina va al final del viaje.
6. **Vuelta:** vuelve a `/albums` y el carrusel conserva el album que se abrio.
7. **Duracion:** unos 900 ms; el plan propone el escalonado.
8. **Scroll durante el vuelo:** bloqueado.

De la 1 se sigue que la regla "Las láminas que vuelan llevan las fotos del álbum abierto, nunca las de otro álbum" queda asi: las laminas que bajan o suben a la izquierda llevan las portadas de otros albumes, pero bajo el panel al 90 % (`src/motion/AlbumsCarousel.tsx:415-431`). Las unicas que se ven sin panel son del album abierto: la que sube y, en america y sol, la portada que baja.

## Problema

Hoy, abrir un album desde el carrusel es un cambio de ruta sin transicion:
- `onPointerUp` llama a `router.push` con el `href` de la lamina abierta (`src/motion/AlbumsCarousel.tsx:917-918`). El `<Link>` solo existe en la lamina activa (`src/motion/AlbumsCarousel.tsx:439-449`), y su `onClick` solo cancela la navegacion nativa (`src/motion/AlbumsCarousel.tsx:299-300`).
- La pagina de album no tiene hero: abre en el bloque de titulo (`src/app/album/[slug]/page.tsx:44-60`). La fila de la foto 1 empieza a `opacity: 0` y salta a 1 cuando sube su textura o a los 1500 ms (`src/motion/AlbumPhotos.tsx:47`, `:81`, `:228`, `:246-247`).
- El design spec ya lo reconoce como pendiente: "This is a plain client-side route change today" (`docs/design-spec-v2.md`, §2, punto "Navigation"), e inventario de motion #4, "not built yet" (§3).
- **B13** (`docs/ESTADO.md`, "Defectos abiertos"): en la llegada al album hay a veces fotogramas en blanco con la fila a opacity 1, entre que `GLSurface` oculta la `<img>` y el primer pintado del canvas. Las evidencias son `evidencia/2026-11-08_diagnostico.txt:226-231` y el A/B del 2026-11-10 (2 de 60 con `main`). Esta spec lo tapa en el camino carrusel→album, porque GL no entra hasta que el DOM asienta.

Datos de los cuatro albumes (`src/data/photos.ts`):

| Album | Portada | Fotos | Portada = foto 1 | Dimensiones portada / foto 1 |
|---|---|---|---|---|
| america | `/photos/america/05.jpg` (`:102`) | 9 | No, es la 5 | 2500x1875 / 2500x1875 (`:199-201`, `:155-157`) |
| norte | `/photos/norte/01.jpg` (`:115`) | SIN VERIFICAR | Si | — |
| sol | `/photos/sol/07.jpg` (`:128`) | 7 | No, es la 7 (ultima) | 1875x2500 / 1875x2500 (`:489-491`, `:423-425`) |
| ny | `/photos/ny/01.jpg` (`:143`) | SIN VERIFICAR | Si | — |

Geometria de partida en el carrusel:
- Laminas de 500 px de alto (`src/motion/AlbumsCarousel.tsx:12`) y separacion de 32 px (`:13`).
- La lamina abierta en reposo muestra la portada entera, a su ancho natural a 500 px de alto (`naturalWidthFor`, `:154-155`). Las plegadas son una rendija recortada (`objectFit: "cover"`, `:407`) bajo un panel negro con grano (`:415-431`).
- Titulo: un `<p>` serif de 30 px (`:981-986`). En la pagina, el titulo es un `<h1>` de `clamp(48px, 10vw, 110px)` con `font-medium` (`src/app/album/[slug]/page.tsx:52-57`).

## Objetivo

Clicar la lamina abierta del carrusel monta el album delante del usuario, con las mismas laminas del carrusel. Al final de un viaje de unos 900 ms con el scroll bloqueado, todo esto es cierto:
- El titulo y la descripcion han viajado, cada uno por su cuenta, a su sitio en el bloque de titulo, y alli dan el relevo al texto de la pagina.
- Una sola lamina ha subido al primer hueco y es la foto 1 entera. En norte y ny es la abierta. En america y sol es la rendija de su izquierda: cambia de textura bajo el panel, se desplaza y se despliega, y el panel se retira al desplegarse.
- Las laminas de la derecha, la abierta incluida en america y sol, han salido por abajo en cascada de izquierda a derecha. Las de la izquierda han salido por arriba.

Todo el vuelo es DOM, solo con transform y opacidad. Despues entra `GLSurface`, sin un solo fotograma en blanco ni en doble composicion. La vuelta lleva a `/albums` con el mismo album abierto: si no hubo scroll, desmonta al reves; si lo hubo, es un fundido.

## Fuera de alcance

- La geometria y la fisica del carrusel en reposo y en movimiento (specs 011 y 012). Se toca solo lo que pasa despues del clic.
- Las demas llegadas al album: NEXT ALBUM, carga directa y atras desde otra ruta. Siguen con el comportamiento de la spec 013.
- B13 fuera del camino carrusel→album.
- Movil y tablet: el diseno tactil del carrusel es la futura `carrusel-tactil` (paso 7 de `docs/ESTADO.md`). Aqui solo se exige que en modo dispositivo no rompa nada (CA15).
- Digitos rodantes y flechas prev/next (F3, tareas 10 y 11 de `docs/ROADMAP.md`).
- Cambiar portadas u orden en `src/data/photos.ts`.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [x] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`, `src/app/album/[slug]/page.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [x] Renderizador GL (`src/motion/GLSurface.tsx`): su uso desde `AlbumPhotos` seguro, y quiza una señal nueva, que decide el plan
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion
- Ademas: `package.json` (instala GSAP, decidido en `CLAUDE.md`, "Stack"), `src/app/layout.tsx` (la capa persistente, respuesta 2), `src/app/albums/page.tsx` y `scripts/diagnostico.mjs` (una seccion nueva, `transicion`). Que parte del carrusel pasa a vivir en el layout, si la capa de vuelo o el carrusel entero como el landing, lo decide el plan.

## Choca con el spec

1. **Design spec §3 e inventario de motion #4** dicen "center slide expands" y "carousel center expands into the album page". La intencion lo cambia en america y sol: alli la lamina central **desciende** y otra lamina ocupa el primer hueco. Gana la intencion. El design spec se actualiza al cerrar la spec, si Javi lo aprueba.
2. **"No cropping (carousel slivers excepted)"** (`docs/design-spec-v2.md`, "Hard constraints"). Durante el vuelo, la lamina que asciende sigue recortada hasta que se "desrecorta". Se lee dentro de la excepcion de las rendijas del carrusel: el recorte existe solo mientras la lamina viene del carrusel, y al llegar no hay ninguno (CA4). Javi lo confirma en la respuesta 1: una rendija plegada se desplaza y se despliega.
3. **El titulo cambia de 30 px y peso 400 a hasta 110 px y peso 500** (ver "Problema"). Con solo transform, el texto se escala (unas 3,7 veces a 1440 px) y el peso no puede interpolarse. Javi decidio que el relevo del `<p>` del carrusel al `<h1>` de la pagina va al final del viaje (respuesta 5). No rompe ninguna regla dura.

Nada mas: color, escala de grises, parallax de cursor y `prefers-reduced-motion` quedan respetados por la propia intencion.

## Criterios de aceptacion

Los criterios con "seccion `transicion`" son invariantes nuevas de `scripts/diagnostico.mjs`, que esta spec añade (el plan dira como). Se ejecutan sobre los cuatro albumes, a 1440x900, partiendo de `/albums` con el album en cuestion abierto y en reposo. Las cifras en ms son del reloj de la pagina, desde el `pointerup` del clic.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `npx tsc --noEmit && npm run lint && npm run build` | Sale con codigo 0 |
| CA2 | `node scripts/diagnostico.mjs --skip-build` | Ningun fallo nuevo frente a la linea base de la spec (se toma antes de T1). Los fallos conocidos de B11 y B12 no cuentan como nuevos |
| CA3 | Seccion `transicion` · titulo y descripcion | Al terminar, el rect del titulo que vuela coincide con el `<h1>` de la pagina, y el de la descripcion con la linea "lugar — año", a ±1 px en x, y, ancho y alto. Sus trayectorias no son la misma: en algun fotograma intermedio, la diferencia entre sus desplazamientos desde el origen es > 1 px (no viajan como bloque). Hasta el ultimo fotograma del viaje, solo es visible el texto que vuela, y el de la pagina tiene opacity 0. Despues, al reves, sin ningun fotograma con los dos visibles |
| CA3b | Seccion `transicion` · etiqueta "ALBUM NN — N PHOTOS" | Su `transform` no cambia en todo el viaje (no viaja). Su `opacity` empieza en 0 y llega a 1 en fundido, con al menos 3 fotogramas con valores intermedios |
| CA4 | Seccion `transicion` · lamina del primer hueco | Al terminar, su rect coincide con el de la foto 1 a ±1 px, y la imagen interior no esta recortada: proporcion visible frente a natural, desviacion < 1 % (mismo criterio que "fotos enteras", `scripts/diagnostico.mjs:436`). Su panel de grano llega a opacity 0 |
| CA5 | Seccion `transicion` · que sube, que baja y que se va por arriba | norte y ny: sube la lamina abierta. america y sol: sube la rendija inmediatamente a la izquierda de la abierta, y la abierta baja. En los cuatro, toda lamina a la derecha de la abierta sale por abajo (su rect final tiene `top` >= alto del viewport), y toda lamina a la izquierda que no sube sale por arriba (`bottom` <= 0) |
| CA5b | Seccion `transicion` · america con clic en plena estela | El clic llega con la rendija de la izquierda medio abierta (apertura entre 0,05 y 0,95). CA4, CA5 y CA6 se cumplen igual, y el primer fotograma del vuelo parte de su rect de ese momento a ±1 px |
| CA6 | Seccion `transicion` · texturas | Solo cambia de `src` una lamina, la que sube en america y sol, y lo hace antes de 80 ms, con su panel a opacity >= 0,9 en ese momento. En norte y ny no cambia ninguna. La lamina abierta no cambia nunca de `src`. Toda lamina con panel a opacity < 0,9 lleva una foto del album abierto |
| CA7 | Seccion `transicion` · solo transform y opacidad | Un `MutationObserver` sobre `style` durante el vuelo solo registra cambios de `transform`, `opacity` y `transform-origin`. Ningun `width`, `height`, `top`, `left` ni `clip-path` animado |
| CA8 | Seccion `transicion` · cascadas sin fundido | Lo que baja empieza a moverse en orden de x creciente (el inicio de cada elemento es >= el del anterior a su izquierda). Lo que baja y lo que se va por arriba tiene opacity 1 hasta que su rect sale entero del viewport |
| CA8b | Seccion `transicion` · duracion y scroll bloqueado | Desde el clic hasta que todo asienta: entre 800 y 1100 ms (el valor exacto lo fija el plan). Una rueda de 2000 px enviada a los 200 ms no mueve `scrollY` antes de que el vuelo termine, y al terminar `scrollY` es 0 |
| CA9 | Seccion `transicion` · GL fuera del vuelo | Mientras dura el vuelo, el canvas de `GLSurface` no pinta (`window.__glDiag`, cero fotogramas pintados en la ventana) y las `<img>` del album son visibles. Las `<img>` se ocultan solo cuando hay 2 texturas subidas |
| CA10 | Seccion `transicion` · sin blanco ni doble composicion | Muestreo por fotograma del pixel central del primer hueco, desde el clic hasta 1000 ms despues de la ocultacion de las `<img>`: 0 fotogramas con el fondo `#FAFAFA` en ese pixel una vez que la lamina ha llegado. Ningun fotograma con la `<img>` 1 visible y el canvas pintando la foto 1 a la vez. 10 repeticiones por album, 0 fallos (cubre B13 en este camino) |
| CA11 | Seccion `transicion` con `reducedMotion: "reduce"` | Ningun cambio de `transform` durante la llegada: solo `opacity`, y la duracion total del fundido la fija el plan. CA4, CA9 y CA10 se cumplen igual |
| CA12 | Seccion `transicion` · vuelta sin scroll | Desde el album recien abierto con `scrollY` 0, `page.goBack()`: la URL es `/albums`, el album activo es el que se abrio (contador `NN / 04` y titulo), y las laminas vuelven a su rect de reposo a ±1 px, que es el mismo que mide CA14 con ese album abierto |
| CA13 | Seccion `transicion` · vuelta con scroll | Con `scrollY` > 0, `page.goBack()`: solo cambia `opacity`, con una duracion menor o igual que la que fije el plan, y el album activo es el que se abrio. El titulo es continuo (CA3 a la inversa) |
| CA14 | `node scripts/medir-carrusel.mjs --sin-build --geometria <salida.json> --comparar <linea-base T0>` | Geometria en reposo identica a la linea base de T0, 0 px de diferencia (enmienda 1) |
| CA15 | `node scripts/diagnostico.mjs --skip-build --dispositivo iphone` y `--dispositivo ipad` | Ningun fallo nuevo frente a la linea base en modo dispositivo (regla de la spec 017: lo movil no cambia el escritorio, ni al reves) |
| CA16 | Seccion `llegada al album` (existente) | Sus cuatro llegadas pasan: NEXT ALBUM y la carga directa no cambian |
| CA17 | Javi, en `npm run dev` y despues en la preview de Vercel, abre los cuatro albumes desde el carrusel | Javi da el visto bueno. Es el unico criterio a ojo, y no sustituye a ninguno de los anteriores |

## Enmiendas

1. **2026-11-14, T0. La referencia de CA14 no existe.** `evidencia/2026-10-26_012-geometria-ref.json` nunca se copio desde el scratchpad de la spec 012 (`specs/012-carrusel-abrir-al-frenar/tasks.md:136`), y `medir-carrusel.mjs --comparar` falla con `ENOENT`. Desde `f950d14`, el codigo que la produjo, `src/motion/AlbumsCarousel.tsx` y `src/app/albums/` no han cambiado: solo `src/app/globals.css`, en `8487496` y `b3e8d2a`, por el atlas (`git log f950d14..HEAD`). Por eso la referencia de CA14 pasa a ser la geometria medida en T0 sobre `a53e0ca`: `2026-11-14_019-geometria-base.json`, del scratchpad de la sesion, pendiente de copiar a `evidencia/`. Lo que se exige es que esta spec no mueva un pixel del carrusel en reposo.

## Preguntas abiertas

Ninguna. Todas respondidas por Javi el 2026-11-14 (ver "Respuestas de Javi", arriba, y estas dos de la segunda ronda):

- **"ALBUM 01 — N PHOTOS"** (`src/app/album/[slug]/page.tsx:47-49`), que no existe en el carrusel, **aparece con un fundido** (CA3b).
- **La rendija que sube en america y sol** es la que esta inmediatamente a la izquierda de la abierta en el momento del clic. Si el clic llega durante la estela de la spec 011 y esa lamina esta medio abierta, **sube igual, partiendo de su apertura del momento**.

### Preguntas de la primera redaccion (respondidas)

1. **"Laminas desenfocadas".** Desde la spec 011 el carrusel no desenfoca: cubre cada lamina plegada con un panel negro de grano al 90 % (`src/motion/AlbumsCarousel.tsx:415-431`, design spec §2, "Depth cues"). ¿"Desenfocadas" significa "plegadas, bajo el panel"? ¿El panel sigue sobre ellas mientras bajan o se retira? Si se retira, el relevo de textura se veria.
2. **Dos rutas o una.** `/albums` y `/album/[slug]` son rutas distintas (`src/app/albums/page.tsx`, `src/app/album/[slug]/page.tsx`), y hoy el carrusel se desmonta al navegar. Para que el vuelo sobreviva al cambio de ruta hay dos opciones. La primera es una capa persistente en el layout raiz, como el landing (`src/app/layout.tsx:42`): la URL cambia al clicar y el vuelo continua por encima. La segunda es que la URL no cambie hasta que el album ha asentado. Recomendacion del agente: la primera, porque el boton atras y una recarga a mitad funcionan como hoy. Es decision de arquitectura y la toma Javi.
3. **america y sol: que lamina ocupa el primer hueco y de donde sale.** ¿La rendija contigua a la abierta, por la izquierda o por la derecha? ¿Una lamina que no estaba en pantalla? Y en norte y ny, ¿bajan todas las demas, incluida la que en america y sol subiria?
4. **"Desrecorte" en norte y ny.** En reposo, la lamina abierta ya muestra la portada entera, sin recorte (`naturalWidthFor`, `src/motion/AlbumsCarousel.tsx:154-155`). Asi que en norte y ny no hay recorte que deshacer: solo escala y traslacion de 500 px de alto al rect de la foto 1. El desrecorte de verdad solo pasa en america y sol, con una rendija de 110 px. ¿Es eso lo que se busca, o quieres que en norte y ny la lamina se recorte un poco al empezar para que el movimiento sea identico en los cuatro?
5. **El titulo.** Pasa de un `<p>` de 30 px y peso 400 (`src/motion/AlbumsCarousel.tsx:981-986`) a un `<h1>` de `clamp(48px, 10vw, 110px)` y `font-medium` (`src/app/album/[slug]/page.tsx:52-57`). Con solo transform se escala y en algun momento cambia de peso. ¿El relevo va al final del viaje (escalado hasta casi el final y cambio en un fotograma) o a mitad, con un cruce corto? ¿La linea "lugar — año" viaja con el, y "ALBUM 01 — N PHOTOS" aparece o tambien llega desde algun sitio?
6. **La vuelta.** La pagina de album no tiene ningun enlace al carrusel: "← Suquia" va a `/` (`src/app/album/[slug]/page.tsx:35-40`). ¿La vuelta es solo el boton atras del navegador, o hay que añadir un enlace? Ademas, hoy el carrusel siempre arranca en el album 0 (`src/motion/AlbumsCarousel.tsx:563`), asi que al volver no estaria abierto el album del que vienes. CA12 lo exige; ¿de acuerdo?
7. **Duraciones y curvas.** La propuesta del 2026-11-12 era de unos 900 ms. ¿Mismo valor? ¿Y el escalonado de la cascada? Si no hay preferencia, el plan propone cifras y Javi las ajusta a ojo en CA17.
8. **Scroll durante el vuelo.** ¿Se bloquea la rueda (Lenis parado) hasta que el album asienta, o se permite y la transicion se corta en un fundido?

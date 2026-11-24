# Plan 023 · Pagina de album en movil

- **Spec:** `spec.md` (aprobada el 2026-11-24)

## Enfoque

**El mismo patron que el landing movil (spec 021), en dos capas:**
- **Comportamiento:** se decide una vez con `useEsMovil` (`src/lib/movil.ts:37`).
- **Maqueta:** reglas CSS que solo existen dentro de `@variant movil` / `@variant movil-h` (`src/app/globals.css:19-28`). Fuera de esas variantes no cambia ningun valor computado, asi que el escritorio queda identico por construccion. CA2 lo demuestra con capturas.

**1. Sin `GLSurface` ni Lenis en movil** (`src/motion/AlbumPhotos.tsx`):
- **`GLSurface`:** se monta solo con `esMovil === false`. Hoy es `!flying` (`AlbumPhotos.tsx:299`); pasa a ser `!flying && esMovil === false`. Es lo mismo que hace el landing (`src/motion/LandingComposition.tsx:1064`).
- **Lenis:** `useLenis(ALBUM_LENIS_OPTIONS, esMovil === false)`, como el landing (`LandingComposition.tsx:375`). Con `null` (servidor e hidratacion) no se crea ninguno de los dos; en escritorio se montan en el render que sigue a la hidratacion.
- **Las `<img>`** quedan siempre visibles en movil: `hideImgs` depende de `glActive`, que sin `GLSurface` nunca pasa a `true`.

**2. Llegada de la foto 1 sin GL.** Hoy la fila de la foto 1 sale a `opacity` 0 y se revela al subir su textura, al fallar el contexto o a los 1500 ms (`AlbumPhotos.tsx:99-123`). En movil, sin GL, se revela cuando la `<img>` de la foto 1 esta decodificada: `onLoad` → `img.decode()` → `reveal()`. Si ya estaba completa al hidratar (cache), en el efecto. Se queda el tope de 1500 ms. En la llegada por el carrusel no cambia nada: la revela la capa del vuelo (`AlbumPhotos.tsx:104-110`).

**3. Maqueta en CSS, con clases propias** (`.album-cabecera`, `.album-fila`, `.album-pie`, `.album-siguiente`…) en `globals.css`, como `.landing-photo` (`globals.css:85-101`):
- **Escala en vertical (respuesta 1):** una unidad `--u: calc(100vw / 390)` dentro de `@variant movil`. Cada medida del lienzo se escribe como `calc(N * var(--u))`: 16 px a 390 son 31,5 px a 768. La tipografia va en px fija.
- **Horizontal (`movil-h`):** en px, como el landing horizontal (`globals.css:96-100`). Como `movil-h` tambien cumple `movil`, va despues y pisa lo que haga falta.
- **Que gane `movil:` a `md:`:** ya se comprobo en la spec 022 (`specs/022-notas-album-movil/tasks.md`, T1). Para los valores que hoy van inline (el `fontSize` del `<h1>`, `page.tsx:62`), se usa `!important` dentro de la variante, como `.landing-photo`.

**4. Bloque de titulo** (`src/app/album/[slug]/page.tsx:53-72`):
- margenes de 16;
- etiqueta a 12 px en `#888`;
- `<h1>` a 64/68 px, peso 500;
- lugar a 12 px en mayusculas, tracking 0.18em;
- distancias de 12 y 10 px;
- la foto 1 a 50 de la base del bloque.

El `← Albums` sigue donde esta (`page.tsx:36-41`). Su `top` y su margen se ajustan a 52 y 16.

**5. Filas en vertical** (`AlbumPhotos.tsx:260-285`):
- **Fila:** sin `py-16`, con margen lateral de 16, 14 px entre foto y pie y 54 px desde la base del pie hasta la foto siguiente.
- **Fila centrada:** la `<img>` a todo el ancho util.
- **Filas desplazadas:** `max-width: 300u` y `max-height: 360u`, que da las verticales a ~75 %. Se mantiene el `max-h-[85vh]` (regla dura).
- **`sizes`:** se añade delante una condicion movil (`ALBUM_PHOTO_SIZES`, `src/motion/albumTransition/flight.ts:46`) para que el telefono pida la anchura de verdad: ~92vw en la fila centrada, frente al 90vw de hoy. Es una condicion `@media` que el escritorio no cumple, asi que alli pide lo mismo. El vuelo precarga la foto 1 con la misma constante (`AlbumPhotos.tsx:176-178`).
- **Notas de la spec 022:** siguen a 48 px del pie. Hoy son `gap-4` + `mt-8` (`AlbumPhotos.tsx:262,267`); el margen pasa a `calc(48px - <hueco de la fila>)` para que la suma siga dando 48.

**6. Pie en tres lineas** (`AlbumPhotos.tsx:201-220`):
- **El marcado nuevo** se escribe una sola vez. Dentro del bloque de la fila 1 (numero y titulo), el `·` y el lugar llevan una clase que en movil los saca a la linea 2: el `·` con `display: none`, el lugar como bloque con sangria de 26 px. Mismo DOM en los dos casos; en escritorio, los mismos valores computados.
- **Si no se puede sin tocar el escritorio:** dos variantes del pie, cada una oculta en el otro modo. En ese caso CA2 tiene que seguir a 0 px.
- **La camara:** `focal · apertura · ISO`, sin mayusculas. Hoy el texto lleva ` — ` y esta en el DOM (`AlbumPhotos.tsx:218`). Se ponen las dos formas en dos `<span>`, cada uno oculto en el otro modo.
- **Alineacion:** el pie se alinea con el borde izquierdo de su foto. En las filas desplazadas a la derecha, la foto y el pie van dentro de un contenedor del ancho de la foto (`width: fit-content`) pegado a la derecha. El pie empieza en su borde izquierdo.

**7. Horizontal** (`movil-h`):
- La fila pasa a `flex-row`: la foto (alto ≤ 300 px) y, a 24 px, una columna de 200 px con el pie pegado abajo (base con base, respuesta 2).
- Debajo del pie, en esa misma columna, va la nota o la cita, a 48 px (respuestas 3 y 6). La columna puede ser mas alta que la foto: la fila crece hacia abajo.
- Colocacion del grupo foto + columna: a la izquierda, centrado o a la derecha segun la fila, entre los margenes de 47 px.

**8. Final** (`page.tsx:76-99`, `src/components/Footer.tsx`, que solo usa la pagina de album):
- **`NEXT ALBUM`:** en movil, el `<Link>` pasa a columna. Lleva la etiqueta, la portada a `200u` de ancho y alto automatico (sin recorte), el titulo a 40/44 y el lugar (`nextAlbum.location — year`, dato que hoy no se pinta: un `<p>` nuevo, oculto fuera de movil).
- **Fundido de la portada:** un componente cliente pequeño en `src/motion/` (`FundidoAlEntrar`). Usa un `IntersectionObserver` con `rootMargin: "0px 0px -20% 0px"`: la portada pasa de `opacity` 0 a 1 en 300 ms al cruzar el 20 % inferior, y se queda. Solo se activa con `esMovil === true`; en escritorio no hace nada. Reduced motion: tambien fundido (`n_af`). Sin JS: visible (`<noscript>`, como la foto 1).
- **Pie de pagina:** en movil, columna centrada de tres lineas (los `—` ocultos; `Instagram · Email` en una linea, con `·` solo en movil), `border-top` de 1 px en `#E4E4E4` y 20 px de aire.

**9. Medicion: `scripts/lib/albumMovil.mjs`, nuevo.** Se llama desde `scripts/diagnostico.mjs` en modo dispositivo, como `notas-movil` (`scripts/diagnostico.mjs:809-815`). Por perfil y por album, mide:
- **GL y Lenis:** `window.__glDiag`, clase `lenis` y `<canvas>` (CA3, CA4).
- **Maqueta:** cajas y estilos computados del bloque de titulo, de cada fila y su pie, de `NEXT ALBUM` y del pie de pagina (CA5-CA8, CA10).
- **Llegada:** opacidad de la fila 1 por frame, en carga directa y por NEXT ALBUM tras un deslizamiento rapido, con `scrollY` a 1500 ms (CA9).
- **Fundido:** la opacidad de la portada al cruzar el 20 % inferior, con y sin reduced motion (CA11).

Las secciones de fallos GL (`scripts/diagnostico.mjs:1979-1990`) amplian su `sinGL(route)` al album cuando el perfil es movil, igual que se hizo con `/` (CA13).

**Alternativa descartada:** montar `GLSurface` con curvatura 0 en movil (plano, como con reduced motion). Javi eligio quitarlo («quita el gl mejor»), y asi desaparece el camino del canvas fijo que recoloca las fotos un frame tarde, la hipotesis de M11.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/motion/AlbumPhotos.tsx` | modificar | GL y Lenis solo con `esMovil === false`; revelado de la foto 1 por `decode()` en movil; clases de fila y de pie; pie en tres lineas |
| `src/app/album/[slug]/page.tsx` | modificar | Clases del bloque de titulo y de `NEXT ALBUM`; lugar del album siguiente; portada envuelta en el fundido |
| `src/components/Footer.tsx` | modificar | Tres lineas centradas y filete en movil |
| `src/motion/FundidoAlEntrar.tsx` | crear | Fundido de 300 ms al cruzar el 20 % inferior, solo en movil |
| `src/motion/albumTransition/flight.ts` | modificar | Condicion movil delante de `ALBUM_PHOTO_SIZES` |
| `src/app/globals.css` | modificar | Reglas `.album-*` dentro de `@variant movil` y `@variant movil-h`, unidad `--u` |
| `scripts/lib/albumMovil.mjs` | crear | Seccion `album-movil` (CA3-CA11) |
| `scripts/diagnostico.mjs` | modificar | Llamada a `album-movil` en modo dispositivo; `sinGL` tambien para el album en perfiles moviles |
| `docs/design-spec-v2.md`, `CLAUDE.md` | modificar (cierre) | §3 y Motion inventory #1: el album movil sin GL ni Lenis, con su maqueta |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Montar GL y Lenis un render despues en escritorio cambia la llegada (spec 013) o el vuelo (spec 019) | Baja: el landing lo hace igual desde la spec 021 y en una navegacion de cliente no hay hidratacion | Foto 1 o vuelo distintos en escritorio | Secciones `llegada al album` y `transicion` en T1 contra T0; capturas a 0 px |
| Un cambio de marcado del pie mueve el escritorio aunque los estilos sean iguales (espacios en blanco, `inline` frente a `block`) | Media | Rompe la regla de escritorio identico | CA2 en cada tarea; si no queda a 0 px, la variante de dos pies |
| `movil-h` y `movil` se pisan mal (el telefono en horizontal cumple las dos) | Media | Horizontal con medidas del vertical | `movil-h` siempre despues; CA8 en `iphone --horizontal` |
| La foto 1 se revela antes de pintarse (`decode()` resuelve y el primer frame aun no la tiene) | Baja | Un frame en blanco | CA9 cuenta frames con la fila a 1 y la `<img>` sin pintar |
| El scroll nativo arrastra la inercia del album anterior a NEXT ALBUM (B10) | Media en iOS, sin medir | El album nuevo no empieza arriba | CA9 (`scrollY` 0 a 1500 ms); si falla, `scrollTo(0, 0)` al montar la pagina, solo en movil |
| La emulacion no reproduce el salto con scroll rapido (como M9 y M11) | Alta | Verde en el diagnostico y salto en el iPhone | CA14 en el dispositivo de Javi, con scroll rapido y lento |
| La interpretacion del horizontal: el frame solo dibuja una fila completa | Media | Grupo foto + pie colocado distinto de lo que Javi imaginaba | Capturas de las tres colocaciones en T4, para Javi |

## Vuelta atras

- **Rama:** `feat/023-album-movil`.
- **Como se revierte:** `git revert` de los commits de T1 a T5. La seccion `album-movil` puede quedarse, porque solo mide.
- **Que invariante avisaria de que esto ha roto algo:**
  - **en escritorio:** capturas a 0 px (CA2), `llegada al album`, `transicion` y las secciones GL;
  - **en movil:** «fotos enteras», `notas-movil`, `navegacion` y `album-movil`.

## Verificacion

- **T0, linea base:**
  - escritorio con `--capturas-guardar`;
  - los cinco perfiles moviles y `ipad --horizontal`, con sus fallos de partida;
  - `album-movil` midiendo el estado de hoy, que tiene que fallar donde la maqueta cambia.
- **Cada tarea:** sus CA en los perfiles que toca, y escritorio con `--capturas-comparar` a 0 px.
- **Las pasadas de tarea** van con `--skip-build`. El diagnostico arranca su propio `next dev` en :3100, que no choca con el de Javi en :3000. **El cierre** va con build y necesita que Javi pare su `npm run dev`, porque `next build` lo rompe.
- **Salidas:** en el scratchpad, como `2026-11-24_023-<tarea>-<perfil>.txt`; Javi las copia a `evidencia/`. CA14 lo hace Javi en el iPhone y el iPad mini, sobre la preview de Vercel.

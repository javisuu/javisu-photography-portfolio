# Tareas 020 · Navegacion movil

- **Plan:** `plan.md` (aprobado el 2026-11-16)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. Antes de cualquier `next build`, Javi para su `npm run dev`.

- [x] **T0** · Rama, linea base y `pointer: coarse`
  - Hecho (2026-11-16, sobre `111bdd4`, rama `feat/020-navegacion-movil`). Salidas en el scratchpad de la sesion, pendientes de copiar a `evidencia/`: `2026-11-16_020-puntero.txt`, `2026-11-16_020-linea-base*.txt`, capturas en `020-capturas-base/`.
  - **`pointer: coarse`:** la condicion `movil` casa en chromium y webkit con iphone, iphone-max, ipad-mini e ipad en vertical y con iphone e iphone-max en horizontal; no casa con ipad-mini ni ipad en horizontal, ni con escritorio a 1440 × 900, ni con una ventana de escritorio de 800 × 1000. Riesgo 1 descartado: no hace falta forzar la media feature.
  - **Escritorio (con build):** 534 de 542. Los 8 fallos son conocidos: 7 duraciones de la seccion `transicion` sobre `next dev` (solo valen en produccion, spec 019) y B10 en `/album/sol`.
  - **Dispositivos:** iphone 77 de 77; ipad 75 de 77 (los dos de «deslizar cambia de album», ya en la linea base de la 019); ipad-mini 76 de 77 (E2, una decodificacion lenta); iphone horizontal 74 y 75 de 77 en dos pasadas («fotos enteras» en `/`, 22 de 30 fuera, y E1 en `/album/america`; E2 solo en la primera).
  - **iphone-max: NO MEDIBLE con el harness.** Tres pasadas (`-linea-base-iphone-max.txt`, `-2`, `-3`, la ultima con `:3100` comprobado libre) agotan los 30 s de `load` en las 6 rutas: los chunks de `next dev` y 4 imagenes del primer `goto` quedan pendientes para siempre. No es el sitio: el mismo perfil carga `/` en 431-634 ms con `next dev` ya caliente y en 153 ms con `next start` (`carga020.mjs`), y el 2026-11-03 paso con 0 errores (`evidencia/2026-11-03_017-linea-base-chromium-iphone-max.txt:301`). El mismo sintoma ya salio en la spec 017 en WebKit (`scripts/diagnostico.mjs:245-247`). Va a la spec del harness; en T6, `navegacion` en iphone-max se mide aparte si sigue asi.
  - **Capturas:** el modulo cubre 3 rutas (landing, `/album/america`, `/atlas`), no 6.
  - Fichero(s): ninguno del sitio
  - Que: `feat/020-navegacion-movil` (la crea Javi: `! git switch -c feat/020-navegacion-movil`). Diagnostico de escritorio con build, los cinco perfiles de dispositivo, capturas a 1440 × 900 de las seis rutas. Medir en cada perfil `matchMedia("(pointer: coarse)").matches` y la condicion `movil` completa.
  - Comprobacion: las salidas guardadas; si algun perfil no casa con la condicion, se decide aqui como emularlo (riesgo 1 del plan) antes de seguir.
- [x] **T1** · Variante `movil:`
  - Hecho (2026-11-16). Clase de prueba `movil:[--prueba-movil:1] movil-h:[--prueba-movil-h:1]` en `<body>`, build, `next start`: `movil` en los 4 perfiles en vertical y en iphone/iphone-max en horizontal, `movil-h` solo en esos dos horizontales, nada en ipad-mini/ipad horizontal ni en escritorio 1440 × 900 u 800 × 1000; chromium y webkit iguales (`2026-11-16_020-t1-variante.txt`). Clase quitada. Escritorio con build: 538 de 546, los 8 fallos son duraciones de `transicion` en `next dev` (los mismos que T0; B10 paso esta vez); capturas 0 px en las 3 rutas y `currentSrc` igual (`2026-11-16_020-t1-escritorio.txt`).
  - Nota: Tailwind escanea tambien los `.md` de `specs/` y ya genera `movil:block`, `movil:flex`, `movil:hidden`, `movil:pb-[78px]` sin que ningun elemento los use; solo existen dentro de la media query.
  - Fichero(s): `src/app/globals.css`
  - Que: `@custom-variant movil` y `movil-h`.
  - Comprobacion: una clase de prueba en un elemento se aplica en `iphone`, `ipad` (vertical) e `iphone --horizontal`, y no en escritorio ni en `ipad --horizontal`; se quita la clase de prueba. Capturas de escritorio a 0 px.
- [ ] **T2** · Barra general
  - Fichero(s): `src/components/movil/BarraMovil.tsx`, `src/app/layout.tsx`
  - Que: barra de 78 px (36 + 21 en `movil-h`), `ABOUT ME`/`ALBUMS`/`ATLAS`, activo por ruta, `z-40`.
  - Comprobacion: seccion `navegacion` (primera version): CA3 sin la parte de «escritorio no visible», CA4, CA11. Escritorio: capturas a 0 px.
- [ ] **T3** · Apartar la navegacion de escritorio en movil
  - Fichero(s): `LandingComposition.tsx` (nav de arriba, `CREDITS`, contador), `about`, `albums`, `atlas` (`← Suquia`), padding inferior en las paginas con scroll, bloques inferiores de `Atlas.tsx` y `AlbumsCarousel.tsx`
  - Comprobacion: CA3 completo, CA9, CA13. Escritorio: capturas a 0 px y CA8.
- [ ] **T4** · Panel y disparador
  - Fichero(s): `src/components/movil/PanelMovil.tsx`, `src/components/movil/panel.ts`, `src/app/layout.tsx`, boton hermano del `<h1>` en `LandingComposition.tsx`
  - Comprobacion: CA5, CA6, CA7, CA8 en movil y en escritorio. «Un solo `<main>` visible».
- [ ] **T5** · Barra del album
  - Fichero(s): `src/components/AlbumPhotoNav.tsx` (hook `useFotoActual`, `movil:hidden`), `src/components/movil/estadoAlbum.ts`, `BarraMovil.tsx`, `src/app/album/[slug]/page.tsx` (`data-album-cabecera`)
  - Comprobacion: CA10, tambien llegando desde el carrusel con la transicion. Escritorio: capturas a 0 px y la seccion `transicion` sin fallos nuevos (`AlbumPhotoNav` es un destino de la transicion, `src/motion/albumTransition/TransitionTarget.tsx:12`).
- [ ] **T6** · Seccion `navegacion` completa en el diagnostico
  - Fichero(s): `scripts/lib/navegacion.mjs`, `scripts/diagnostico.mjs`
  - Comprobacion: pasa en los cinco perfiles; un fallo forzado (barra a 60 px de alto, o el contador del landing sin subir) la hace fallar.
- [ ] **T7** · Ojo de Javi (CA12)
  - Que: Javi en `npm run dev` desde el movil por la red local o en la preview de Vercel, en el iPhone 13 (vertical y horizontal) y el iPad mini en vertical.
  - Comprobacion: visto bueno anotado aqui con fecha.

## Cierre

- [ ] `node scripts/diagnostico.mjs` sin fallos nuevos frente a T0 (CA1), salida guardada
- [ ] Capturas de escritorio a 0 px (CA2)
- [ ] Seccion `navegacion` en los cinco perfiles (CA3-CA11, CA13)
- [ ] `CLAUDE.md` (build order §2: la navegacion movil; arquitectura: la variante `movil:`) y `docs/design-spec-v2.md` (navegacion en movil) actualizados
- [ ] `docs/ESTADO.md`: spec 020 y lo que pasa a `landing-movil` (el segundo disparador del panel)
- [ ] Estado de `spec.md` → Implementada

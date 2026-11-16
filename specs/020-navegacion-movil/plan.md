# Plan 020 · Navegacion movil

- **Spec:** `spec.md` (aprobada el 2026-11-16)

## Enfoque

**Una variante de Tailwind, `movil:`, como unica puerta.** Se define en `src/app/globals.css` con `@custom-variant movil` y la condicion de la spec (`pointer: coarse` + vertical hasta 1024 px, o horizontal hasta 500 px de alto), y `movil-h:` solo para el telefono en horizontal. Todo lo nuevo nace `hidden movil:flex`/`movil:block`, y todo lo de escritorio que en movil sobra gana `movil:hidden`. Fuera de esa media query no cambia ninguna regla CSS efectiva, que es lo que comprueban CA1 y CA2 (capturas a 0 px). Se descarta decidir por JavaScript (`matchMedia` + render condicional): pintaria la navegacion equivocada en el HTML del servidor y daria un salto al hidratar.

**Una barra para todo el sitio, montada una vez en el layout.** `src/components/movil/BarraMovil.tsx`, en `src/app/layout.tsx` como hermana del landing y de la capa de la transicion, nunca como ancestro de nada (el `<h1>` del blend sigue sin ancestros nuevos). Lee `usePathname()` para el enlace activo. En `/album/[slug]` cambia de contenido al dejar atras el bloque de titulo (un `IntersectionObserver` sobre el bloque, marcado con `data-album-cabecera`): pasa a `← ALBUMS`, flechas y `NN / 09`. El indice y el `goTo` salen de `AlbumPhotoNav`, extrayendo su logica a un hook (`useFotoActual`) sin cambiar su render de escritorio; la barra recibe ese estado por un store minimo (`src/components/movil/estadoAlbum.ts`), porque la barra vive en el layout y el album en la pagina.

**El panel, tambien en el layout.** `src/components/movil/PanelMovil.tsx`, `fixed inset-0 z-[60]` (por encima de la capa de la transicion, `z-50`), con su propio store de abierto/cerrado (`src/components/movil/panel.ts`). Anima solo `opacity` en el contenedor y `opacity` + `translateY` en los enlaces, con transiciones CSS (no hace falta GSAP para 240 ms); `prefers-reduced-motion` quita el `translateY` y el escalonado. Bloquea el scroll de debajo sin tocar Lenis: `data-lenis-prevent` (Lenis ignora los eventos que nacen dentro, `node_modules/lenis/dist/lenis.mjs:609`), `touch-action: none` y `overscroll-behavior: contain` en la capa. Al cerrar no se restaura nada porque nada se movio.

**El disparador, hermano del `<h1>`.** En `LandingComposition.tsx`, justo despues del `<h1>` y fuera de el, un `<button>` transparente `hidden movil:block`, `fixed`, centrado sobre la banda del nombre, 80 px de alto y el ancho del nombre, con `aria-expanded` y `aria-controls`. Sin transform/opacity propios. El `<h1>` y `DecipherWordmark.tsx` no se editan.

**Lo de escritorio que se aparta en movil:**
- Landing: el bloque de `ABOUT ME`/`ALBUMS`/`ATLAS` (`LandingComposition.tsx:958`) gana `movil:hidden`; `CREDITS` (`:976-982`) gana posicion de tercio inferior en movil; el contador (`:984`) sube por encima de la barra.
- `← Suquia` de `/about`, `/albums`, `/atlas` gana `movil:hidden`; el de `/credits` se queda (la intencion lo dibuja arriba).
- `AlbumPhotoNav` de escritorio gana `movil:hidden` (hoy `hidden md:flex`, asi que en el iPad en vertical dejaria de verse).
- Lo pegado al borde inferior sube la altura de la barra en movil: la leyenda y el control del atlas (`src/motion/Atlas.tsx:1578`, `:1605`), el bloque inferior del carrusel (`src/motion/AlbumsCarousel.tsx:1053` y el del titulo), y el pie de las paginas con scroll (`movil:pb-[78px]` en su `<main>`).

Tocar `AlbumsCarousel.tsx` y `Atlas.tsx` es solo añadir clases `movil:` a sus bloques inferiores; nada de su logica.

**Medida:** `scripts/lib/navegacion.mjs`, seccion `navegacion` del diagnostico en modo dispositivo (CA3-CA11, CA13), con toques reales por CDP como la spec 017. En escritorio, las capturas de `scripts/lib/capturas.mjs` antes y despues (CA2).

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/app/globals.css` | modificar | `@custom-variant movil` y `movil-h` |
| `src/components/movil/BarraMovil.tsx` | crear | La barra: enlaces, activo por ruta, modo album |
| `src/components/movil/PanelMovil.tsx` | crear | El panel a pantalla completa |
| `src/components/movil/panel.ts` | crear | Store abierto/cerrado del panel (suscripcion minima, como `albumTransition/store.ts`) |
| `src/components/movil/estadoAlbum.ts` | crear | Store de foto actual, total y `goTo` para la barra del album |
| `src/app/layout.tsx` | modificar | Monta `BarraMovil` y `PanelMovil` |
| `src/motion/LandingComposition.tsx` | modificar | `movil:hidden` en la nav de arriba, `CREDITS` y contador en movil, boton hermano del `<h1>` |
| `src/components/AlbumPhotoNav.tsx` | modificar | Logica a `useFotoActual`, publica en `estadoAlbum`, `movil:hidden` |
| `src/app/album/[slug]/page.tsx` | modificar | `data-album-cabecera` en el bloque de titulo; `movil:pb-[78px]` |
| `src/app/about/page.tsx`, `src/app/albums/page.tsx`, `src/app/atlas/page.tsx` | modificar | `movil:hidden` en `← Suquia`; padding inferior donde haya scroll |
| `src/app/credits/page.tsx` | modificar | Padding inferior en movil |
| `src/motion/Atlas.tsx` | modificar | Solo clases `movil:` en la leyenda y el control inferior |
| `src/motion/AlbumsCarousel.tsx` | modificar | Solo clases `movil:` en sus bloques inferiores |
| `scripts/lib/navegacion.mjs` | crear | Seccion `navegacion` |
| `scripts/diagnostico.mjs` | modificar | Llama a la seccion en modo dispositivo |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| La emulacion de Playwright no informa `pointer: coarse` y el diagnostico no ve nada de movil | Media | Alto | T0 lo mide; si no, se emula con CDP `Emulation.setEmitTouchEventsForMouse` o se fuerza la media feature con `Emulation.setEmulatedMedia` (`pointer`) |
| Una clase `movil:` cambia el escritorio (orden de reglas de Tailwind, especificidad) | Baja | Alto | CA2: capturas a 0 px en las seis rutas, y CA1 |
| El boton de SUQUIA rompe el blend | Baja | Alto | Es hermano, no ancestro, sin transform/opacity; CA8 en movil y en escritorio |
| La barra (`z-40`) queda debajo del landing (`z-30` del `<h1>`, `z-20` del chrome) o encima de la capa de la transicion durante un vuelo | Media | Medio | z-40: por encima del landing y por debajo de la capa (`z-50`), que durante el vuelo tapa todo. CA3 con `elementFromPoint` |
| En la tablet en vertical el iPad pierde el control del borde derecho y la barra del album aun no convence | Media | Bajo | Es la intencion (respuesta 4); CA12 en el iPad mini |
| El IntersectionObserver del bloque de titulo no existe en la llegada por la transicion (el bloque esta oculto bajo la capa) | Media | Bajo | La barra empieza en modo general y solo cambia con el bloque fuera del viewport; CA10 tambien tras llegar desde el carrusel |
| Safari real no se comporta como la emulacion (spec 018, M9) | Media | Medio | CA12 en el iPhone 13 y el iPad mini; `?diag` sigue disponible |

## Vuelta atras

- **Rama:** `feat/020-navegacion-movil`
- **Como se revierte:** `git revert` de los commits de la rama. Todo lo nuevo esta bajo `src/components/movil/` y la variante `movil:`; quitar la variante de `globals.css` apaga todo de golpe (las clases `movil:` dejan de generar CSS).
- **Que invariante avisaria de que esto ha roto algo:** en escritorio, las capturas de CA2 y «ancestros del blend»; en movil, la seccion `navegacion` y «un solo `<main>` visible» (el panel es un `<div>`/`<nav>`, nunca un `<main>`).

## Verificacion

- T0: `node scripts/diagnostico.mjs` (escritorio, con build) y `--skip-build --dispositivo iphone|iphone-max|ipad-mini|ipad` y `iphone --horizontal`, mas capturas a 1440 × 900 → linea base (`evidencia/2026-11-XX_020-linea-base*.txt`).
- Cada tarea: `--skip-build` del modo que toque.
- Cierre: CA1 (diagnostico de escritorio con build), CA2 (capturas), CA3-CA11 y CA13 (seccion `navegacion` en los cinco perfiles), CA12 (Javi). Salidas en `evidencia/2026-11-XX_020-*.txt` (o en el scratchpad para que Javi las copie, mientras la regla deny de `evidencia/` siga).

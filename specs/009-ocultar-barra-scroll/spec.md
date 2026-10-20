# Spec 009 · Ocultar la barra de scroll

- **Estado:** Implementada (2026-10-20). Aprobada el mismo dia con las respuestas de Javi a las preguntas abiertas, recogidas en "Decisiones". CA1 a CA8 verificados en `tasks.md`
- **Fecha:** 2026-10-20
- **Requiere decision de Javi:** Si (motivo: scroll infinito). Tomada: se acepta que el landing se recoloque, pero sin deformar ni estirar ninguna imagen. No se toca el codigo de Lenis ni del landing. Lo que cambia es el contenedor donde corre su scroll infinito: al quitar la barra, el ancho util del viewport crece en el hueco que ocupaba, y la composicion del landing se mide con `w-screen`/`vw` (`src/motion/LandingComposition.tsx:836-841`)

## Problema

El navegador pinta su barra de scroll vertical en las paginas que hacen scroll de documento. Rompe la pagina blanca y limpia del diseno ("Nothing competes with the images", `docs/design-spec-v2.md:7`). Javi confirmo que quiere quitarla el 2026-10-11 (`docs/ESTADO.md`, "Proximos pasos", paso 6).

Lo que hay hoy:
- Nada en el CSS global la oculta. `src/app/globals.css:15-19` solo pone `overflow-x: clip` en `body`.
- Paginas con scroll de documento:
  - `/`: Lenis con `infinite: true` sobre el scroll real de la pagina (`src/motion/LandingComposition.tsx:322`, `src/motion/useLenis.ts:38`)
  - `/album/[slug]`: Lenis sin `infinite` (`src/motion/AlbumPhotos.tsx:40`)
  - `/about` y `/credits`: segun Javi, no desbordan 900 px de alto. Se confirma en T1
- Paginas sin scroll de documento:
  - `/albums`: `h-screen overflow-hidden`, `src/app/albums/page.tsx:21`
  - `/atlas`: `h-screen overflow-hidden`, `src/app/atlas/page.tsx:45`
- **El diagnostico de hoy no puede ver la barra.** Playwright arranca Chromium headless con `--hide-scrollbars`. Medido sobre una pagina de 3000 px de alto a 1440x900: `innerWidth - clientWidth` da 0 con el arranque por defecto y 15 sin ese flag. Con el CSS que la oculta da 0 en los dos casos, y la rueda hace scroll igual (600 px) en las cuatro combinaciones (scratchpad de la sesion: `2026-10-20_009-linea-base-barra.txt`, pendiente de copiar a `evidencia/`). Esos 15 px son lo que ocupa la barra clasica de Chrome en Windows.
- `GLSurface` dimensiona su canvas con `window.innerWidth` (`src/motion/GLSurface.tsx:231-234`), que incluye la barra, y centra cada plano respecto a `innerWidth / 2` (`src/motion/GLSurface.tsx:405`). Sin barra, `innerWidth` y el ancho visible coinciden.

## Objetivo

Ninguna ruta muestra la barra de scroll del navegador, ni reserva hueco para ella. El scroll sigue funcionando igual que hoy con rueda, teclado y tactil, y sobre Lenis en `/` y en los albumes. Ninguna foto se deforma.

## Fuera de alcance

- El codigo de Lenis (`src/motion/useLenis.ts`), la logica del scroll infinito y `GLSurface`. No se tocan.
- La lista de fotos de un cluster del atlas (`overflow-y-auto`, `src/motion/Atlas.tsx:887`). Conserva su barra (decision de Javi).
- Cualquier indicador de scroll sustituto. El landing va sin indicador a proposito ("no scroll hint", `docs/design-spec-v2.md:22`).
- `/lab/tube` (`src/motion/lab/TubeSpike.tsx`).
- Las 29 invariantes actuales siguen midiendose con el arranque por defecto (`--hide-scrollbars`), para no mover su linea base.

## Zonas afectadas

- [x] Landing (`src/motion/LandingComposition.tsx` y alrededores): no cambia su codigo, solo el ancho util del viewport
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`): igual, sin cambios de codigo
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion

Ficheros que cambian: `src/app/globals.css` (la regla que oculta la barra) y `scripts/diagnostico.mjs` (una seccion nueva para medirlo).

## Choca con el spec

Nada.
- No recorta fotos, no anade color y no mueve elementos con el cursor.
- Es solo CSS, sin animacion, asi que `prefers-reduced-motion` no se ve afectado.
- Con reduced motion Lenis no suaviza (`src/motion/useLenis.ts:35-38`) y el scroll es nativo: tiene que seguir funcionando sin barra. Lo cubre CA4.
- `docs/design-spec-v2.md` no dice nada de la barra de scroll. Se buscaron "scroll" y "overflow" en todo el fichero.

## Decisiones (Javi, 2026-10-20)

1. Hay que comprobar la linea base del harness. Hecho: con el arranque por defecto, el harness no ve la barra (ver "Problema").
2. Se acepta que la composicion del landing se recoloque al ganar el ancho de la barra. Lo que no se acepta es que ninguna imagen se deforme o se estire (CA5).
3. La lista de un cluster del atlas conserva su barra.
4. `/about` y `/credits` no hacen scroll.
5. Firefox se revisa a mano. Safari no se puede revisar: Javi no lo tiene.

## Criterios de aceptacion

CA2 a CA5 se miden en una seccion nueva de `scripts/diagnostico.mjs` (`barra de scroll`). Esa seccion abre su propio Chromium con `ignoreDefaultArgs: ["--hide-scrollbars"]`, a 1440x900, como el resto del diagnostico (`scripts/diagnostico.mjs:170`). Sus resultados cuentan como invariantes.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` | tsc, lint y build ok · 0 errores de consola en 6 rutas · todas las invariantes en verde, las 29 actuales mas las nuevas |
| CA2 | `node scripts/diagnostico.mjs --skip-build`, seccion `barra de scroll`: `innerWidth - document.documentElement.clientWidth` en las 6 rutas | `0` en las 6. Antes de cambiar `globals.css`, la misma medida tiene que dar `> 0` en `/` y en `/album/<slug>`. Asi se demuestra que la invariante detecta la barra |
| CA3 | Misma seccion, en `/` y en `/album/<slug>`: `page.mouse.wheel(0, 600)`, esperar 1000 ms y leer `scrollY` | `scrollY > 0` en las dos |
| CA4 | Misma seccion, en `/album/<slug>`: `page.keyboard.press("PageDown")`, esperar 1000 ms y leer `scrollY`, con un contexto normal y otro con `reducedMotion: "reduce"` | `scrollY > 0` en los dos contextos |
| CA5 | Misma seccion, en `/` y en `/album/<slug>`: para cada `<img>` visible con `naturalWidth > 0`, `abs((w/h) / (naturalWidth/naturalHeight) - 1)` usando su `getBoundingClientRect()`. Ademas, la caja CSS del canvas fijo de `GLSurface` frente a `innerWidth x innerHeight` | Desvio maximo < 0,01 en todas las fotos · caja del canvas = `innerWidth x innerHeight` (±1 px) |
| CA6 | Mismo comando, seccion `entrada /` | 7 participantes, 0 frames >50 ms, "al monton" escalonado (rango > 0), igual que la linea base del 2026-10-19 (`docs/ESTADO.md`, "Build") |
| CA7 | `git diff main --stat -- src/` | Solo `src/app/globals.css` |
| CA8 | Revision a mano de Javi en `npm run dev` (`localhost:3000`), en Chrome y en Firefox: `/`, un album, `/about` y `/credits` | No se ve barra en ninguna ruta, la rueda, el teclado y el trackpad hacen scroll, y ninguna foto se ve estirada. Testimonio de Javi, como el CA6 de la spec 003 |

## Preguntas abiertas

- Safari no se puede verificar: `::-webkit-scrollbar` queda SIN VERIFICAR en Safari hasta que alguien lo abra alli.

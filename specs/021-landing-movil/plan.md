# Plan 021 · Landing movil

- **Spec:** `spec.md` (aprobada el 2026-11-18)

## Enfoque

**Dos capas, separadas a proposito:**

1. **CSS:** la composicion. Se cuelga de las variantes `movil:` y `movil-h:` (`src/app/globals.css:19-28`), igual que la spec 020. Cada foto lleva en su `style` las posiciones de escritorio de hoy y, ademas, las suyas de movil como propiedades CSS (`--mx`, `--my`, `--mw` en vertical; `--hx`, `--hy`, `--hw` en horizontal). En `globals.css`, unas reglas `movil:` y `movil-h:` las aplican. Fuera de la media query nada cambia: el `top`, el `left` y el `--landing-photo-w` de escritorio siguen inline e intactos. Asi, el HTML del servidor ya trae la composicion movil y no hay salto al hidratar.

2. **JS:** el comportamiento. Se decide **una vez, al cargar la pagina**, con un hook nuevo, `useEsMovil()`, y no cambia hasta recargar (respuesta 5). El hook lee la misma media query (la cadena `MOVIL` de `scripts/lib/navegacion.mjs:17`, en una constante compartida de `src/`) con `useSyncExternalStore`: en el servidor da `null` y en el cliente da el valor de la primera lectura, cacheado en el modulo.
   - **GL:** con `esMovil === true`, `LandingComposition` no monta `GLSurface`. `glStatus` se queda en `null` y las `<img>` siguen visibles: es el camino de reserva sin WebGL que ya existe (`src/motion/LandingComposition.tsx:922`).
   - **Scroll:** `useLenis({ infinite: true }, active && esMovil === false)`. Sin Lenis, el scroll es el nativo.
   - **Sin copia:** la copia (`copy === 1`) lleva `movil:hidden`, y el contenedor toma en movil un alto finito: el borde inferior de la ultima foto, mas el aire y la barra (`--movil-alto`, una por orientacion).
   - **Contador del foco** (`:800-821`): sin Lenis lee `window.scrollY` en un listener `scroll` pasivo, sin la vuelta por modulo.
   - **Parallax** (`:700-711`): el mismo bucle de rAF. Con `PARALLAX_STRENGTH = 0.12` (`:48`) y `depth` como mucho 0,6, cada foto se mueve entre 0,93 y 1,07 veces el scroll, dentro del 0,9-1,1 de la spec. En movil los `depth` se eligen de nuevo con la composicion.
   - **Disparador del panel:** en movil, el mismo listener de scroll comprueba si el centro de la ultima foto cruza el centro del viewport y llama a `fijarPanel(true)` (`src/components/movil/panel.ts:20`) una sola vez. La bandera vive en el modulo, asi que dura toda la visita y se reinicia al recargar.

**La geometria de la entrada y del contador.** Las dos calculan hoy la posicion de cada foto con `actualWidthVw` e `itemHeightVh` a partir de la colocacion de escritorio (`:165-195`, `:255-264`). Pasan a llamar a una sola funcion, `geometriaPx(item, modo, vw, vh)`, que devuelve `x`, `y`, `ancho` y `alto` en px a partir de la colocacion del modo activo (escritorio, vertical u horizontal). En escritorio devuelve exactamente lo de hoy. Para elegir el modo, la funcion lee las media queries en el momento, no `esMovil`, porque la composicion la decide el CSS. Si un iPad cargado en vertical gira a horizontal, sale de `movil:` y su CSS pasa a la composicion de escritorio. Se queda sin GL, sin Lenis y con la copia oculta, pero con las fotos enteras en el DOM. Es el camino de reserva y no se intenta mas: la pregunta del plan de la spec queda resuelta asi.

**Unidades de la composicion movil.**
- **Vertical:** `x`, `y` y `w` en `vw`. Asi, el iPad mini y el iPad en vertical son la misma composicion escalada al ancho (respuesta 2). El alto de cada foto sale de su proporcion. A 768 y 834 px, una vertical al 65 % mide como mucho 723 px de alto, que cabe en 1024-1194 px menos la barra.
- **Horizontal:** `x` en `vw` dentro de la franja que dejan 47 px a cada lado, `y` en `vh` y `w` en px. Asi se puede garantizar que ninguna foto pasa de 300 px de alto (CA5).

**La composicion** sigue las reglas del lienzo (`docs/referencias/movil/Main.dc.html`, `Landing-A-scroll.dc.html`, `Landing-horizontal.dc.html`):
- Del 40 al 65 % del ancho, unas cinco fotos por pantalla, con solapes, y ninguna sale por los lados.
- Debajo del nombre quedan fotos que se cruzan con el `difference`.
- La foto 15 es la mas baja, para que el disparador cuadre.

La coloco yo y **paro con capturas para Javi** (respuesta 3) antes de tocar el scroll y GL.

**Wordmark y descriptor.**
- Hoy el `font-size` del `<h1>` va inline (`:1049`) y una clase no puede sobrescribirlo. Pasa a una clase de `globals.css` (`.landing-wordmark`, `clamp(64px, 16vw, 158px)`) con `movil:` a 78 px y `movil-h:` a 96 px. En escritorio, el valor computado es identico.
- La zona tactil de la spec 020 (`:1076-1081`) usa el mismo `clamp` en su `calc` y pasa a la misma variable.
- En horizontal, el nombre sube 29 px (centro en y = 166 de 390, frame `Landing-horizontal`) con un `padding-bottom` de 58 px en el propio `<h1>`, que es `fixed inset-0 flex items-center`. No anade transform, opacity ni filter, asi que el blend no cambia; lo comprueba la invariante del blend.
- El descriptor (`:1096-1101`) toma en movil 12 px, 0,18 em y 18 px de interlinea, con un ancho maximo que lo parte en dos lineas, y `top: calc(50% + 52px)`. En horizontal va en una linea, a `calc(50% + 29px)`. Hoy el `top` va inline: pasa a clase, con el mismo valor en escritorio.
- `DecipherWordmark` mide sus columnas en px en tiempo de ejecucion (`src/motion/DecipherWordmark.tsx:114`), asi que el cambio de tamaño no le afecta. No se toca.

**`sizes` de las `<img>`** (`:905`): se anteponen dos condiciones con la media query movil, vertical (`{mw}vw`) y horizontal (`{hw}px`), a la de `max-width: 899px` de hoy. En escritorio no casa ninguna (`pointer: fine`), asi que el `currentSrc` no cambia (CA2).

**El diagnostico.**
- **Regex** de «fotos enteras» (`scripts/diagnostico.mjs:402`): se arregla, `/^\s*slug: "([^"]+)",$/gm`, y la comprobacion se amplia al ancho (CA3, CA6).
- **Seccion nueva** `landing-movil`, en `scripts/lib/landingMovil.mjs`, como `navegacion.mjs`: solo en modo dispositivo y con la misma decision de si es movil. Mide CA3-CA5 y CA7-CA14 con toques reales por CDP y, en webkit, las duraciones por la CSS declarada.
- **Va primero (T1):** sobre el codigo de hoy, para que T0 tenga su linea base y se vea fallar donde hoy falla (M1, M13).

**Alternativas descartadas.**
- **Una clase en `<html>` en vez de la media query**, para fijar tambien la composicion hasta recargar: la variante `movil:` de la spec 020 es por media query, y la barra y el panel ya dependen de ella. Duplicarla en una clase deja dos fuentes que pueden discrepar.
- **Composicion en JS** (posiciones calculadas en el cliente): el HTML del servidor traeria la de escritorio, y el primer frame en movil seria el de hoy.
- **Lenis con `syncTouch`:** Javi eligio finito (respuesta 4).

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/lib/movil.ts` | crear | `MOVIL_QUERY`, `MOVIL_H_QUERY` (las cadenas de `globals.css:20,25`) y `useEsMovil()` |
| `src/motion/landingLayoutMovil.ts` | crear | Colocaciones movil (vertical y horizontal) por `photo.id`, `depth` movil y `--movil-alto` |
| `src/motion/LandingComposition.tsx` | modificar | Propiedades `--m*`/`--h*` por foto, `movil:hidden` en la copia, sin `GLSurface` ni Lenis en movil, `geometriaPx`, contador por `window.scroll`, disparador del panel, clases del wordmark, la zona tactil y el descriptor, `sizes` |
| `src/app/globals.css` | modificar | Reglas `movil:`/`movil-h:` de `.landing-photo`, del contenedor, `.landing-wordmark` y el descriptor |
| `scripts/lib/navegacion.mjs` | modificar | Importa `MOVIL` y `MOVIL_H` de un solo sitio, si se pueden compartir con `src/lib/movil.ts`; si no, un comentario cruzado |
| `scripts/lib/landingMovil.mjs` | crear | Seccion `landing-movil` |
| `scripts/diagnostico.mjs` | modificar | Regex de `:402`, «fotos enteras» tambien a lo ancho, y la llamada a la seccion nueva |
| `CLAUDE.md`, `docs/design-spec-v2.md` | modificar (cierre) | El landing en movil: finito, nativo, sin GL; los choques que lista la spec |

`src/motion/GLSurface.tsx`, `src/motion/useLenis.ts`, `src/motion/DecipherWordmark.tsx` y `src/components/movil/PanelMovil.tsx` no cambian.

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| En escritorio, `GLSurface` se monta un render mas tarde (con `esMovil === null` en el render de hidratacion no se monta) y cambia el arranque de la entrada | Media | Bajo | CA1 compara la entrada con T0 (arranque y frames > 50 ms). Si empeora: en el cliente, leer la media query de forma sincrona en el primer render que no sea de hidratacion |
| El parallax en rAF va un frame por detras del scroll nativo de iOS y tiembla, como M11 en el album | Media | Medio | Su amplitud es como mucho el 7 % del desplazamiento de cada frame (1-2 px). Se mira en el iPhone (CA16). Si tiembla, se deja `depth` a 0 en movil, que equivale a reduced motion |
| Mover el `font-size` y el `top` de inline a clase cambia un pixel en escritorio | Baja | Alto | CA2: capturas a 0 px. El valor computado es la misma cadena |
| La entrada calcula mal el punto de reunion con la geometria nueva (ya paso con `actualWidthVw`, changelog del design spec) | Media | Medio | `geometriaPx` sale de las mismas colocaciones que el CSS. Se mide el centro del monton frente al del viewport en la seccion `landing-movil` |
| iOS real no se comporta como la emulacion (M9 y M10 ya lo demostraron) | Media | Medio | CA16 en el iPhone 13 y el iPad mini, con `?diag` |
| La zona tactil del panel queda desalineada con el nombre a 78 y 96 px | Baja | Bajo | Usa la misma variable que el `<h1>`. CA3 de la seccion `navegacion` sigue en verde (CA15) |

## Vuelta atras

- **Rama:** `feat/021-landing-movil`
- **Como se revierte:** un commit por tarea. `git revert` del rango de la spec, o no fusionar la rama. Todo cuelga de `movil:` y de `esMovil`: el escritorio no depende de nada nuevo salvo `geometriaPx`, que en escritorio devuelve lo de hoy.
- **Que invariante avisaria de que esto ha roto algo:** las capturas de escritorio a 0 px (CA2), la entrada del landing (arranque y frames), el blend sin ancestros que lo rompan, «wordmark dice SUQUIA», un solo `<main>` visible y la seccion `navegacion` en los cinco perfiles.

## Verificacion

| Paso | Criterios | Salida |
|---|---|---|
| T0, linea base: diagnostico de escritorio con `--capturas-guardar`, y los cinco perfiles con la seccion nueva sobre el codigo de hoy | Referencia de CA1, CA2 y CA15; M1, M13 y M4 medidos | `evidencia/2026-11-XX_021-t0-*.txt`, `021-capturas-base/` |
| Tras la composicion: los cinco perfiles y las capturas para Javi | CA3-CA6, y el visto bueno de Javi sobre las capturas (respuesta 3) | `evidencia/..._021-composicion-*.txt` y las capturas |
| Tras el scroll y GL: los cinco perfiles | CA7-CA10, CA13 | `..._021-scroll-*.txt` |
| Tras el wordmark y el descriptor | CA11, CA12, CA15 | `..._021-wordmark-*.txt` |
| `--dispositivo iphone --cpu 4` | CA14 | `..._021-cpu4.txt` |
| Cierre: diagnostico de escritorio con build y `--capturas-comparar` | CA1, CA2 | `..._021-cierre.txt` |
| Javi en el iPhone 13 y el iPad mini, sobre la preview | CA16 | Anotado en `tasks.md` |

Las salidas se escriben en el scratchpad de la sesion y Javi las copia a `evidencia/` (la regla deny de `.claude/settings.json`, ver `docs/ESTADO.md`, «Esperando a»).

# Spec 014 · Wordmark: columnas a cero en el descifrado

- **Estado:** Aprobada por Javi el 2026-10-26 ("OK con la spec"; numeracion 014 confirmada). CA1 a CA6 pasan el mismo dia (`tasks.md`); falta CA7, en produccion
- **Fecha:** 2026-10-26
- **Requiere decision de Javi:** Si (motivo: wordmark). Javi pidio el arreglo el 2026-10-26 ("abre la spec y arreglalo"), despues de ver la causa y el arreglo propuesto en la conversacion

## Problema

A veces, durante el descifrado de llegada, las seis letras del wordmark se apilan en un solo bloque. Lo vio Javi en produccion el 2026-10-26. Cuando termina el descifrado, el wordmark vuelve a verse bien.

No es intermitente: depende de por donde se llega a `/`. Medido en produccion el 2026-10-26 a 1440x900, con el ancho de las 6 columnas de `[data-decipher-live]` durante el descifrado (script `repro-wordmark.mjs`, en el scratchpad de la sesion; pendiente de copiar a `evidencia/`):

| Llegada a `/` | Ancho de las columnas (px) |
|---|---|
| Carga directa en `/` | 75, 117, 120, 117, 55, 111 |
| Carga en `/about` y clic en el enlace a `/` | 0, 0, 0, 0, 0, 0 |
| Carga en `/albums` y clic en el enlace a `/` | 0, 0, 0, 0, 0, 0 |
| `/` → `/about`, cambio de tamano de ventana alli, → `/` | 0, 0, 0, 0, 0, 0 |

La causa:
- Cada columna del descifrado toma un ancho fijo, `letterWidthsRef` (`src/motion/DecipherWordmark.tsx:295-296`, aplicado en `:207` y `:267`).
- Ese ancho se mide con `offsetWidth` sobre unas letras de referencia ocultas (`:107-116`). La medicion se hace al montar (`:118-120`), al cambiar el tamano de la ventana (`:122-126`) y cuando terminan de cargar las fuentes (`:129-131`).
- El landing esta montado en todas las rutas, pero queda oculto con `display: none` en su `<main>` cuando no es `/` (`src/motion/LandingComposition.tsx:821`). Dentro de un `display: none`, `offsetWidth` da 0.
- Si una de esas tres mediciones cae mientras el landing esta oculto, los seis anchos se quedan en 0. Al entrar en `/` no se vuelve a medir, asi que las seis letras se pintan centradas en columnas de 0 px (`:367-379`): se apilan en el mismo punto.
- En reposo el wordmark es el nodo de texto "SUQUIA" (`:388`), que no usa esos anchos. Por eso la unica invariante del wordmark, que mira el texto en reposo (`scripts/diagnostico.mjs:273`), no lo detecta.

## Objetivo

El descifrado tiene siempre los anchos reales de SUQUIA, llegue uno a `/` como llegue. El diagnostico mide la geometria durante el descifrado, y falla si vuelve a pasar.

## Fuera de alcance

- La animacion en si: duracion, cascada, alfabeto, pool por anchura y retraso de 600 ms (`src/motion/DecipherWordmark.tsx:21-30`, `:47-48`, `:73`) no cambian.
- El pie de hover ("JAVIER SUAREZ SUQUIA") y el `<h1>` con blend `difference` de `LandingComposition`. No se anade ningun ancestro al elemento con blend.
- El caso de `prefers-reduced-motion`: el descifrado no llega a arrancar (`:333`), asi que no tiene columnas que medir.
- Cualquier otra medicion que haga el landing mientras esta oculto (fotos, GL). Si aparece otra igual, va en una spec propia.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [x] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion

Y `scripts/diagnostico.mjs`, que gana una seccion `descifrado del wordmark`.

## Choca con el spec

Nada. `docs/design-spec-v2.md:86` ya dice que las letras se miden con `offsetWidth` "on mount, resize, and `document.fonts.ready`". Medir tambien al empezar el descifrado, y no aceptar un 0, cumple la intencion del spec: que cada columna tenga el ancho de su letra. Si se implementa, esa linea se amplia con el nuevo momento de medicion. No toca ninguna regla dura de `CLAUDE.md`: no hay fotos, ni color, ni parallax, y reduced motion sigue sin descifrado.

## Criterios de aceptacion

La seccion `descifrado del wordmark` de `scripts/diagnostico.mjs` (nueva) carga cada escenario en un contexto limpio a 1440x900. Durante el descifrado, muestrea cada 25 ms el ancho de las columnas de `[data-decipher-live]`. La referencia es el ancho de "SUQUIA" en reposo en el `<h1>` de `/`. Los escenarios:
- (a) carga directa en `/`;
- (b) carga en `/about` y clic en `a[href="/"]`;
- (c) carga en `/albums` y clic en `a[href="/"]`;
- (d) `/` → `/about`, cambio del viewport a 1300 de ancho y vuelta a 1440, → `/`.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | Linea base: la seccion nueva sobre el codigo de hoy, antes del arreglo. `node scripts/diagnostico.mjs --skip-build` | Esa seccion falla en (b), (c) y (d), con las 6 columnas en 0 px, y pasa en (a). Demuestra que la invariante detecta el defecto |
| CA2 | Despues del arreglo: `node scripts/diagnostico.mjs --skip-build` | En (a), (b), (c) y (d), ninguna columna mide 0 en ninguna muestra, y la suma de las 6 queda a ±2 px del ancho de "SUQUIA" en reposo |
| CA3 | Igual que CA2 | Las 6 columnas miden lo mismo (±1 px) en (b), (c) y (d) que en (a) |
| CA4 | Igual que CA2 | El resto de invariantes: 105 de 105, como en `evidencia/2026-10-23_diagnostico_011-enmienda1.txt`. 0 errores de consola. "wordmark dice SUQUIA" y "blend difference sin ancestros que lo rompan" siguen en ok |
| CA5 | Igual que CA2, en `reducedMotion: "reduce"`, escenario (b) | `[data-decipher-live]` no aparece en ninguna muestra, y el `<h1>` dice "SUQUIA" desde la primera |
| CA6 | `node scripts/diagnostico.mjs` (con `next build`) | tsc, lint y build en ok |
| CA7 | Despues del push de Javi y del despliegue: `node scripts/diagnostico.mjs --url https://javisu-photography-portfolio.vercel.app` | La seccion `descifrado del wordmark` pasa en (a), (b), (c) y (d) |

## Preguntas abiertas

Resueltas el 2026-10-26:
- **Numeracion.** La 013 sigue reservada para la pagina de album que se ve en blanco al principio (`specs/012-carrusel-abrir-al-frenar/spec.md:33`, `:99`). Esta es la 014. Javi: "Me vale la 014".
- **Rama.** `feat/014-wordmark-columnas-cero`, que crea Javi con `git switch -c`.

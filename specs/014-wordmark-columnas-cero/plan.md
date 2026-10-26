# Plan 014 · Wordmark: columnas a cero en el descifrado

- **Spec:** `spec.md` (aprobada el 2026-10-26)

## Enfoque

Dos cambios en `measureAll` y en `beginDecipherTransition` de `src/motion/DecipherWordmark.tsx`:
1. `measureAll` no guarda un `offsetWidth` de 0. Un 0 solo sale si el landing esta oculto con `display: none`, y en ese caso se conserva la ultima medida buena.
2. `beginDecipherTransition` llama a `measureAll()` antes de copiar `letterWidthsRef` a los anchos de origen y destino. Solo se llega ahi con `activeRef.current` a `true` (`:306`, `:338`), es decir, con el `<main>` del landing ya visible. Por eso la medida es real aunque todas las anteriores hubieran caido con el landing oculto.

Las mediciones de montaje, resize y `fonts.ready` se quedan como estan. Lo unico que cambia es que ya no pueden escribir un 0.

Se descarto medir cuando `active` pasa a `true`, en un efecto. Funcionaria igual, pero separa la medida del unico sitio que la usa: el arranque del descifrado. Medir justo antes de usarla es mas dificil de romper.

La seccion de diagnostico va antes que el arreglo, para ver primero el rojo (CA1).

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/diagnostico.mjs` | modificar | Seccion nueva, `descifrado del wordmark`: escenarios (a) a (d) de la spec, mas reduced motion. Un `addInitScript` muestrea por rAF el ancho de las columnas de `[data-decipher-live]`. Corre con el run completo y con `--medir /` |
| `src/motion/DecipherWordmark.tsx` | modificar | `measureAll` ignora los 0, y `beginDecipherTransition` mide antes de arrancar |
| `docs/design-spec-v2.md` | modificar | §6, linea 86: se anade el nuevo momento de medicion |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| `measureAll` fuerza un layout sincrono en el frame en que arranca el descifrado | Alta (es lo que hace `offsetWidth`) | Bajo: 16 lecturas, sin escrituras entre ellas | CA4 vigila la entrada del landing (frames >50 ms) frente a la linea base |
| Un ancho de 0 legitimo que haya que guardar | Nula: ninguna letra de "JAVIERSUZQ" mide 0 con la fuente cargada | — | — |
| El muestreo del diagnostico se pierde el descifrado (600 ms) | Media en `next dev`, con la carga lenta | La invariante falla sin que haya defecto | El sampler se inyecta con `addInitScript` desde el primer frame y corre por rAF, sin depender de `load`. Ademas, "no hubo descifrado" se informa como fallo propio, distinto de "columnas a 0" |

## Vuelta atras

- **Rama:** `feat/014-wordmark-columnas-cero`
- **Como se revierte:** `git revert` del commit del arreglo. La seccion de diagnostico puede quedarse: volveria a dar rojo, que es lo que debe hacer
- **Que invariante avisaria de que esto ha roto algo:** `descifrado del wordmark` (nueva), "wordmark dice SUQUIA" y "blend difference sin ancestros que lo rompan" (`scripts/diagnostico.mjs:229-273`)

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| `node scripts/diagnostico.mjs --skip-build` antes del arreglo | CA1 | scratchpad: `2026-10-26_014-linea-base.txt` |
| `node scripts/diagnostico.mjs --skip-build` despues del arreglo | CA2, CA3, CA4, CA5 | scratchpad: `2026-10-26_014-arreglo.txt` |
| `node scripts/diagnostico.mjs` | CA6 | scratchpad: `2026-10-26_014-completo.txt` |
| `--url` contra produccion, tras el push de Javi | CA7 | `evidencia/2026-10-2X_014-produccion.txt` |

Las salidas van al scratchpad por la regla deny `Write(evidencia/**)`, y Javi las copia a `evidencia/` (`docs/ESTADO.md`, paso 6).

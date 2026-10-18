# Tareas 004 · Dependencia del carrusel y lint sin avisos

- **Plan:** `plan.md` (aprobado el 2026-10-18)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

`--medir` de `scripts/diagnostico.mjs` no saca la geometria de los frames del carrusel (`scripts/diagnostico.mjs:146-202`). CA7 se mide con un script de solo lectura fuera del repo, en el scratchpad de la sesion (`medir-carrusel.mjs`), que usa el Playwright del proyecto: abre `/albums` a 1440x900 y dpr 1, espera 3,5 s (el `SETTLE_MS` del harness) y lee `style.width`, `style.transform` y `getBoundingClientRect()` de cada frame (`div.absolute.isolate.overflow-hidden`, `src/motion/AlbumsCarousel.tsx:657`). Despues pulsa `ArrowRight`, espera otros 3,5 s y repite la lectura, como comprobacion extra del bucle de fisica. La salida va integra a la evidencia.

- [x] **T1** · Medida base de `/albums`, con el codigo identico a `main`
  - Fichero(s): `evidencia/2026-10-18_004-lint-carrusel-deps.txt` (seccion "CA7 antes")
  - Comprobacion: `git diff main -- src/ scripts/` vacio antes de medir. Consola sin errores durante la medida.
- [x] **T2** · Anadir `anchorRestOffsetPx` a las dependencias del efecto del bucle de fisica
  - Fichero(s): `src/motion/AlbumsCarousel.tsx:551`
  - Comprobacion: `npx eslint src --max-warnings=0` sale con 0 (CA1). `npx tsc --noEmit` sale con 0 (CA2).
- [x] **T3** · Hacer que el diagnostico exija 0 avisos de lint
  - Fichero(s): `scripts/diagnostico.mjs:56`, `scripts/diagnostico.mjs:237`
  - Comprobacion: CA4 y CA5 por `grep`. `node --check scripts/diagnostico.mjs` sin errores.
- [x] **T4** · Medida despues de `/albums`, comparada con la de T1
  - Fichero(s): `evidencia/2026-10-18_004-lint-carrusel-deps.txt` (secciones "CA7 despues" y "CA7 comparacion")
  - Comprobacion: `width` y `transform` de cada frame iguales al pixel en reposo, antes y despues del `ArrowRight` (CA7).
- [x] **T5** · Diff y diagnostico completo
  - Fichero(s): `evidencia/2026-10-18_004-lint-carrusel-deps.txt`, y la evidencia del propio diagnostico
  - Comprobacion: CA3 (diff de una linea en `src/`). CA6 (`lint ok`, 29 de 29, 0 errores de consola, `exit=0`).

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/2026-10-18_diagnostico_004.txt` (copiada por Javi, identica con `cmp` a la salida original)
- [x] Criterios de aceptacion de la spec ejecutados (CA1 a CA7 pasan: `evidencia/2026-10-18_004-lint-carrusel-deps.txt`. La copio Javi, porque `evidencia/` esta protegida contra escritura: `.claude/settings.json:26-27`)
- [x] `CLAUDE.md` y `docs/design-spec-v2.md`: no hace falta tocarlos, ninguno documenta el array de dependencias ni el codigo de salida del diagnostico
- [x] Estado de `spec.md` → Implementada

# Plan 004 · Dependencia del carrusel y lint sin avisos

- **Spec:** `spec.md` (aprobada el 2026-10-18)

## Enfoque

Se toma primero la medida base de `/albums` con el codigo sin tocar. Despues se cambian dos cosas:
- En `AlbumsCarousel.tsx`, se anade `anchorRestOffsetPx` al array de dependencias del efecto del bucle de fisica.
- En `scripts/diagnostico.mjs`, se lanza eslint con `--max-warnings=0` y el codigo de salida pasa a contar el lint.

Al final se vuelve a medir `/albums` y se pasa el diagnostico completo. La medida base se toma en la rama y no en `main`: en ese momento el codigo es identico al de `main` (la rama sale de `4f184e3`, y la spec solo ha anadido ficheros en `specs/`), y asi no hace falta cambiar de rama a mitad del trabajo. Se descarto `eslint-disable` por decision de Javi (`spec.md`, "Preguntas abiertas").

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/motion/AlbumsCarousel.tsx` | modificar | Linea 551: `}, [albums]);` → `}, [albums, anchorRestOffsetPx]);` |
| `scripts/diagnostico.mjs` | modificar | Linea 56: `npx eslint src` → `npx eslint src --max-warnings=0`. Linea 237: la condicion de salida gana `(!only && results.lint !== "ok" && results.lint !== "")`, el mismo criterio de "ok" que ya usa el resumen en la linea 231 |
| `evidencia/2026-10-18_004-lint-carrusel-deps.txt` | crear | Salida de los criterios de aceptacion CA1 a CA7 |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| El efecto se vuelve a ejecutar mas veces y reinicia el bucle de fisica (`cancelAnimationFrame` + nuevo `tick`) | Muy baja: el valor solo cambia cuando cambia `albums` (`spec.md`, "Problema") | Medio: un salto del carrusel | CA7: geometria igual al pixel en reposo. Ademas, un vistazo a mano al arrastrar y soltar |
| Con `--max-warnings=0`, eslint anade una linea (`ESLint found too many warnings`) y el resumen muestra esa linea en vez del recuento | Alta si hay avisos | Bajo: solo cambia el texto del resumen | Es aceptable: el resumen dice igualmente que el lint no esta `ok`. CA6 se comprueba con 0 avisos |
| Con `--only`, el lint no corre (`results.lint` es `null`) y la nueva condicion lo daria por fallo | Alta si no se protege | Medio: `--only` saldria siempre con 1 | La condicion lleva `!only`, igual que el resumen (`scripts/diagnostico.mjs:231`) |

## Vuelta atras

- **Rama:** `feat/004-lint-carrusel-deps`
- **Como se revierte:** `git revert` del commit de implementacion, o no fusionar la rama. Son dos lineas en dos ficheros.
- **Que invariante avisaria de que esto ha roto algo:** las de `/albums` del diagnostico (consola sin errores, un solo `<main>` visible, sin scroll horizontal) y la comparacion de geometria de CA7.

## Verificacion

| Comprobacion | Criterios |
|---|---|
| `npx eslint src --max-warnings=0` y `npx tsc --noEmit` | CA1, CA2 |
| `git diff --stat main -- src/` y `git diff main -- src/` | CA3 |
| `grep` en `scripts/diagnostico.mjs` | CA4, CA5 |
| `node scripts/diagnostico.mjs` | CA6 (la salida va tambien a su propio `evidencia/2026-10-18_diagnostico*.txt`) |
| `/medir-dom /albums` antes y despues | CA7 |

Todo se guarda en `evidencia/2026-10-18_004-lint-carrusel-deps.txt`.

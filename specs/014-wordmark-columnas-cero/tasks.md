# Tareas 014 · Wordmark: columnas a cero en el descifrado

- **Plan:** `plan.md` (aprobado el 2026-10-26, con la spec)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T1** · Seccion `descifrado del wordmark` en el diagnostico
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: CA1. **Pasa** (2026-10-26). Se corrio con `--medir /` en vez de `--skip-build`: la seccion es la misma y solo cambia el numero de rutas. Resultado: 19 de 28. Fallan las 9 invariantes de (b), (c) y (d), todas con columnas `0, 0, 0, 0, 0, 0`. Pasan (a), con `75, 117, 120, 117, 55, 111` y 595,2 px en reposo, y (e). Scratchpad: `2026-10-26_014-linea-base.txt`
- [x] **T2** · `measureAll` ignora los 0, y `beginDecipherTransition` mide antes de arrancar
  - Fichero(s): `src/motion/DecipherWordmark.tsx`
  - Comprobacion: CA2 a CA5. **Pasan** (2026-10-26), con `node scripts/diagnostico.mjs --skip-build`: 122 de 122 (las 105 de antes y 17 nuevas). En (a), (b), (c) y (d), 35 a 37 muestras, todas con `75, 117, 120, 117, 55, 111` y suma igual a los 595,2 px en reposo. En (e), 0 muestras y el `<h1>` dice "SUQUIA". 0 errores de consola. Entrada: arranque 233 ms y 0 frames >50 ms, contra 217 ms y 0 de `evidencia/2026-10-23_diagnostico_011-enmienda1.txt`. Scratchpad: `2026-10-26_014-arreglo.txt`
- [x] **T3** · El design spec recoge el nuevo momento de medicion
  - Fichero(s): `docs/design-spec-v2.md:86`
  - Comprobacion: la linea nombra la medicion al empezar el descifrado, y que un 0 nunca se guarda
- [x] **T4** · Run completo con build
  - Comprobacion: CA6. **Pasa** (2026-10-26). tsc, lint y build en ok, 122 de 122 y 0 errores. Scratchpad: `2026-10-26_014-completo.txt`

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde. Salida en el scratchpad; falta que Javi la copie a `evidencia/`
- [ ] Criterios de aceptacion de la spec ejecutados: CA1 a CA6 si. Falta CA7, en produccion, despues del push de Javi
- [x] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado. Solo cambio el design spec; `CLAUDE.md` no describe cuando se mide
- [ ] Estado de `spec.md` → Implementada (cuando pase CA7)

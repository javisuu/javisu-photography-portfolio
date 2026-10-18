# Tareas 003 · Fijar el runner y las acciones del workflow del espejo

- **Plan:** `plan.md` (aprobado el 2026-10-18)
- **Rama:** `feat/003-fijar-runner-mirror`, desde `0029941`

## Parte local

- [x] **T1** · `runs-on: ubuntu-24.04`, `actions/checkout@v5` y un comentario que explica por que el runner va fijo
  - Fichero(s): `.github/workflows/mirror.yml`
  - Comprobacion: CA1, CA2, CA3 y CA4 pasan (`evidencia/2026-10-18_003-fijar-runner-mirror.txt`). CA4 da `2`, igual que antes del cambio
- [x] **T2** · Diagnostico completo
  - Comprobacion: CA8 pasa. tsc ok, lint 0 errores y 1 aviso (B1), build ok, 0 errores de consola en 6 rutas, 29 de 29 invariantes, igual que el 2026-10-17 (`evidencia/2026-10-18_diagnostico.txt`)
- [x] **T3** · Commit en la rama y fusion fast-forward en `main`. El push lo hace Javi

## Parte GitHub (despues del push de Javi)

- [x] **T4** · CA5: `git ls-remote` del espejo frente a un filtrado local del mismo commit
  - Pasa: `c98b101` en los dos (`evidencia/2026-10-18_003-fijar-runner-mirror.txt`). La Action se lanzo con el push de `6544808` y publico sin intervencion
- [x] **T5** · CA6: Javi mira la ejecucion en la pestana Actions
  - Pasa, segun Javi el 2026-10-18: ejecucion en verde, sin anotaciones amarillas y con la imagen `ubuntu-24.04` en "Set up job". Es testimonio, no hay captura
- [x] **T6** · CA7: clonar el espejo y contar las imagenes del historial
  - Pasa: `1` (`public/atlas/land-mask.png`). El `mirror.yml` del espejo ya lleva `ubuntu-24.04` y `checkout@v5`

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/` (`evidencia/2026-10-18_diagnostico.txt`)
- [x] Criterios de aceptacion de la spec ejecutados: CA1 a CA8 pasan
- [x] `docs/ROADMAP.md`: deuda de `ubuntu-24.04`
- [x] `CLAUDE.md` y `docs/design-spec-v2.md`: nada que cambiar (ninguno menciona el runner ni la version de `checkout`)
- [x] Estado de `spec.md` → Implementada

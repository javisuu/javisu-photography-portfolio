# Specs (SDD)

Un directorio por cambio: `specs/NNN-nombre/`, con `NNN` correlativo de tres cifras y `nombre` en minusculas con guiones.

## Ciclo

1. **`spec.md`**: que y por que, con criterios de aceptacion ejecutables. Lo aprueba Javi.
2. **`plan.md`**: como, que ficheros y que riesgos. Lo aprueba Javi.
3. **`tasks.md`**: pasos atomicos, cada uno con su comprobacion.
4. **Implementacion**: siguiendo `tasks.md` en orden.
5. **Verificacion**: se ejecutan los criterios de aceptacion y la salida se guarda en `evidencia/`.

No se pasa de un paso al siguiente sin el OK del anterior. Se abre con `/spec-nueva <nombre>`.

## Reglas

- Un criterio de aceptacion es un comando con un resultado esperado, no una frase. Para algo visual, el comando es una medicion: una invariante de `scripts/diagnostico.mjs` o una cifra del DOM via `/medir-dom`.
- Cuatro zonas exigen decision explicita de Javi antes de implementar, porque han roto el sitio antes: el wordmark, el blend `mix-blend-mode: difference`, el ciclo de vida de `GLSurface` y el scroll infinito del landing.
- Si la spec contradice una regla dura de `CLAUDE.md` o del design spec, la spec lo dice y espera decision. No se resuelve por el camino.
- `_plantilla/` no se edita al abrir una spec: se copia.

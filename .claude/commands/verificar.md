---
description: Contrasta las afirmaciones de un fichero o de una frase contra el codigo y la evidencia
argument-hint: <ruta de fichero | afirmacion entre comillas>
---

Verifica: `$ARGUMENTS`

1. Si es una ruta, leela y extrae sus afirmaciones comprobables (cifras, rutas, nombres, comportamientos). Si es una frase, esa es la afirmacion.
2. Delega en el subagente `verificador`, pasandole la lista numerada. Puede leer `src/`, `docs/`, `scripts/` y `evidencia/`.
3. Devuelve su tabla sin retocar los veredictos:

| # | Afirmacion | Veredicto | Evidencia |
|---|---|---|---|

Veredictos posibles: `CONFIRMADO`, `REFUTADO`, `SIN EVIDENCIA`.

4. Cierra con un recuento (`N confirmadas, N refutadas, N sin evidencia`) y, si hay refutadas, que linea de `docs/` o de `CLAUDE.md` habria que corregir.

No modifiques ningun fichero. `docs/design-spec-v2.md` describe la intencion, no el sistema: **no sirve como evidencia de que algo este implementado.** Para eso vale `src/` o `evidencia/`.

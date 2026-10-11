---
description: Abre una spec SDD nueva desde la plantilla y redacta spec.md
argument-hint: <nombre-en-minusculas-con-guiones>
---

Abre una spec nueva llamada `$ARGUMENTS`.

1. Si `$ARGUMENTS` esta vacio, pide el nombre y para.
2. Lista `specs/` y calcula el siguiente `NNN` (tres cifras, correlativo; `001` si no hay ninguna).
3. Copia `specs/_plantilla/` a `specs/NNN-$ARGUMENTS/`.
4. Rellena **solo** `spec.md`: problema, objetivo, fuera de alcance, zonas del sitio afectadas y criterios de aceptacion.
   - Cada criterio de aceptacion es un comando con su resultado esperado, no una frase. Si el criterio es visual, el comando es una medicion: una invariante de `scripts/diagnostico.mjs`, o una cifra concreta obtenida del DOM (`/medir-dom`).
   - Cada afirmacion sobre el sistema lleva evidencia (`ruta:linea` o `evidencia/...`). Si no la tienes, pidela al subagente `explorador` o escribela en "Preguntas abiertas". No la supongas.
5. Antes de escribir nada, lee `docs/design-spec-v2.md` y comprueba si la spec contradice alguna regla dura de `CLAUDE.md` (fotos sin recortar, solo escala de grises, sin parallax de cursor, `prefers-reduced-motion`). Si la contradice, la spec lo dice en una seccion "Choca con el spec" y espera decision de Javi.
6. Si el cambio toca el wordmark, el blend `mix-blend-mode: difference`, el ciclo de vida de `GLSurface` o el scroll infinito, marca "Requiere decision de Javi: Si" con el motivo. Esas cuatro zonas han roto el sitio antes.
7. **Para.** No toques `plan.md` ni `tasks.md` hasta que Javi apruebe la spec.

Termina con la ruta de la spec y la lista de preguntas abiertas.

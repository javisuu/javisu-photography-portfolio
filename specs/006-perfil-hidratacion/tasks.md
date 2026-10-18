# Tareas 006 · Perfil del frame de arranque del landing

- **Plan:** `plan.md` (aprobado el 2026-10-18)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. `src/` y `next.config.ts` no se tocan en ninguno.

`<PROD>` = `https://javisu-photography-portfolio.vercel.app`.

- [x] **T1** · Argumentos (`--url`, `--local-prod`, `--repeticiones`, `--trace-dir`) y ciclo de vida del servidor local (`next build --no-mangling`, `next start -p 3102`, `taskkill /T /F` en `finally`)
  - Fichero(s): `scripts/perfil-arranque.mjs`
  - Comprobacion: con argumentos invalidos sale con exit 2. Con `--local-prod`, el servidor responde y despues `netstat` da 0 en `:3102`.
- [x] **T2** · Un trace real de una carga de `/`: confirmar el hilo `CrRendererMain`, las marcas `blink.user_timing`, los nombres de evento, los `ProfileChunk`, y si los chunks de produccion contienen rutas `node_modules/<paquete>`
  - Fichero(s): ninguno del repo (trace en el scratchpad)
  - Comprobacion: lista de nombres de evento en la ventana con su tiempo propio. Con ella se fija el mapeo de categorias del plan.
- [x] **T3** · Analisis: ventana del frame del arranque, reparto por categoria con "red/espera" y "otros", top 10 de tiempo propio por `(url, funcion)` con su paquete
  - Fichero(s): `scripts/perfil-arranque.mjs`
  - Comprobacion: CA2 y CA3 en una repeticion local.
- [x] **T4** · Dos cargas por repeticion (sin trace y con trace), linea de CA4 con aviso por encima del 30 %, medianas y exit
  - Fichero(s): `scripts/perfil-arranque.mjs`
  - Comprobacion: CA4.
- [x] **T5** · Ejecucion contra produccion
  - Fichero(s): `evidencia/2026-10-18_006-perfil-produccion.txt` (lo copia Javi)
  - Comprobacion: CA1 a CA4 con `--repeticiones 3`.
- [x] **T6** · Ejecucion `--local-prod`
  - Fichero(s): `evidencia/2026-10-18_006-perfil-local-prod.txt` (lo copia Javi)
  - Comprobacion: CA5. Se compara el frame sin trace con el de produccion.
- [x] **T7** · Documentar el comando. Corregir el comentario de `scripts/diagnostico.mjs:357-358` solo si el trace lo refuta. No lo refuta: el frame es una sola tarea con el commit de React (`commitHookEffectListMount`, `renderWithHooks` en `evidencia/2026-10-18_006-perfil-local-prod.txt`), y el comentario se queda
  - Fichero(s): `.claude/commands/diagnostico.md`, quiza `scripts/diagnostico.mjs` (solo el comentario)
  - Comprobacion: `grep -n "perfil-arranque" .claude/commands/diagnostico.md`.
- [x] **T8** · Comprobaciones finales
  - Fichero(s): `evidencia/2026-10-18_diagnostico_006.txt`, `evidencia/2026-10-18_006-perfil-hidratacion.txt`
  - Comprobacion: CA6, CA7 y CA8.

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/2026-10-18_diagnostico_006.txt` (29 de 29, exit 0)
- [x] Criterios de aceptacion de la spec ejecutados (CA1 a CA8)
- [x] `CLAUDE.md` y `docs/design-spec-v2.md`: sin cambios en esta spec. Quedan para el cierre de sesion: que `createImageBitmap` decodifica en el hilo principal (`CLAUDE.md`, "Architecture rules", y `src/motion/GLSurface.tsx:93-97` lo niegan), que Vercel sirve el AVIF original y que GSAP no esta en `package.json`
- [x] Estado de `spec.md` → Implementada

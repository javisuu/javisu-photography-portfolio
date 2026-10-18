# Tareas 005 · Diagnostico contra produccion y tiempos de la entrada

- **Plan:** `plan.md` (aprobado el 2026-10-18)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. `src/` no se toca en ninguno.

`<PROD>` = `https://javisu-photography-portfolio.vercel.app`.
- La URL que dio Javi (`https://javisu-photography-portfolio-or61ohpd6-javisuus-projects.vercel.app`) es la de un despliegue y esta protegida: redirige a `vercel.com/login` con 200. La primera ejecucion midio la pagina de login (wordmark `"Log in to Vercel"`, 18 errores de terceros) y por eso el harness ahora compara el origen final y sale con 2 (CA6 en la evidencia).
- El dominio publico responde 200 sin redirigir y sirve el sitio: `<title>SUQUIA — Javier Suquia Photography</title>`, `noimageai` y 30 `landing-photo-entrance` (comprobado con `curl` el 2026-10-18). Que commit tiene desplegado: SIN VERIFICAR.

Reglas de fase que usa el harness, sacadas del codigo de la entrada:
- copy-0 nace con `opacity: 0` inline y copy-1 sin opacidad inline (`src/motion/LandingComposition.tsx:849`).
- Fase A: `transform` constante con el desplazamiento del monton y opacidad de 0 a 1 (`:690-700`).
- Fase B: `transform` que va a `translate(0px, 0px) rotate(0deg)`, con opacidad 1 (`:701-724`).
- Rezagadas: solo opacidad, sin `transform` (`:725-737`).

- [x] **T1** · Argumentos `--url` y `--repeticiones`, validados antes de cargar Playwright
  - Fichero(s): `scripts/diagnostico.mjs` (cabecera y argumentos)
  - Comprobacion: CA6. `--repeticiones 0` y `--repeticiones x` tambien salen con `exit 2`.
- [x] **T2** · Rama remota: sin `tsc`/`lint`/`build`, sin `next dev`, con comprobacion de que la URL responde. Si responde con >= 400 (por ejemplo, la proteccion de Vercel), mensaje y `exit 2`
  - Fichero(s): `scripts/diagnostico.mjs` (estatico, servidor y resumen)
  - Comprobacion: CA1 (parte estatica), CA2.
- [x] **T3** · `dev.once("exit")`: si `next dev` muere antes de responder, el harness imprime su salida y termina con `exit 2`
  - Fichero(s): `scripts/diagnostico.mjs` (servidor)
  - Comprobacion: CA5.
- [x] **T4** · Muestreador de la entrada y seccion `=== entrada / ===`, con linea en el resumen
  - Fichero(s): `scripts/diagnostico.mjs` (despues del bucle de rutas)
  - Comprobacion: CA4 en local: 29 de 29, `[entrance] start` x1 y 0 rezagadas. La fase B, cerca de los 350 ms (`PILE_MIN_DWELL_MS`) despues del inicio.
- [x] **T5** · Coste del muestreador: en local, frames de mas de 50 ms con y sin el muestreo de estilos (solo los tiempos de frame)
  - Fichero(s): ninguno del repo (comparacion de una sola vez, con su salida en la evidencia)
  - Comprobacion: la diferencia se apunta en la evidencia.
- [x] **T6** · Ejecucion contra produccion
  - Fichero(s): `evidencia/2026-10-18_005-diagnostico-produccion.txt` (lo copia Javi)
  - Comprobacion: CA1, CA2 y CA3 con `--repeticiones 3`. Si sale ruido de terceros o un 401, se para y se pregunta.
- [x] **T7** · Documentar las opciones nuevas
  - Fichero(s): `.claude/commands/diagnostico.md`, comentario de cabecera de `scripts/diagnostico.mjs`
  - Comprobacion: `grep -n -- "--url" .claude/commands/diagnostico.md scripts/diagnostico.mjs`.
- [x] **T8** · Comprobaciones finales
  - Comprobacion: CA7 y CA8.

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/2026-10-18_diagnostico_005.txt` (29 de 29, exit 0)
- [x] Criterios de aceptacion de la spec ejecutados (CA1 a CA8, `evidencia/2026-10-18_005-diagnostico-produccion.txt`)
- [x] `CLAUDE.md` y `docs/design-spec-v2.md`: sin cambios en esta spec. Lo de 7 participantes y no 15 (`CLAUDE.md`, "Architecture rules") queda para el cierre de sesion
- [x] Estado de `spec.md` → Implementada

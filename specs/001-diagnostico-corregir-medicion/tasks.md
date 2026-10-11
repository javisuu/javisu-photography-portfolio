# Tareas 001 · Diagnostico: corregir la medicion

- **Plan:** `plan.md` (aprobado el 2026-10-11)
- **Rama:** `feat/001-diagnostico-corregir-medicion`. Se creo desde `feat/landing-gl-surface` y arrastra sus 13 cambios sin commit, que no son de esta spec y no se incluyen en su commit.

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T1** · Comprobar que en reposo `"SUQUIA"` no tiene ningun ancestro `aria-hidden` y que el `<h1>` esta dentro del `<main>` del landing
  - Fichero(s): `src/motion/DecipherWordmark.tsx`, `src/motion/LandingComposition.tsx` (solo lectura)
  - Comprobacion: `DecipherWordmark.tsx:345-350`: la raiz es un `<span>` sin `aria-hidden`, y `"SUQUIA"` (`:388`) es hijo directo suyo. Los `aria-hidden` estan en `:353` (columnas a mitad de animacion), `:398` (pie de hover) y `:428` (glifos de referencia), y los tres se quitan. El `<h1>` (`LandingComposition.tsx:993`) esta entre `<main>` `:785` y `</main>` `:1023`.
- [x] **T2** · URL en los errores de consola y listener de respuestas HTTP >= 400
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: `node scripts/diagnostico.mjs --medir /` incluye una URL en cada linea de error
- [x] **T3** · Wordmark: el `<h1>` del `<main>` visible, sin nodos `aria-hidden`
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: `node scripts/diagnostico.mjs --medir /` da `ok   wordmark dice SUQUIA`
- [x] **T4** · Canvas: esperado segun `position` (fijo: viewport; si no: su propia caja) e invariante en toda ruta con canvas
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: `--medir /atlas` da esperado `[1440,609]` y FALLA. `--medir /` da esperado `[1440,900]`
- [x] **T5** · `/albums`: el contenedor raiz pasa de `div` a `main`
  - Fichero(s): `src/app/albums/page.tsx`
  - Comprobacion: `--medir /albums` da `ok` en `<main>` y `ok` en scroll horizontal. `git diff --stat -- src/app/albums` da 2 lineas

- [x] **T6** · *(aparecida al verificar, 2026-10-11)* El harness deja `next dev` vivo en Windows y el siguiente run mide contra ese servidor huerfano
  - Causa: con `shell:true`, `dev.kill()` en Windows mata solo la shell. El `next dev` del primer diagnostico (13:17) seguia escuchando en :3100 a las 15:48 y el segundo run se quedo colgado en `/` mas de 600 s. Se cerro con `taskkill /T /F`.
  - Fichero(s): `scripts/diagnostico.mjs`. `killDev()` mata el arbol con `taskkill /T /F` en Windows, y el script aborta con codigo 2 si el puerto ya esta ocupado antes de arrancar
  - Comprobacion: tras un run completo, `netstat -ano | grep ":3100" | grep LISTEN` no devuelve nada

- [x] **T7** · *(aparecida al verificar, 2026-10-11)* Los 403 eran el propio harness: next dev solo admite los origenes `localhost`/`**.localhost` para `/_next/*` (`node_modules/next/dist/server/lib/router-utils/block-cross-site-dev.js`, `blockCrossSiteDEV`), y el script pedia desde `127.0.0.1`. Los chunks JS (`src_motion_*`, `node_modules_*`) daban 403 y el cliente no se hidrataba
  - Fichero(s): `scripts/diagnostico.mjs`: `BASE` pasa a `http://localhost:3100`. Ademas, `--medir` rechaza una ruta que no empiece por `/`, porque Git Bash convierte `/atlas` en `C:/Program Files/Git/atlas`. Y "Failed to load resource" ya no se cuenta dos veces, porque el listener `response` lo registra con su URL
  - Comprobacion: run completo con 0 errores de consola en 6 rutas (`evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt`)

## Cierre

- [x] Run completo `node scripts/diagnostico.mjs --skip-build`, salida guardada en `evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt`
- [x] Criterios de aceptacion CA1 a CA8 ejecutados (CA5 y CA6 con la premisa refutada, ver `spec.md`)
- [x] `CLAUDE.md` y `docs/design-spec-v2.md`: no cambia nada documentado. `docs/ESTADO.md` (B2, B3, B4) lo actualiza `/cerrar-sesion`
- [x] Estado de `spec.md` → Implementada (falta que Javi acepte CA5 y CA6 reformulados)

# Tareas 008 · Entrada sin latigazo

- **Plan:** `plan.md` (aprobado el 2026-10-19)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T1** · Añadir `PILE_JOIN_MIN_GAP_MS = 70` junto a las demas constantes `PILE_*` (`src/motion/LandingComposition.tsx:88-91`), con un comentario corto explicando que es un throttle de espaciado visual, no un tiempo de decode real
  - Fichero(s): `src/motion/LandingComposition.tsx`
  - Comprobacion: `npx tsc --noEmit` sin errores nuevos — hecho, limpio
- [x] **T2** · Añadir `nextAllowedJoinAt: number` al tipo `PileEntranceState` (`:262-284`) e inicializarlo a `state.startTime` donde se crea el `state` (`:480-491`)
  - Fichero(s): `src/motion/LandingComposition.tsx`
  - Comprobacion: `npx tsc --noEmit` sin errores nuevos — hecho, limpio
- [x] **T3** · Introducir `scheduleJoin()` dentro del `forEach` de participantes (`:534-559`), envolviendo la llamada real a `join()` con el throttle de espaciado minimo descrito en `plan.md`; cambiar `whenImageReady(img).then(join)` por `whenImageReady(img).then(scheduleJoin)` y el camino `!img` para que tambien pase por `scheduleJoin()`
  - Fichero(s): `src/motion/LandingComposition.tsx`
  - Comprobacion: `npx tsc --noEmit` y `npx eslint` sin avisos nuevos — hecho, limpio
- [x] **T4** · Comprobacion visual local: `npm run dev`, abrir `http://localhost:3000` (no `127.0.0.1`), recargar varias veces y confirmar a ojo que las fotos del monton ya no aparecen todas en el mismo instante
  - Fichero(s): ninguno (verificacion manual)
  - Comprobacion: confirmado por Javi — "está genial". Dos observaciones sin relacion con el cambio, ambas de la primera carga en frio de `next dev`: una vez se traba al compilar (Turbopack JIT, normal, visto antes) y una vez la entrada no llego a jugar (coincide con un patron ya anotado en `ESTADO.md` sobre cache fria de `next dev`, no reproducido en recargas siguientes). Ninguna de las dos relacionada con `scheduleJoin`
- [x] **T5** · `node scripts/diagnostico.mjs --skip-build` en local (CA1) y guardar la salida en el scratchpad de la sesion
  - Fichero(s): ninguno
  - Comprobacion: 29 de 29 invariantes, 0 errores de consola, tsc/lint ok. "al monton" paso de 7 marcas identicas a `521 555 571 654 704 788 855` — el escalonado funciona. Nota: esta repeticion salio `rezagadas 1` (la 7ª foto se une en el mismo instante en que dispara la dispersion, sin momento de reposo propio, porque para entonces ya paso el minimo de 350ms de `PILE_MIN_DWELL_MS`); Javi lo reviso a ojo junto a T4 y no se nota — se deja asi, sin tocar codigo

## Cierre

- [x] Commit en `feat/008-entrada-sin-latigazo` (`c6279de`), confirmado por Javi antes de crearlo
- [x] Javi hace merge/push a `main` (`328b947..c6279de`) y Vercel termina el deploy
- [x] `node scripts/diagnostico.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 5` contra produccion — CA2 PASA (mediana de frames >50ms: 3, frente a la linea base de 4) y CA3 PASA (rango de "al monton" mayor que 0 en las 5 repeticiones; sigue habiendo repeticiones parciales dentro de cada una, ver nota en la evidencia — probable artefacto de muestreo bajo los frames caidos de la causa 2, no tocada en esta spec)
- [x] `node scripts/perfil-arranque.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 3` contra produccion — CA4 PASA (sin regresion, mismo reparto que la linea base)
- [x] Salida guardada en el scratchpad de la sesion: `2026-10-19_008-diagnostico-produccion.txt`, `2026-10-19_008-perfil-arranque-produccion.txt` (pendiente de copiar a `evidencia/` por la regla deny activa)
- [x] `docs/ESTADO.md`: B7 actualizado — mejora parcial, no cerrado del todo (ver nota en la tabla de defectos); nueva fila en "Registro de sesiones"
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md`: pendiente — la mencion a "cada participante se une conforme su propio decode resuelve" deberia sumar el throttle de espaciado. Se hace en el commit de cierre junto con el resto de docs
- [x] Estado de `spec.md` → Implementada

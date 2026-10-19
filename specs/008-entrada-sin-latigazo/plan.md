# Plan 008 · Entrada sin latigazo

- **Spec:** `spec.md` (aprobada el 2026-10-19)

## Enfoque

Hoy, `whenImageReady(img).then(join)` resuelve de forma SINCRONA para las 7 fotos participantes cuando `startPileEntrance()` arranca: por ser `priority`-loaded y servirse ya optimizadas (spec 007), `img.complete` es casi siempre `true` para las 7 en el momento en que se comprueba, asi que las 7 promesas se resuelven en el mismo barrido de microtareas — de ahi que `joinedAt` registre el mismo milisegundo para las 7 (`al monton: 817×7`, etc.). No hay ninguna senal de tiempo real que diferenciarlas ya.

La solucion es un *throttle de espaciado minimo* sobre el momento en que cada foto EJECUTA `join()` (no sobre su decode real, que no se toca): se mantiene un `nextAllowedJoinAt` en el estado de la entrada, inicializado a `state.startTime`. Cuando una foto esta lista, su `join()` real se programa como `max(ahora, nextAllowedJoinAt)`, y `nextAllowedJoinAt` avanza ese mismo valor + `PILE_JOIN_MIN_GAP_MS` para la siguiente. Si una foto tarda de verdad mas que el hueco acumulado (straggler real, red lenta), no se retrasa artificialmente mas alla de su propio tiempo de llegada — el throttle solo actua cuando varias llegan "juntas". Nada de esto toca `GLSurface.tsx` ni el calculo de la dispersion (fase B), que siguen igual.

Alternativa descartada: espaciar las llamadas reales a `createImageBitmap`/el propio `<img>` fetch — descartada en la spec (candidato 3) por anadir complejidad sin beneficio visible sobre este throttle.

## Ficheros

| Fichero | Accion (crear / modificar / borrar) | Que cambia |
|---|---|---|
| `src/motion/LandingComposition.tsx` | modificar | Nueva constante `PILE_JOIN_MIN_GAP_MS`; campo `nextAllowedJoinAt: number` en `PileEntranceState`; nueva funcion `scheduleJoin()` que envuelve la llamada a `join()` con el throttle descrito; `whenImageReady(img).then(join)` pasa a `whenImageReady(img).then(scheduleJoin)` (y el camino `!img` tambien, por consistencia) |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| El throttle anade hasta `(participantes − 1) × PILE_JOIN_MIN_GAP_MS` de retraso cuando todas llegan juntas (con 7 fotos y 70ms, ~420ms) | Alta (es el caso de hoy) | Bajo | Sigue muy por debajo de `PILE_MAX_WAIT_MS` (2500ms) y del mismo orden que `PILE_MIN_DWELL_MS` (350ms) — no cambia el presupuesto global de la entrada, solo cuando entra cada una dentro de el |
| El valor de `PILE_JOIN_MIN_GAP_MS` es una decision visual (que tan perceptible se ve la pila construirse), no algo que el diagnostico pueda puntuar | Media | Bajo | Se fija un valor inicial (70ms) y Javi lo revisa a ojo en `npm run dev`; se ajusta antes de cerrar si hace falta, sin reabrir la spec |
| Un straggler real que naturalmente iba a tardar algo menos que el hueco acumulado de los que van antes se retrasa un poco mas de lo estrictamente necesario | Baja | Bajo | El retraso extra es como mucho un `PILE_JOIN_MIN_GAP_MS` (70ms), del mismo orden que `PILE_FADE_IN_MS` (180ms) ya existente; no cambia el comportamiento de los stragglers reales (los que llegan despues de que la dispersion ya empezo) |

## Vuelta atras

- **Rama:** `feat/008-entrada-sin-latigazo`
- **Como se revierte:** un solo commit; revertirlo deja `whenImageReady(img).then(join)` tal cual estaba, sin ningun otro cambio de por medio
- **Que invariante avisaria de que esto ha roto algo:** ninguna invariante de `scripts/diagnostico.mjs` cubre el throttle directamente (es timing, no geometria) — la señal de regresion seria CA1 fallando (p. ej. si se rompe el tipo `PileEntranceState` o la entrada deja de dispararse), o `[entrance] start` apareciendo mas de una vez en consola (la regresion que el propio comentario del codigo ya vigila)

## Verificacion

- **CA1** (`node scripts/diagnostico.mjs --skip-build`): local, antes de commitear.
- **CA2 y CA3** (`node scripts/diagnostico.mjs --url ... --repeticiones 5`, mirando "frames >50 ms" y las lineas "al monton"): requieren el cambio ya desplegado en produccion — se miden DESPUES de que Javi haga push y Vercel termine el deploy, no antes.
- **CA4** (`node scripts/perfil-arranque.mjs --url ... --repeticiones 3`): mismo momento que CA2/CA3, de control.
- Salida guardada en el scratchpad de la sesion (regla deny de `Write(evidencia/**)` sigue activa, ver `docs/ESTADO.md` → "Esperando a"); Javi la copia a `evidencia/2026-10-19_008-entrada-sin-latigazo-produccion.txt` si quiere conservarla ahi.

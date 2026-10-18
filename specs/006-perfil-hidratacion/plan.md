# Plan 006 · Perfil del frame de arranque del landing

- **Spec:** `spec.md` (aprobada el 2026-10-18)

## Enfoque

Un script nuevo, `scripts/perfil-arranque.mjs`, con dos fuentes: `--url <base>` (produccion) o `--local-prod`.

**`--local-prod`:**
- Ejecuta `npx next build --no-mangling` y luego `npx next start -p 3102`.
- Espera a que responda.
- Al terminar mata el arbol de procesos con `taskkill /T /F`, igual que `scripts/diagnostico.mjs:148`.
- Comprueba el lockfile de dev como en la 005: si `next build` o `next start` salen antes de responder, imprime su salida y termina con 2.

**Por cada repeticion, dos cargas de `/`**, cada una en un contexto nuevo con la cache vacia, a 1440x900 y dpr 1:
- **Carga sin trace:** solo el muestreo de frames. Da el frame del arranque "limpio" de CA4.
- **Carga con trace:**
  - Usa `browser.startTracing(page, { categories })` de Playwright, con `devtools.timeline`, `disabled-by-default-devtools.timeline`, `v8.execute`, `disabled-by-default-v8.cpu_profiler`, `blink.user_timing` y `loading`.
  - Guarda el JSON en el scratchpad, o en `--trace-dir`.

**Muestreo dentro de la pagina:** el `addInitScript` del harness hace dos `performance.mark`:
- uno por frame de rAF;
- otro al ver `[entrance] start`, envolviendo `console.log` como hace `scripts/diagnostico.mjs:299-303`.

Esas marcas salen en el trace (`blink.user_timing`). Con ellas se fija la ventana del frame del arranque en el reloj del trace sin adivinar el desfase. El sitio no se instrumenta: las marcas las pone el harness.

**Analisis del trace,** solo en el hilo `CrRendererMain` de la pestana y dentro de la ventana:
- **Por categoria:** tiempo propio de cada evento (su duracion menos la de sus hijos), agrupado por nombre:
  - **parse/compilacion:** `v8.compile`, `v8.parseOnBackground`, `CompileScript`, `CompileCode`.
  - **ejecucion JS:** `EvaluateScript`, `FunctionCall`, `v8.callFunction`, `TimerFire`, `FireAnimationFrame`, `EventDispatch`, `RunMicrotasks`.
  - **estilo/layout:** `UpdateLayoutTree`, `RecalculateStyles`, `Layout`, `ParseHTML`, `ParseAuthorStyleSheet`.
  - **pintado/GPU:** `Paint`, `PrePaint`, `Layerize`, `CompositeLayers`, `UpdateLayer`, y llamadas WebGL si salen como eventos.
  - **decodificacion:** `Decode Image`, `ImageDecodeTask`, `Decode LazyPixelRef`.
  - **red/espera:** la parte de la ventana sin ninguna tarea en el hilo principal.
  - **otros:** el resto del tiempo de tareas.
  - Los nombres exactos se confirman en T2 con un trace real antes de fijar la tabla.
- **Top 10 (CA3):** las muestras del perfil de CPU de V8 (eventos `ProfileChunk`) dentro de la ventana, sumadas como tiempo propio por `(url, funcion)`. Con `--url` los nombres saldran minificados. Con `--local-prod` salen legibles gracias a `--no-mangling`. A cada chunk se le pone el paquete que contiene, buscando rutas `node_modules/<paquete>` en su contenido. Que Turbopack las deje en el chunk de produccion: SIN VERIFICAR, se comprueba en T2. Si no aparecen, se dice "paquete desconocido" en vez de adivinar.

**Salida:**
- texto con la seccion `=== perfil arranque / ===` por repeticion, y medianas si hay mas de una;
- la linea de CA4, con el aviso si la diferencia pasa del 30 %;
- exit 0 si se pudo medir, 2 si no: URL invalida o protegida, servidor que no arranca, o sin `[entrance] start`.

**`--url`** reutiliza las mismas reglas que la 005: http/https y el mismo origen tras redirigir (`scripts/diagnostico.mjs`, rama remota).

**Descartado:**
- Meterlo en `diagnostico.mjs`: es pesado, solo sirve para `/` y la spec lo deja aparte (pregunta 3).
- Compartir el muestreador con `diagnostico.mjs` sacandolo a un modulo comun: obligaria a tocar el harness del diagnostico por una medida aparte. El de este script tiene unas 20 lineas y mide solo frames y el inicio.
- `--debug-prerender`: es un build de desarrollo (`spec.md`, preguntas resueltas).
- `--profile` de React: cambia el build que se mide.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/perfil-arranque.mjs` | crear | El script entero |
| `.claude/commands/diagnostico.md` | modificar | Una linea: cuando y como usar `perfil-arranque.mjs` |
| `scripts/diagnostico.mjs` | modificar solo si T6 lo refuta | El comentario de :357-358 ("tarea de hidratacion"), segun lo que diga el trace. Ningun cambio de codigo |

`src/` y `next.config.ts` no se tocan (CA8).

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| `next build --no-mangling` cambia el tiempo que se mide | media | medio | Se compara su frame del arranque sin trace con el de produccion (CA1 frente a CA5). Si difieren mucho, se dice: la lista de funciones vale para leer nombres, pero no da las cifras |
| El build de `--local-prod` sobreescribe `.next/`, que tambien usa `diagnostico.mjs` | segura | bajo | El diagnostico vuelve a construir con su `next build`. CA6 se ejecuta despues |
| Un `next dev` abierto en la carpeta bloquea el build o el start | baja | bajo | Igual que la 005: si el hijo sale antes de responder, se imprime su salida y exit 2 |
| El trace infla el frame | media | medio | CA4 lo mide en cada repeticion, con la carga sin trace al lado |
| Los nombres de evento cambian en Chromium 1.64 | media | bajo | T2 los saca de un trace real antes de fijar el mapeo. Lo que no encaje cae en "otros", y CA2 avisa si "otros" pasa del 10 % |
| Las marcas por frame cuestan algo | baja | bajo | `performance.mark` es barato. Si la carga sin trace da un frame del arranque distinto del de la 005, se apunta |
| `next start` queda vivo | baja | medio | `taskkill /T /F` en un `finally`, y CA5 lo comprueba con `netstat` |

## Vuelta atras

- **Rama:** `feat/006-perfil-hidratacion`
- **Como se revierte:** borrar `scripts/perfil-arranque.mjs` y la linea de `.claude/commands/diagnostico.md`, o `git revert` del commit. No hay estado fuera del repo salvo los traces del scratchpad.
- **Que invariante avisaria de que esto ha roto algo:** ninguna del sitio, porque el sitio no cambia. CA6 (diagnostico 29 de 29) y CA8 (diff vacio en `src/` y `next.config.ts`) lo confirman.

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| `node scripts/perfil-arranque.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 3` | CA1, CA2, CA3, CA4 | `evidencia/2026-10-18_006-perfil-produccion.txt` |
| `node scripts/perfil-arranque.mjs --local-prod --repeticiones 3`, y despues `netstat` | CA5 (y CA2-CA4 en local) | `evidencia/2026-10-18_006-perfil-local-prod.txt` |
| `node scripts/diagnostico.mjs` | CA6 | `evidencia/2026-10-18_diagnostico_006.txt` |
| `npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `git diff --stat main -- src/ next.config.ts` | CA7, CA8 | `evidencia/2026-10-18_006-perfil-hidratacion.txt` |

Todo se escribe primero en el scratchpad y Javi lo copia a `evidencia/`.

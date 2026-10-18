# Spec 006 · Perfil del frame de arranque del landing

- **Estado:** Implementada (2026-10-18). Evidencia: `evidencia/2026-10-18_006-perfil-produccion.txt`, `evidencia/2026-10-18_006-perfil-local-prod.txt`, `evidencia/2026-10-18_006-perfil-hidratacion.txt`, `evidencia/2026-10-18_diagnostico_006.txt`
- **Fecha:** 2026-10-18
- **Requiere decision de Javi:** No. Solo se mide desde fuera (un trace de Chromium durante la carga). No cambia `src/`, ni el wordmark, el blend, `GLSurface` o el scroll infinito. Si el trace senala una de esas zonas, el arreglo es otra spec y esa si pedira decision.

## Problema

B6 (`docs/ESTADO.md`, "Defectos abiertos"): "la web se sigue trabando al entrar por primera vez" (Javi, 2026-10-18). La spec 005 ya lo midio en el dominio publico, con 3 repeticiones y la cache vacia (`evidencia/2026-10-18_diagnostico_produccion.txt:190-212`):

- **Frame del arranque:** 917 / 933 / 1117 ms. Es el intervalo entre dos `requestAnimationFrame` que contiene `[entrance] start`. Durante ese tiempo no se pinta nada. Empieza entre 223 y 411 ms despues de la navegacion y termina en el inicio de la entrada (1140 / 1344 / 1463 ms).
- **Long tasks hasta el reposo:** 1071 / 1166 / 1289 ms en total. El hilo principal esta ocupado, no esperando.
- **Despues del arranque:** solo 2-3 frames de mas de 50 ms (maximo 83 ms).

En local (`next dev`, otro tipo de build) ese frame dura 233 ms (`evidencia/2026-10-18_diagnostico_005.txt`, seccion `entrada /`).

Lo que no sabemos es que ocupa ese frame de ~0,9-1,1 s. Por el codigo hay varios candidatos, y ninguno esta medido:

- **Descarga y evaluacion de los chunks de JS.** Las dependencias de cliente son Lenis, ogl, React y react-dom (`package.json:13-17`). GSAP no esta en `dependencies`, aunque `CLAUDE.md` ("Stack") lo da por decidido.
- **Hidratacion de React del arbol del landing.** Se monta desde el layout raiz en todas las rutas (`src/app/layout.tsx:4,46`).
- **Los efectos de montaje.** `GLSurface` crea el contexto WebGL y compila programas (`src/motion/GLSurface.tsx:209-217,305`). La entrada arranca en un layout effect (`src/motion/LandingComposition.tsx:578-584`) que mide el DOM con `getBoundingClientRect` (design spec, Motion inventory #6).
- **Estilo, layout y decodificacion de imagenes** en el mismo frame.

Arreglar B6 sin saber cual de estos pesa es adivinar.

El comentario de `scripts/diagnostico.mjs:357-358` llama "tarea de hidratacion" al frame del arranque. Es una suposicion, no una medida, y esta spec la confirma o la refuta.

## Objetivo

1. Un comando que, para el frame del arranque de `/`, reparte su duracion por categorias:
   - espera de red;
   - parse/compilacion de JS;
   - ejecucion de JS por fichero y funcion;
   - estilo/layout;
   - pintado y GPU;
   - decodificacion de imagen.
   Lo hace contra produccion y contra un build de produccion local, con repeticiones.
2. Con esa salida en `evidencia/`, poder escribir en `docs/ESTADO.md` que hay en ese frame, con cifras, y decidir que arreglar en la siguiente spec.

## Fuera de alcance

- Arreglar B6, o cambiar cualquier cosa de `src/`, de `next.config.ts` o del despliegue en Vercel.
- Los 2-3 frames largos de despues del arranque y el `getBoundingClientRect` por frame del parallax (`src/motion/LandingComposition.tsx:662-670`). Se miran despues, si el frame del arranque no lo explica todo.
- Red lenta emulada, movil e iPad (pasos de `docs/ESTADO.md`; Javi dejo la red lenta fuera en la spec 005).
- Otras rutas distintas de `/`.
- Convertir esto en una invariante con umbral. Sigue siendo informativo.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores): solo se observa
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`): solo se observa
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion
- [x] Otros: un script de medida en `scripts/` y su documentacion en `.claude/commands/`

## Choca con el spec

Nada. No cambia nada visible. Las reglas duras (fotos sin recortar, escala de grises, sin parallax de cursor, `prefers-reduced-motion`) no se tocan.

## Criterios de aceptacion

- `<PROD>` = `https://javisu-photography-portfolio.vercel.app`, el dominio publico de la spec 005.
- `<PERFIL>` = el comando nuevo. Su nombre y si vive dentro de `diagnostico.mjs` se deciden en el plan (ver "Preguntas abiertas").

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `<PERFIL> --url <PROD> --repeticiones 3; echo "exit=$?"` | Por repeticion, una seccion `=== perfil arranque / ===` con la duracion del frame del arranque y el reparto por categoria (red, parse/compilacion, ejecucion JS, estilo/layout, pintado/GPU, decodificacion, otros). En ms y en % del frame. `exit=0` |
| CA2 | Misma salida de CA1 | La suma de las categorias, sin "otros", es al menos el 90 % del frame en cada repeticion. Asi el reparto explica el frame y no deja un hueco sin nombre |
| CA3 | Misma salida de CA1 | Una lista con las 10 entradas de mayor tiempo propio dentro del frame: fichero (chunk) y funcion, o el evento del navegador si no es JS. Cada una en ms. Ninguna fila vacia |
| CA4 | Misma salida de CA1 | El frame del arranque medido sin trace, en la misma ejecucion, junto al medido con trace. Asi se ve cuanto infla el trace. Si la diferencia pasa del 30 %, se dice en la salida |
| CA5 | `<PERFIL> --local-prod --repeticiones 3; echo "exit=$?"` | La misma salida contra `next build` + `next start` en local. Al terminar, `netstat -ano \| grep LISTENING \| grep -c ":31"` da `0`: no deja ningun servidor vivo. `exit=0` |
| CA6 | `node scripts/diagnostico.mjs; echo "exit=$?"` | Sin cambios: `29 de 29`, `lint ok`, `0 errores en 6 rutas`, `exit=0` |
| CA7 | `npx tsc --noEmit` y `npx eslint src --max-warnings=0` | Exit 0 los dos |
| CA8 | `git diff --stat main -- src/ next.config.ts` | Vacio |

## Preguntas abiertas

Resueltas el 2026-10-18 (Javi):
- **1.** Nombres legibles solo en local y sin tocar `next.config.ts`. Next 16.3.2 tiene `next build --no-mangling` ("Disables mangling.", `node_modules/next/dist/bin/next:109`), que se pasa al build (`node_modules/next/dist/cli/next-build.js:51,89`). Descartado `--debug-prerender`: pone `NODE_ENV = 'development'` (`node_modules/next/dist/bin/next:117-119`), asi que mediria otro build.
- **2.** Produccion es `50e3017` segun Javi. Lo que el arranque carga no cambia entre `50e3017` y `main`: `git diff --stat 50e3017 main -- package.json package-lock.json next.config.ts` sale vacio, y en `src/` solo cambia una linea de `src/motion/AlbumsCarousel.tsx`, la de la spec 004, que no esta en `/`. Que Vercel tenga desplegado justo `50e3017`: SIN VERIFICAR, es la palabra de Javi.
- **3, 4 y 5.** Como se propuso: script aparte, el trace crudo en el scratchpad, y 1440x900, dpr 1 y sin limitar la CPU.

1. **Nombres minificados.** El build de produccion de Next no publica source maps de navegador por defecto, y `next.config.ts` no los activa (`next.config.ts:3-7`). La lista de CA3 en produccion saldra con nombres de chunk (`/_next/static/chunks/xxxx.js`) y funciones minificadas.
   - Propuesta: en `--local-prod`, compilar con source maps solo para esa medida, sin tocar `next.config.ts`. Si Next 16.3.2 no deja hacerlo por entorno o CLI, que la lista diga a que paquete pertenece cada chunk (`gsap`, `ogl`, `react-dom`...) leyendo el contenido del chunk.
   - SIN VERIFICAR que Next lo permita.
   - ¿Te vale asi, o prefieres activar `productionBrowserSourceMaps` en `next.config.ts`? Eso publicaria el codigo fuente legible en produccion, y el espejo publico ya lo tiene.
2. **Que commit tiene desplegado produccion.** Sigue SIN VERIFICAR desde la spec 005. Si produccion va por detras de `main`, el perfil de CA1 seria de otro codigo.
   - ¿Puedes mirarlo en el panel de Vercel, o me dejas comprobarlo comparando los chunks de `<PROD>` con los de un `next build` local de `main`?
3. **Script aparte o dentro de `diagnostico.mjs`.**
   - Propuesta: `scripts/perfil-arranque.mjs` aparte. El trace es pesado, solo tiene sentido para `/` y no se quiere en cada `/diagnostico`. Reutilizaria la deteccion del frame del arranque de la spec 005.
4. **Donde va el trace crudo.** Un trace de Chromium de una carga ocupa varios MB.
   - Propuesta: guardarlo en el scratchpad y solo el resumen de texto en `evidencia/`, porque los MB de JSON no son evidencia legible. ¿O lo quieres tambien en el repo?
5. **Mismo viewport y CPU.** Se mide a 1440x900 y dpr 1, sin limitar la CPU, igual que la 005. Asi los numeros son comparables con los de B6 que ya tenemos. Un perfil con la CPU limitada (movil de gama media, `CLAUDE.md` "Polish") seria otra spec.

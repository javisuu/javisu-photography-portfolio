# Plan 005 · Diagnostico contra produccion y tiempos de la entrada

- **Spec:** `spec.md` (aprobada el 2026-10-18)

## Enfoque

Todo el cambio vive en `scripts/diagnostico.mjs`. Hay tres piezas independientes:

**1. `--url <base>`.**
- La URL se valida con `new URL()` (solo `http:`/`https:`) antes de cargar Playwright. Si no vale: mensaje y `exit 2` (CA6).
- Si vale, pasa a ser `BASE` (sin `/` final). Las secciones `tsc`, `eslint` y `next build` imprimen `omitido (--url)`.
- No se ejecuta la comprobacion del puerto, ni `spawn` de `next dev`, ni `waitForServer`. `killDev` no hace nada.
- Las rutas, la consola y las invariantes son las mismas que hoy (`scripts/diagnostico.mjs:127-204`).
- El resumen no cuenta `tsc`/`lint` en remoto, igual que hoy con `--medir` (`scripts/diagnostico.mjs:230-231,237`).

**2. Seccion `=== entrada / ===`, en local y en remoto.**
- Despues del bucle de rutas, se abre un contexto de navegador nuevo, con la cache vacia y 1440x900 a dpr 1, como hoy (`scripts/diagnostico.mjs:111`).
- Con `addInitScript` se instala antes de cualquier script del sitio un muestreador que no toca el sitio:
  - Un bucle `requestAnimationFrame` que en cada frame guarda `performance.now()` y, para cada `.landing-photo-entrance`, su `style.opacity` y su `style.transform` inline. Solo lee estilos inline, sin `getComputedStyle` ni layout, para no provocar el jank que mide.
  - Un `PerformanceObserver` de `longtask`.
  - Un envoltorio de `console.log` que apunta el instante de cada `[entrance] start` (`src/motion/LandingComposition.tsx:429`) y despues llama al original.
- El muestreo para cuando todas las fotos estan a `opacity: 1` sin `transform` de entrada durante 500 ms, o a los 15 s.
- En Node se calcula, desde el inicio de la navegacion:
  - participantes: envoltorios que empiezan a opacidad < 1;
  - para cada uno, el ms en que entra al monton (primera opacidad > 0 con `translate(...)`);
  - inicio de la fase B: el primer frame en que cambia el `transform` de una foto ya unida;
  - rezagadas: las que se unen despues del inicio de la fase B;
  - reposo: el ms en que todas quedan en `opacity: 1` sin `transform`;
  - frames de mas de 50 ms y frame mas largo, entre el `[entrance] start` y el reposo;
  - numero de long tasks y numero de `[entrance] start`.

  Es informativo y no una invariante: todavia no hay umbral decidido, y asi el recuento sigue en 29 (CA4).

**3. `--repeticiones N`** (pregunta abierta 2).
- Repite solo la seccion de la entrada, N veces, con un contexto nuevo en cada una.
- Da el valor de cada repeticion y la mediana y el maximo de los tiempos y de los frames de mas de 50 ms.
- Por defecto 1. La recomendacion para produccion es 3.

**4. `next dev` duplicado** (pregunta abierta 4, resuelta).
- `dev.once("exit")` en carrera con `waitForServer`. Si el hijo sale antes de responder, el harness imprime el final de `devLog` (que trae el mensaje de Next, con PID y URL del otro servidor) y sale con `exit 2`, sin esperar el resto de los 90 s (CA5).
- Se descarto mirar el lockfile en `.next/dev/`: depende de la ruta interna de Next y en Windows el fichero puede quedarse en disco aunque este desbloqueado. La salida del proceso es la senal que da el propio Next.

Lo que queda abierto sin bloquear el plan:
- **Pregunta 3, red lenta emulada:** fuera de alcance, salvo que Javi diga lo contrario.
- **Pregunta 5, ruido de terceros en Vercel:** se decide al ver la primera salida de CA1. Si sale una peticion de terceros, se para y se pregunta antes de anadirla a `IGNORE`.
- **Pregunta 1, la URL:** hace falta para CA1, CA2 y CA3, no para implementar.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/diagnostico.mjs` | modificar | Argumentos `--url` y `--repeticiones`, validacion de la URL, rama remota sin estatico ni servidor, muestreador y seccion `entrada /`, linea de entrada en el resumen, `dev.once("exit")` |
| `.claude/commands/diagnostico.md` | modificar | Una linea con la opcion `--url <base>` y `--repeticiones N` |
| `evidencia/2026-10-18_005-diagnostico-produccion.txt` | crear (lo copia Javi: `evidencia/` esta protegida, `.claude/settings.json:26-27`) | Salida de CA1 a CA8 |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| El muestreador anade jank y ensucia lo que mide | Baja: lee 30 estilos inline por frame, sin layout | Alto: falsearia B6 | Comparar en local los frames de mas de 50 ms con y sin muestreador. Si la diferencia no es despreciable, se dice en la evidencia |
| La heuristica de fases falla (por ejemplo, la fase B no cambia el `transform` en el primer frame) | Media | Medio: cifras de fase erroneas | Las reglas salen del codigo (`src/motion/LandingComposition.tsx:693-735`). Se validan primero en local, donde tiene que salir 0 rezagadas y la fase B cerca de 350 ms (`PILE_MIN_DWELL_MS`) |
| Vercel protege la URL (Deployment Protection) o la sirve con 401 a Playwright | Desconocida | Alto: CA1 no corre | La primera ejecucion lo dira (`[http 401]`). Si pasa, se para y se pregunta a Javi |
| Peticiones de terceros en produccion cuentan como errores | Media | Bajo | Pregunta abierta 5: parar y preguntar, no anadirlas a `IGNORE` sin decision |
| `dev.once("exit")` se dispara al final por el propio `killDev` y confunde la salida | Media | Bajo | El listener solo actua mientras `waitForServer` no ha terminado |
| Romper el modo local | Baja | Alto | CA4: diagnostico local completo, 29 de 29 |

## Vuelta atras

- **Rama:** `feat/005-diagnostico-produccion`
- **Como se revierte:** `git revert` del commit, o no fusionar la rama. El sitio no cambia (CA8).
- **Que invariante avisaria de que esto ha roto algo:** las 29 de siempre en el diagnostico local (CA4). Si alguna falla despues del cambio, es el harness y no el sitio, porque `src/` no se toca.

## Verificacion

| Comprobacion | Criterios |
|---|---|
| `node scripts/diagnostico.mjs --url <PROD> --repeticiones 3` | CA1, CA3 |
| `netstat` antes y durante la ejecucion anterior | CA2 |
| `node scripts/diagnostico.mjs` local completo | CA4 (y referencia local de la entrada) |
| `time node scripts/diagnostico.mjs --skip-build` con `next dev -p 3101` abierto | CA5 |
| `node scripts/diagnostico.mjs --url no-es-una-url` | CA6 |
| `npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `git diff --stat main -- src/` | CA7, CA8 |

Todo se guarda en `evidencia/2026-10-18_005-diagnostico-produccion.txt`.

# Plan 003 · Fijar el runner y las acciones del workflow del espejo

- **Spec:** `spec.md` (aprobada el 2026-10-18)

## Enfoque

Se cambian dos lineas de `.github/workflows/mirror.yml`: `runs-on: ubuntu-latest` pasa a `ubuntu-24.04` (linea 19) y `actions/checkout@v4` pasa a `@v5` (linea 21). Se anade un comentario de una linea que explica por que el runner esta fijo, para que nadie lo devuelva a `latest` sin saberlo. Primero se verifica en local todo lo que no necesita GitHub (CA1 a CA4 y CA8). Despues se fusiona en `main` y Javi hace el push, y con eso se verifica lo que si lo necesita (CA5 a CA7). Se descarto lanzar la Action desde la rama antes de fusionar: el workflow publica siempre `main` (`.github/workflows/mirror.yml:23`) y `workflow_dispatch` usa el fichero de la rama que se elija, asi que una prueba desde la rama publicaria el `main` actual con el workflow nuevo. Eso es valido, pero no prueba nada que no pruebe el push.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `.github/workflows/mirror.yml` | modificar | `runs-on`, `uses` y un comentario |
| `specs/003-fijar-runner-mirror/*` | crear | spec, plan y tareas |
| `evidencia/2026-10-18_003-checkout-runtimes.txt` | crear (ya creado) | runtime de `checkout` por version |
| `evidencia/2026-10-18_003-fijar-runner-mirror.txt` | crear | salida de CA1 a CA4 y CA8 |
| `docs/ROADMAP.md` | modificar (al cierre) | deuda: `ubuntu-24.04` se retirara algun dia (pregunta 4 de la spec) |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| `checkout@v5` se comporta distinto con `fetch-depth: 0` + `ref: main` y el filtrado sale con otro hash | Baja | El push fast-forward se rechaza y el espejo se queda parado. No se publica nada mal | CA5 compara el hash con un filtrado local. Si falla, se revierte el commit y se mira la diferencia |
| `ubuntu-24.04` no tiene el mismo Python que la imagen actual | Muy baja: `ubuntu-latest` es hoy 24.04, segun la anotacion que vio Javi (SIN VERIFICAR, sin captura) | Falla `pip install` y la Action sale en rojo | CA6: el paso "Set up job" muestra la imagen. Si falla, se revierte |
| El push a `main` se hace despues del 2026-10-19 y la ejecucion intermedia corre en Ubuntu 26 | Media si se retrasa | El workflow actual podria fallar en esa ejecucion | Se hace el push hoy. Si alguna ejecucion falla antes, la siguiente (ya con el workflow nuevo) la arregla, porque el filtrado es determinista |

## Vuelta atras

- **Rama:** `feat/003-fijar-runner-mirror`, desde `0029941`
- **Como se revierte:** `git revert <commit>` en `main` y push. Nunca `--force`
- **Que invariante avisaria de que esto ha roto algo:** ninguna del diagnostico, porque el sitio no cambia. Avisarian la Action en rojo (comprobacion de imagenes o push rechazado, `.github/workflows/mirror.yml:36-57`) y CA5 (hash distinto)

## Verificacion

- En local: CA1, CA2, CA3, CA4 y CA8, con la salida en `evidencia/2026-10-18_003-fijar-runner-mirror.txt`.
- Tras el push de Javi: CA5 (ls-remote frente al filtrado local, con la salida en el mismo fichero), CA6 (lo mira Javi en la pestana Actions y lo cuenta, porque no hay `gh`) y CA7 (clon del espejo, con la salida en el mismo fichero).

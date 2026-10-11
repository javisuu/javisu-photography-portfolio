# Plan 001 · Diagnostico: corregir la medicion

- **Spec:** `spec.md` (aprobada el 2026-10-11)
- **Estado:** Borrador, pendiente de aprobacion de Javi

## Enfoque

Son cuatro cambios acotados dentro del `page.evaluate` y de los listeners de `scripts/diagnostico.mjs`, mas un cambio de etiqueta en `/albums`:

1. **Wordmark.** Se busca el `<h1>` dentro del `<main>` visible (no el primero del documento). Se clona, se le quitan los nodos `[aria-hidden="true"]` y se lee `textContent.trim()`. Descartado usar `innerText` con el pie oculto por CSS, porque depende de la opacidad, que es justo lo que confunde a `innerText`. Descartado tambien comparar con el `aria-label`, porque no detectaria letras visibles mal colocadas.
2. **`<main>`.** El invariante no cambia. `src/app/albums/page.tsx:21` y su cierre pasan de `div` a `main`.
3. **Canvas.** Se mide el canvas del `<main>` visible en todas las rutas que lo tengan, no solo en `/atlas`. El esperado sale de la propia caja del canvas: si su `position` computada es `fixed`, `innerWidth x innerHeight x dpr`; si no, `clientWidth x clientHeight x dpr`. El `dpr` se toma como lo usa cada renderer: GLSurface lo limita a 2 (`src/motion/GLSurface.tsx:219`) y el atlas no (`src/motion/Atlas.tsx:505`). El harness corre a `deviceScaleFactor: 1` (`diagnostico.mjs:92`), asi que hoy la diferencia no se nota. Se documenta en un comentario.
4. **URLs.** El listener de consola anade `m.location().url` al texto. Un listener nuevo, `page.on("response")`, registra `[http <status>] <url>` cuando el status es >= 400 y la URL no es ruido (`IGNORE`). Esos registros cuentan como errores de la ruta.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/diagnostico.mjs` | modificar | `:94` (URL en consola), listener nuevo de `response`, `:145-146` (h1 del main visible y sin `aria-hidden`), `:153-158` (esperado segun `position`) y `:175-178` (invariante en toda ruta con canvas) |
| `src/app/albums/page.tsx` | modificar | `:21` y su cierre: `div` pasa a `main`, mismas clases |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| El listener `response` cuenta dos veces un 403 que tambien sale en consola | Alta | Bajo: el recuento de errores sube | Se acepta. Son dos senales distintas, y la de red es la que trae la URL. Si molesta, se deduplica por URL en la tarea correspondiente |
| El invariante de canvas da fallo nuevo en `/` y `/album/<slug>` (buffer 300x150) | Alta | Ninguno: es un defecto real que `/verificar` ya senalo | Es lo que se busca. Va a ESTADO.md como defecto abierto |
| `<main>` en `/albums` cambia el layout | Muy baja | Medio | Sin selectores `main` en CSS ni JS. CA8 (sin scroll horizontal) y comparar una captura antes y despues |
| El `<h1>` del landing no esta dentro de su `<main>` | Baja | El wordmark dejaria de medirse | `LandingComposition.tsx:785` abre el `<main>` y `:1023` lo cierra, y el `<h1>` esta en `:993`. Se comprueba en T1 |

## Vuelta atras

- **Rama:** `feat/001-diagnostico-corregir-medicion`, creada desde la rama actual (`feat/landing-gl-surface`), que tiene 13 ficheros sin commit. *Pendiente: decidir con Javi si antes se hace commit de esos cambios.*
- **Como se revierte:** `git revert` del commit de la spec. Son dos ficheros.
- **Que invariante avisaria de que esto ha roto algo:** `sin scroll horizontal` y `un solo <main> visible` en `/albums`. Para el script, CA5: si los dos fallos reales dejan de salir, la medicion se ha quedado ciega.

## Verificacion

- CA1 a CA5: un solo run completo, `node scripts/diagnostico.mjs --skip-build`, guardado en `evidencia/<fecha>_001-diagnostico-corregir-medicion.txt`.
- CA6 y CA8: runs con `--medir`, anadidos al mismo fichero.
- CA7: `git diff --stat -- src/`, anadido al mismo fichero.

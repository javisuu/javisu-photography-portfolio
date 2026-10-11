# Spec 001 · Diagnostico: corregir la medicion

- **Estado:** Implementada (2026-10-11). Falta que Javi acepte la reformulacion de CA5 y CA6, ver "Resultado de la verificacion"
- **Fecha:** 2026-10-11
- **Requiere decision de Javi:** No. No se toca ninguna de las cuatro zonas sensibles. El invariante del wordmark y el del canvas de GLSurface vigilan dos de ellas, pero lo que cambia es como se miden, no el codigo vigilado. Javi lo reviso al aprobar.

## Decisiones de Javi (2026-10-11)

> "Cualquier cambio que mejore la arquitectura o rendimiento es bienvenido. Es importante hacer que no afecte en si a la pagina (el cambio de etiquetas html no suele afectar). Acepto"

Asi se aplican a las preguntas abiertas del borrador:

1. **`<main>` en `/albums`:** el invariante sigue siendo "exactamente un `<main>` visible", y se anade `<main>` a `/albums` en esta misma spec. Es un cambio de etiqueta sin efecto visual (ver "Zonas afectadas").
2. **Canvas de GLSurface:** pasa a ser invariante en todas las rutas que tienen canvas, con el esperado correcto. Es una mejora de la medicion, y el buffer de 300x150 de hoy saldra como fallo real donde lo sea.
3. **Texto del wordmark:** se lee el texto del `<h1>` del `<main>` visible, sin los nodos `aria-hidden="true"`.
4. **Registro de los 403:** se escuchan las respuestas HTTP con status >= 400 y se registra su URL. Ademas, cada error de consola lleva su URL de origen.

## Problema

El primer diagnostico (`evidencia/2026-10-11_diagnostico.txt`) dio 17 de 27 invariantes. Al verificarlo con `/verificar` en esta misma sesion salio que 3 fallos son artefactos del propio script, y que un cuarto no se puede juzgar porque el script no guarda el dato necesario:

1. **Wordmark.** `scripts/diagnostico.mjs:146` lee `h1.innerText`, y ese texto incluye el pie de hover "JAVIER SUAREZ SUQUIA". El pie esta dentro del `<h1>` (`src/motion/LandingComposition.tsx:993-1004`, `src/motion/DecipherWordmark.tsx:397`), lleva `aria-hidden="true"` (`DecipherWordmark.tsx:398`) y se oculta solo con opacidad (`:405`). En reposo el wordmark ya dice `"SUQUIA"` (`DecipherWordmark.tsx:388`). Ademas, `querySelector("h1")` (`diagnostico.mjs:145`) coge el primer `<h1>` del documento, que fuera de `/` es el del landing oculto (`src/app/layout.tsx:42-43`).
2. **`<main>` visible.** El invariante (`diagnostico.mjs:123`, `:168`) exige exactamente un `<main>` visible, pero `/albums` no renderiza ninguno (`src/app/albums/page.tsx:21` es un `<div>`). El unico `<main>` presente es el del landing, oculto (`LandingComposition.tsx:785`). Esto es un defecto real de accesibilidad (la pagina no tiene landmark), no un arbol de pagina filtrado.
3. **Esperado del canvas.** `diagnostico.mjs:157` calcula el esperado a partir de `cv.parentElement`, el `<main>` entero con su scroll (1440x3780 en `/`, 1440x9252 en `/album/america`). Pero GLSurface es un canvas fijo al viewport (`src/motion/GLSurface.tsx:232-234`, `:461` `fixed inset-0`). Hoy el invariante solo se evalua en `/atlas` (`diagnostico.mjs:175`).
4. **403 sin URL.** `diagnostico.mjs:94` guarda solo `m.text()`, asi que no se sabe que recurso dio 403.

Los dos fallos que `/verificar` confirmo como reales (15 de 30 `landing-photo` a `opacity < 1`, y el buffer del atlas a 300x150 con caja 1440x609) tienen que seguir detectandose.

## Objetivo

Que cada FALLO que imprima `scripts/diagnostico.mjs` sea un defecto real del sitio, que cada error de consola o de red diga su URL, y que `/albums` tenga su `<main>`. Todo ello sin cambiar nada visible en la pagina.

## Fuera de alcance

- Arreglar los defectos reales: la entrada del landing que no arranca, el buffer del atlas (B3), `setSize` de GLSurface sin ejecutar, los 403 en si y el aviso de lint B1. Cada uno lleva su propia spec.
- Cualquier cambio en `src/` que no sea la etiqueta del contenedor de `/albums`.
- Invariantes que no salgan de estos cuatro puntos.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`): no se toca
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [x] Herramientas: `scripts/diagnostico.mjs`
- [x] `src/app/albums/page.tsx:21`: el contenedor raiz pasa de `<div>` a `<main>` con las mismas clases. `src/app/globals.css` no tiene ningun selector `main` (grep: 0 resultados), y en `src/` nada busca `main` por selector. Tailwind preflight da `display: block` tanto a `div` como a `main`, asi que el render es el mismo.

## Choca con el spec

Nada. Revisado contra las reglas duras de `CLAUDE.md` y contra `docs/design-spec-v2.md`.

## Criterios de aceptacion

Se comprueban sobre el arbol con esta spec aplicada y sin ningun otro arreglo. `<fecha>` es la salida de `date +%F`.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs --skip-build > evidencia/<fecha>_001-diagnostico-corregir-medicion.txt; grep "wordmark dice SUQUIA" evidencia/<fecha>_001-diagnostico-corregir-medicion.txt` | `ok   wordmark dice SUQUIA` |
| CA2 | `grep -c "ok   un solo <main> visible" evidencia/<fecha>_001-diagnostico-corregir-medicion.txt` | `6` (todas las rutas, `/albums` incluida) |
| CA3 | `grep -E "Failed to load resource\|\[http " evidencia/<fecha>_001-diagnostico-corregir-medicion.txt` | Cada linea incluye una URL (`http://...`) |
| CA4 | `grep -A3 '"expected"' evidencia/<fecha>_001-diagnostico-corregir-medicion.txt` | En `/` y `/album/<slug>`: `[1440, 900]`. En `/atlas`: `[1440, 609]` |
| CA5 | `grep "^- " evidencia/<fecha>_001-diagnostico-corregir-medicion.txt` | Siguen saliendo `/ · ninguna landing-photo invisible en reposo` y `/atlas · buffer del canvas = caja * dpr`. No salen ni `wordmark dice SUQUIA` ni `un solo <main> visible` |
| CA6 | `node scripts/diagnostico.mjs --medir /atlas; echo $?` | Imprime el FALLO del buffer del atlas, sale con codigo 1 y no se cae |
| CA7 | `git diff --stat -- src/` | Solo cambia `src/app/albums/page.tsx`, con 2 lineas (apertura y cierre de la etiqueta) |
| CA8 | `node scripts/diagnostico.mjs --medir /albums` | `ok   sin scroll horizontal`, sin errores de consola nuevos frente a `evidencia/2026-10-11_diagnostico.txt` (aparte de los 403) |

## Resultado de la verificacion (2026-10-11)

Evidencia: `evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt`. Run completo: **29 de 29 invariantes y 0 errores de consola en 6 rutas.**

| # | Resultado |
|---|---|
| CA1 | Cumple: `ok   wordmark dice SUQUIA` |
| CA2 | Cumple: 6 de 6 `ok   un solo <main> visible` |
| CA3 | Cumple: ya no queda ningun 403 que registrar (ver T7). El listener `response` y la URL en consola quedan activos |
| CA4 | Cumple: esperado `[1440,900]` en `/` y `/album/america`, `[1440,609]` en `/atlas`. Buffers medidos: `[1440,900]`, `[1440,900]`, `[1440,609]` |
| CA5 | **Premisa refutada.** Se esperaba que siguieran saliendo "landing-photo invisible" y "buffer del atlas" como fallos reales. No eran reales: los dos (y el buffer de GLSurface) se debian a que el cliente no se hidrataba, porque next dev respondia 403 a los chunks JS pedidos desde `127.0.0.1` (T7). Con `localhost`, `landingHidden: 0` y el buffer del atlas es `[1440,609]` |
| CA6 | **Premisa refutada**, por lo mismo: `--medir /atlas` da 5 de 5 y sale con 0 |
| CA7 | Cumple: `src/app/albums/page.tsx | 4 ++--` (2 lineas cambiadas) |
| CA8 | Cumple: `/albums` ok en consola, `<main>`, scroll horizontal y blend |

Lo que CA5 queria garantizar (que la medicion no se quede ciega) **sigue sin demostrarse** en positivo: hoy no queda ningun fallo real con el que probarlo. Se queda como pregunta abierta.

## Preguntas abiertas

- T1 confirmo que `"SUQUIA"` no tiene ningun ancestro `aria-hidden` (`DecipherWordmark.tsx:345-350`).
- **Prueba negativa de los invariantes.** Para demostrar que detectan un fallo real habria que provocar uno a proposito (por ejemplo, un `--autotest` que inyecte `opacity:0` en una `.landing-photo` o reduzca el canvas antes de medir). Es una spec aparte, si Javi la quiere.

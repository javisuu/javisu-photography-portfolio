# Spec 002 · Proteger las fotografias: repo privado y espejo publico

- **Estado:** Aprobada (Javi, 2026-10-15)
- **Fecha:** 2026-10-15
- **Requiere decision de Javi:** Si. Hay acciones en GitHub que solo puede hacer el (cambiar la visibilidad, renombrar, crear el repo espejo, la deploy key), y quedan las preguntas abiertas 1 y 2. No toca ninguna de las cuatro zonas sensibles del sitio.

## Decisiones de Javi (2026-10-15)

- Su filosofia es que el **codigo sea publico**, pero las **fotografias no** se regalan, y sin marcas de agua.
- El repo `github.com/javisuu/javisu-photography-portfolio` **es publico desde siempre** (lo dice Javi).
- Prefiere un **historial nuevo y limpio** a reescribir el actual.
- Enfoque elegido: este repo pasa a privado y sigue siendo la fuente de verdad, de donde despliega Vercel. Un **repo espejo publico** recibe el codigo con un historial sin fotos.
- El copyright de los metadatos es de **2026, fijo**.
- `docs/referencias/` (muestras de estilo con fotos suyas) **no va al repo publico**. Se queda en el privado.

## Problema

- **Hay fotos en un repo publico.** Los 31 AVIF de `public/photos/` estan en git (`git ls-files public/photos | wc -l` da `31`; 5,7 MB segun `du -sh public/photos`). Pesan hasta 2500 px de lado largo (`scripts/prepare-images.mjs:25`) y se descargan de golpe desde GitHub.
- **Hay mas fotos en el historial.** `git log --all --name-only` muestra dos imagenes fuera de `public/photos/`:
  - `docs/referencias/2026-10-11_notas-laterales.png`, una captura de referencia que **contiene fotos de Javi**;
  - `public/atlas/land-mask.png`, una mascara de Natural Earth, de dominio publico, que puede quedarse.
- **No hay licencia.** No existe ningun `LICENSE`. La unica declaracion es una linea de `/credits` (`src/app/credits/page.tsx:43-44`).
- **Las fotos no llevan autoria.** El pipeline (`scripts/prepare-images.mjs:101-113`) no escribe Artist ni Copyright.
- **Nada frena a los crawlers de IA.** No hay `robots.txt` (ni en `public/` ni en `src/app/robots.ts`), y `metadata` (`src/app/layout.tsx:15-27`) no dice nada sobre IA.

Lo que **no** se puede arreglar: quien haya clonado el repo o hecho un fork mientras era publico conserva las fotos. Esta spec reduce la exposicion de aqui en adelante.

## Objetivo

1. **Repo publico sin fotos.** El codigo esta en un repo publico cuyo historial, completo, no contiene ninguna fotografia de Javi, y que se actualiza solo con cada push a `main` del privado.
2. **Autoria explicita.** El codigo y las fotos tienen licencias distintas y explicitas, cada foto lleva su autoria en sus propios metadatos, y los crawlers de IA que respetan las senales quedan excluidos.
3. **La web no cambia.** Vercel sigue desplegando desde el repo privado, y las fotos se sirven igual que hoy.

## Fuera de alcance

- Sacar las fotos a un almacenamiento externo (Vercel Blob o R2). Se descarto al elegir el espejo.
- Bajar la resolucion, poner marcas de agua o bloquear el clic derecho.
- Reescribir el historial de **este** repo. Se queda como esta, pero privado.
- Cambiar el comportamiento visible del sitio.

## Zonas afectadas

- [ ] Landing, wordmark, carrusel, pagina de album, atlas, renderizador GL: no se tocan
- [ ] Datos (`src/data/photos.ts`): **no deberia cambiar** (CA6)
- [x] `LICENSE` (nuevo): MIT para el codigo y "All rights reserved" para las fotografias
- [x] `scripts/prepare-images.mjs`: escribe Artist y Copyright en cada AVIF, y se regeneran los 31 con los mismos pixeles
- [x] `src/app/robots.ts` (nuevo) y `metadata` de `src/app/layout.tsx`: exclusion de IA
- [x] `.github/workflows/mirror.yml` (nuevo; hoy no existe `.github/`): la Action que filtra y empuja al espejo
- [x] `README` del espejo: explica que faltan las fotos y por que, y como ejecutar el sitio con imagenes de prueba
- [x] **GitHub, a mano (Javi):** comprobar los forks, pasar este repo a privado y renombrarlo, crear el espejo publico vacio y crear la deploy key con su secret
- [x] **Vercel (Javi):** comprobar que el proyecto sigue desplegando tras el renombrado
- [ ] `/credits`: no cambia. Su enlace a `github.com/javisuu/javisu-photography-portfolio` (`src/app/credits/page.tsx:15`) pasa a apuntar al espejo si este hereda el nombre original (pregunta abierta 1)

## Choca con el spec

Nada. No cambia ninguna regla dura de `CLAUDE.md` ni el comportamiento visible.

## Criterios de aceptacion

**En local, antes de tocar GitHub:**

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `git clone --no-local . /tmp/espejo && cd /tmp/espejo && git filter-repo --path public/photos --path docs/referencias --invert-paths && git log --all --name-only --pretty=format: \| grep -ciE '\.(avif\|webp\|jpe?g\|png\|tiff?)$'` | `1`: solo queda `public/atlas/land-mask.png` |
| CA2 | El filtrado de CA1 ejecutado dos veces sobre el mismo commit de origen, y despues `git rev-parse HEAD` en cada resultado | El mismo hash las dos veces. Si el filtrado es determinista, el espejo se actualiza con un push normal, sin `--force` |
| CA3 | `head -20 LICENSE` | Dos ambitos: el codigo con licencia MIT, y `public/photos/**` y las fotografias con "All rights reserved, © 2026 Javier Suquia" |
| CA4 | `node --input-type=module -e "import sharp from 'sharp';import fs from 'fs';let ok=0,n=0;for(const d of fs.readdirSync('public/photos'))for(const f of fs.readdirSync('public/photos/'+d)){n++;const m=await sharp('public/photos/'+d+'/'+f).metadata();if(X)ok++}console.log(ok+'/'+n)"` | `31/31`. EXIF con `Javier Suarez Suquia` (es ASCII y se translitera) y XMP con `Javier Suárez Suquía` (nombre corregido por Javi el 2026-10-15) |
| CA5 | `curl -s http://localhost:3100/robots.txt` con `next dev` en marcha | `Disallow: /` para al menos `GPTBot`, `ClaudeBot`, `anthropic-ai`, `CCBot`, `Google-Extended`, `Bytespider` y `PerplexityBot`, y `*` permitido |
| CA6 | `git diff --stat -- src/data/photos.ts` despues de regenerar las fotos | Sin cambios |
| CA7 | `curl -s http://localhost:3100/ \| grep -o '<meta name="robots"[^>]*>'` | El contenido incluye `noai` y `noimageai` |
| CA8 | `node scripts/diagnostico.mjs` | Verde: 29 de 29 o mas y 0 errores de consola |

**En GitHub, despues de las acciones de Javi:**

| # | Comando | Resultado esperado |
|---|---|---|
| CA9 | Push a `main` del repo privado, y despues `git ls-remote <url del espejo> main` | El hash coincide con el filtrado local de ese mismo commit |
| CA10 | `git clone <url del espejo> /tmp/check && git -C /tmp/check log --all --name-only --pretty=format: \| grep -ciE '\.(avif\|webp\|jpe?g\|png\|tiff?)$'` | `1` (`land-mask.png`) |
| CA11 | Abrir el despliegue de produccion de Vercel tras el renombrado | La web carga con fotos. Lo confirma Javi a ojo, o `/diagnostico` contra la URL de produccion si se anade esa opcion |
| CA12 | Abrir `https://github.com/javisuu/<nombre original>` sin sesion iniciada | Muestra el espejo publico y no el repo privado |

## Preguntas abiertas

1. **Nombres de los repos.** *Aceptado por Javi el 2026-10-15.* Se propone que el privado pase a llamarse `javisu-photography-portfolio-private` y que el espejo herede `javisu-photography-portfolio`. Asi el enlace de `/credits` sigue valiendo sin tocar `/credits`, que esta dada por cerrada.
2. **Ramas en el espejo.** *Aceptado por Javi el 2026-10-15.* Se propone que el espejo reciba **solo `main`**: las ramas `feat/*` no se publican. Hoy `main` (`9bf0416`) va muy por detras de esta rama (`f53fa35`). Antes de activar el espejo hay que fusionar el trabajo en `main`, o el espejo nacera desfasado.
3. ~~SIN VERIFICAR que `sharp` escriba EXIF dentro de un AVIF.~~ **Verificado el 2026-10-15** con una prueba en el scratchpad sobre un original de `photos-master/SOL/`. `withExif` + `withXmp` en sharp 0.35.4 deja 210 bytes de EXIF y 240 de XMP, leidos de vuelta con `sharp().metadata()`, sin etiqueta de orientacion y con el mismo tamano en pixeles. Matiz: `exifr` no lee AVIF ("Unknown file format"), asi que CA4 se comprueba con `sharp().metadata()` y no con `exifr`.
4. **`git filter-repo` no esta instalado** (`git: 'filter-repo' is not a git command`, 2026-10-15). Hay Python 3.12, asi que se instala con `pip install git-filter-repo`. En la Action se instala en el propio workflow.
5. **Forks del repo actual.** Al pasar a privado, los forks publicos se independizan y siguen existiendo con las fotos. Javi lo comprueba en GitHub (Insights → Forks) antes de cambiar la visibilidad.

## Orden de ejecucion previsto (detalle en `plan.md`)

1. Lo local, en una rama: licencia, metadatos, `robots.txt`, el workflow y el README del espejo. Verificacion CA1 a CA8.
2. Fusionar en `main`.
3. Javi: comprueba los forks, pasa este repo a privado y lo renombra, crea el espejo vacio y crea la deploy key y el secret.
4. Primer push a `main` → la Action llena el espejo. Verificacion CA9 a CA12.

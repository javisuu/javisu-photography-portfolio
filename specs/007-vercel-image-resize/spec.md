# Spec 007 · Que /_next/image sirva imagenes redimensionadas en Vercel

- **Estado:** Implementada el 2026-10-18. Aprobada ese mismo dia, con la enmienda 1. CA1 a CA9 verificados (ver `tasks.md`, T8)
- **Fecha:** 2026-10-18
- **Requiere decision de Javi:** No para la spec. No toca el wordmark, el blend, el ciclo de vida de `GLSurface` ni el scroll infinito. Javi si tiene que intervenir en dos puntos fuera del repo: el push que despliega el cambio y, si el arreglo esta en la configuracion del proyecto, el panel de Vercel (ver "Preguntas abiertas")

## Problema

B6: en produccion, la entrada del landing va a tirones la primera vez que se carga (`docs/ESTADO.md`, tabla de defectos). La spec 006 encontro la causa:

- El frame que contiene `[entrance] start` dura 817 ms de mediana en el dominio publico. La decodificacion de imagenes se lleva el 62 %: 382 ms con trace, 22 AVIF decodificados en el hilo principal (`evidencia/2026-10-18_006-perfil-produccion.txt:86-96`, `evidencia/2026-10-18_006-perfil-hidratacion.txt:22`).
- En local, con `next start`, las mismas 22 decodificaciones son WebP y cuestan 25 ms (`evidencia/2026-10-18_006-perfil-hidratacion.txt:23`).
- La diferencia esta en lo que devuelve `/_next/image`. En Vercel devuelve el AVIF original de 2500x1875 y 250 846 bytes, identico byte a byte a `public/photos/america/01.avif`, pida el ancho que pida (`evidencia/2026-10-18_006-perfil-hidratacion.txt:25-31`).

Medido hoy de nuevo (`evidencia/2026-10-18_007-linea-base.txt`): para `w` = 256, 640 y 1080, y para `Accept` = `image/avif,image/webp,*/*`, `image/webp,*/*` y `*/*`, produccion responde siempre `Content-Type: image/avif`, `Content-Length: 250846` y **`X-Matched-Path: /photos/america/01.avif`**. Responde AVIF incluso a un cliente que solo acepta WebP, y la cabecera indica que la peticion se resolvio contra el fichero estatico. Todo apunta a que el optimizador de imagenes de Vercel no llega a ejecutarse para estas URLs. **Por que: SIN VERIFICAR.** Es lo que tiene que averiguar el plan.

Contexto del codigo:
- Todas las fotos se pintan con `next/image` (`src/motion/LandingComposition.tsx:851-870`, `src/motion/AlbumPhotos.tsx:72-87`, `src/motion/AlbumsCarousel.tsx:698`, `src/motion/Atlas.tsx:866,919`, `src/app/album/[slug]/page.tsx:78`) con `src` de texto bajo `/photos/...` (`src/data/photos.ts:49`), no con import estatico.
- `next.config.ts` no tiene bloque `images`: solo `agentRules: false` (`next.config.ts:3-7`). Ningun `<Image>` de `src/` lleva `unoptimized` (grep sin resultados).
- `next` es la 16.3.2 (`package.json:14`).
- Los AVIF de origen salen de `scripts/prepare-images.mjs:31,139`: lado largo de 2500 px y `quality: 62`.

## Objetivo

Que `/_next/image` en el dominio publico devuelva una imagen del ancho pedido, en un formato que el navegador acepte, y que el frame del arranque del landing en produccion deje de estar dominado por la decodificacion. El resultado se mide con los mismos comandos que en la spec 006.

## Fuera de alcance

- `src/motion/GLSurface.tsx`, ni su ciclo de vida ni su forma de decodificar (`createImageBitmap` sobre `<img>`, `src/motion/GLSurface.tsx:289,295`). Si esta spec no basta, eso va en otra spec (paso 2 de `docs/ESTADO.md`), con decision de Javi.
- La coreografia de la entrada, la parallax y los `sizes` de cada `<Image>`.
- Regenerar o recomprimir los AVIF de `public/photos/`. Los pixeles y los metadatos de autoria de la spec 002 se quedan como estan.
- Corregir `CLAUDE.md` (paso 3 de `docs/ESTADO.md`).
- B2, B4 y B5.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores): solo cambia lo que recibe; no se edita
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion
- [x] Configuracion: `next.config.ts` y/o la configuracion del proyecto en Vercel. Esta zona no esta en la plantilla

Todas las rutas con fotos reciben otras variantes de imagen (`/`, `/albums`, `/album/[slug]`, `/atlas`), pero no cambia ningun componente.

## Choca con el spec

Nada.
- Las fotos siguen sin recortar: redimensionar en `/_next/image` conserva la proporcion, y el `width`/`height` de cada `<Image>` sale de `photos.ts` y no cambia.
- Siguen en color, y la UI no cambia.
- No se toca ningun movimiento ni `prefers-reduced-motion`.
- "LCP < 2,5 s" (`docs/design-spec-v2.md:101`) va a favor.

## Criterios de aceptacion

`<PROD>` = `https://javisu-photography-portfolio.vercel.app`. `<IMG>` = `<PROD>/_next/image?url=%2Fphotos%2Famerica%2F01.avif`. CA1 a CA4 necesitan que el cambio este desplegado. Si Javi no hace push, se marcan SIN VERIFICAR y la spec se cierra con CA5 a CA8.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `curl -s -D - -o x.img -H "Accept: image/avif,image/webp,*/*" "<IMG>&w=640&q=75"` y despues `node -e "require('sharp')('x.img').metadata().then(m=>console.log(m.format,m.width,m.height))"` | `X-Matched-Path` distinto de `/photos/america/01.avif`; ancho de 640 (o menor); alto proporcional, de 480 para 2500x1875; `Content-Length` por debajo de 250846 |
| CA2 | Igual que CA1 con `w=256` y con `w=1080` | Ancho de 256 y de 1080 (o menor); los dos con un `Content-Length` distinto entre si |
| CA3 | `curl -s -o /dev/null -D - -H "Accept: image/webp,*/*" "<IMG>&w=640&q=75"` | `Content-Type: image/webp`: el optimizador negocia el formato |
| CA4 | `node scripts/perfil-arranque.mjs --url <PROD> --repeticiones 3` | Mediana de `decodificacion` ≤ 50 ms, frente a 382 ms hoy. Mediana del `frame del arranque` sin trace ≤ 400 ms, frente a 817 ms. Umbrales propuestos: ver "Preguntas abiertas" |
| CA5 | `node scripts/diagnostico.mjs --url <PROD> --repeticiones 3` | 0 errores de consola en 6 rutas e invariantes 29 de 29 en cada repeticion |
| CA6 | `node scripts/diagnostico.mjs` (local, con tsc, lint y build) | tsc ok · lint ok · build ok · 0 errores en 6 rutas · 29 de 29 |
| CA7 | `node scripts/perfil-arranque.mjs --local-prod --repeticiones 3` | `decodificacion` sigue en el orden de hoy (25 ms en `evidencia/2026-10-18_006-perfil-hidratacion.txt:23`): ≤ 50 ms. El cambio no empeora el caso local |
| CA8 | `git diff --stat main -- src/ public/photos/` | Vacio: no cambia ningun componente, ni los datos, ni los AVIF |

## Preguntas abiertas

1. **Por que Vercel no optimiza.** `X-Matched-Path: /photos/america/01.avif` (`evidencia/2026-10-18_007-linea-base.txt`) dice que la peticion se sirve como fichero estatico. Hipotesis por orden, todas SIN VERIFICAR:
   1. La optimizacion de imagenes esta desactivada en el proyecto de Vercel, o se agoto la cuota del plan Hobby. Javi, ¿puedes mirar en el panel de Vercel la pestaña Usage → Image Optimization y los ajustes del proyecto, o pasarme una captura?
   2. Next 16 cambio los valores por defecto de `images` y Vercel no reconoce la configuracion que genera el build. Se comprueba leyendo `.next/required-server-files.json` y la salida de `vercel build`.
   3. Vercel no acepta AVIF como imagen de entrada. Se comprueba pidiendo `/_next/image` sobre un PNG o un JPG del mismo despliegue, por ejemplo `public/atlas/land-mask.png`.
2. **Si la causa es la cuota o el coste**, el arreglo no esta en el repo. La alternativa seria generar variantes por ancho en `prepare-images.mjs` y servirlas con un `loader` propio de `next/image`. Eso cambia `src/` y el peso del repo, y vuelve a pasar por el espejo de la spec 002. ¿Se acepta como plan B, o se decide cuando se conozca la causa?
3. **Umbrales de CA4.** 50 ms de decodificacion y 400 ms de frame son una propuesta. En local, el frame del arranque mide 250 ms (`evidencia/2026-10-18_diagnostico_cierre-006.txt:203`) y el resto del frame de produccion es ejecucion JS, 220 ms (`evidencia/2026-10-18_006-perfil-produccion.txt:86-96`), que esta spec no toca. ¿Te valen estos umbrales?
4. **Push.** CA1 a CA5 solo se pueden medir con el cambio desplegado en `<PROD>`. Hoy `main` va 5 commits por delante de `origin/main`. ¿Haras push de esta rama fusionada cuando CA6 a CA8 esten en verde?
5. **Discrepancia en `CLAUDE.md`.** Dice "Images via `next/image` with static imports", pero los `src` son cadenas de texto (`src/data/photos.ts:49`). No afecta a esta spec y se apunta para el paso 3 de `docs/ESTADO.md`.

## Enmienda 1 · 2026-10-18 · aprobada por Javi el 2026-10-18, junto con borrar los AVIF

**Hallazgo** (`evidencia/2026-10-18_007-hipotesis.txt`). El optimizador de Vercel sí se ejecuta: con un PNG del mismo despliegue redimensiona y convierte a WebP (`land-mask.png` sale a 256x128 y a 640x320, `:3-18`), y rechaza con 400 un `w` que no esta en la lista (`:37-39`). Lo que no hace es transformar un AVIF de origen: tres fotos distintas salen como AVIF a su tamaño completo con `Accept: image/webp` y sin cache (`:20-35`). Por tanto:

- Las hipotesis 1 (optimizacion desactivada o cuota agotada) y 2 (configuracion de Next 16) quedan **refutadas**. La 3 queda **confirmada por medida**: Vercel devuelve tal cual las imagenes AVIF de origen. Por que lo hace (documentacion de Vercel): SIN VERIFICAR, porque la busqueda no lo encontro.
- Corrijo la lectura de `X-Matched-Path` en "Problema": no indica que se sirva un fichero estatico, porque el PNG optimizado tambien la lleva (`:6`). Por eso CA1 deja de usarla.

**Consecuencia.** El arreglo no cabe en `next.config.ts`. La foto de origen tiene que estar en un formato que Vercel transforme, y eso cambia lo que la spec aprobada dejaba fuera.

**Cambios que se proponen:**
- "Fuera de alcance": se quita "Regenerar o recomprimir los AVIF de `public/photos/`". Se regeneran las 31 fotos desde `photos-master/`, no desde los AVIF, y con la misma autoria EXIF/XMP de la spec 002.
- "Zonas afectadas": se añaden `src/data/photos.ts` (solo cambia la extension de `src` y de `cover`), `scripts/prepare-images.mjs` y `public/photos/`.
- CA1: se quita la condicion sobre `X-Matched-Path`. Se mantienen el ancho, la proporcion y el tamaño.
- CA8 pasa a ser: `git diff main -- src/ ':!src/data/photos.ts'` vacio, y `git diff main -- src/data/photos.ts` solo con lineas `src:`/`cover:` que cambian `.avif` por la extension nueva, con `width` y `height` sin cambios.
- CA9 (nuevo): `exifr` con `{xmp:true}` sobre las 31 `public/photos/*/*.jpg` debe dar:
  - EXIF `Artist` = `Javier Suarez Suquia` y `Copyright` = `(C) 2026 Javier Suarez Suquia. All rights reserved.`, sin tildes: el EXIF es ASCII y libvips translitera.
  - XMP `creator` = `Javier Suárez Suquía`, con tildes.

  Es el mismo criterio que la CA4 de la spec 002 (`specs/002-proteger-fotos/tasks.md:13,37`). Corregido el 2026-10-18: la primera redaccion pedia tildes en el EXIF, y el estandar no lo permite.

# Plan 007 · Que /_next/image sirva imagenes redimensionadas en Vercel

- **Spec:** `spec.md`, aprobada el 2026-10-18 con la enmienda 1. Plan aprobado por Javi el 2026-10-18

## Enfoque

El optimizador de Vercel funciona con un PNG, pero devuelve tal cual las fotos que le llegan en AVIF (`evidencia/2026-10-18_007-hipotesis.txt:3-35`). Por eso la foto de origen pasa de AVIF a **JPEG** (2500 px de lado largo, mozjpeg con `quality: 86`), regenerada desde `photos-master/` con la misma autoria EXIF/XMP. `next/image` sigue igual: Vercel hara el redimensionado y la conversion a WebP de cada ancho, igual que hoy hace `next start` en local.

- `next.config.ts` no cambia. `formats` sigue en `["image/webp"]` (`evidencia/2026-10-18_007-hipotesis.txt:41-42`). Servir AVIF al navegador volveria a encarecer la decodificacion, que es justo lo que mide B6.
- Por que JPEG y no WebP: los dos pesan casi lo mismo. Las 31 fotos dan 11,6 MB en JPEG y 10,9 MB en WebP, frente a 5,8 MB en AVIF (medido con sharp sobre `photos-master/`, salida en la conversacion; se repite en T2 y queda en `evidencia/`). JPEG es el formato de entrada mas comun, y que Vercel transforme un WebP de origen esta SIN VERIFICAR. Como produccion solo se puede probar con un push, conviene no arriesgar.
- Descartado: las variantes por ancho pregeneradas con un `loader` propio. Multiplica los ficheros, saca el redimensionado de Vercel y toca `next.config.ts` y la carga de todas las `<Image>`. Solo tendria sentido si Vercel tampoco transformara un JPEG.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/prepare-images.mjs` | modificar | `.avif({ quality: 62 })` → `.jpeg({ quality: 86, mozjpeg: true })` y la extension `.avif` → `.jpg` (`:133,139`). Comentario de cabecera (`:2`). Mismos `resize`, `withExif` y `withXmp` |
| `public/photos/<album>/NN.jpg` | crear | 31 ficheros regenerados desde `photos-master/` |
| `public/photos/<album>/NN.avif` | borrar | 31 ficheros. Siguen en el historial del repo privado; el espejo ya los filtra (`.github/workflows/mirror.yml:42`) |
| `src/data/photos.ts` | modificar | `.avif` → `.jpg` en las 31 lineas `src:` y las 4 `cover:` (`:71,79,87,97`), mas el ejemplo del comentario `:49`. `width` y `height` no cambian |
| `scripts/photos-manifest.json` | modificar | Lo reescribe el script (`src` con `.jpg`) |
| `CLAUDE.md` | modificar | `:68` ("The AVIFs carry…") y `:74` ("AVIF/WebP") pasan a JPEG, con el motivo y el enlace a esta spec |
| `docs/design-spec-v2.md` | no se toca | No habla del formato de origen (grep `avif` sin resultados) |
| `evidencia/2026-10-18_007-*.txt` | crear | Salidas de T1 a T6 y de los CA |

No se tocan `src/app/about/page.tsx:49` (`portrait.avif`): esta comentado y el fichero no existe. Tampoco `next.config.ts`, `GLSurface` ni ningun componente.

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Vercel tampoco transforma un JPEG de origen | Baja | Alto: B6 sigue igual y el repo pesa 6 MB mas | CA1 a CA3 lo detectan en el primer `curl` despues del push. Vuelta atras con `git revert`, y plan B (`loader` propio) en otra spec |
| Al regenerar, cambian las dimensiones o el orden de alguna foto | Baja | Medio: cambiaria el `width`/`height` de `photos.ts`, y con el la composicion | T2 genera primero en `--out` (scratchpad) y compara el manifiesto con `photos.ts` foto a foto. No se toca `public/` hasta que coincida |
| Se pierde la autoria EXIF/XMP de la spec 002 | Baja | Medio | CA9 lee `Artist`/`Copyright` en las 31 fotos |
| Diferencia visible de calidad entre JPEG q86 y AVIF q62 | Baja | Bajo: el navegador nunca recibe el origen, sino el WebP q75 de Vercel | Mirarlo a ojo en `/album/america` en local (la regla es que salga en color y sin recortar). El diagnostico local ya sirve WebP desde el origen |
| Se agota la cuota de optimizacion de Vercel (Hobby) al transformar 31 fotos x anchos | SIN VERIFICAR | Medio | Javi mira Usage → Image Optimization despues del push. Hoy ya se cobra cada transformacion del PNG del atlas |
| Peso del repo privado: +11,6 MB de JPEG en el historial | Segura | Bajo | Aceptado: es el repo privado y el espejo filtra `public/photos/` |

## Vuelta atras

- **Rama:** `feat/007-vercel-image-resize`
- **Como se revierte:** `git revert` del commit de la spec. Recupera los AVIF, `photos.ts` y el script de una vez. No hay estado fuera del repo.
- **Que invariante avisaria de que esto ha roto algo:**
  - "No `.landing-photo` left at `opacity: 0`": una foto que no carga deja su entrada en 0.
  - El canvas del atlas y "0 errores de consola": un 404 de una `src` mal renombrada sale como error de consola en `/`, `/albums`, `/album/*` y `/atlas`.

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| Manifiesto de `--out` frente a `photos.ts`: mismos `src` sin extension, `width` y `height` | CA8 (previa) | `evidencia/2026-10-18_007-regeneracion.txt` |
| `exifr` sobre las 31 `.jpg` | CA9 | `evidencia/2026-10-18_007-regeneracion.txt` |
| `node scripts/diagnostico.mjs` (local, completo) | CA6 | `evidencia/2026-10-18_diagnostico_007.txt` |
| `node scripts/perfil-arranque.mjs --local-prod --repeticiones 3` | CA7 | `evidencia/2026-10-18_007-perfil-local-prod.txt` |
| `git diff --stat main -- src/ ':!src/data/photos.ts'` y `git diff main -- src/data/photos.ts` | CA8 | `evidencia/2026-10-18_007-regeneracion.txt` |
| Despues del push de Javi: `curl` + `sharp` en `w=256/640/1080` con los dos `Accept` | CA1-CA3 | `evidencia/AAAA-MM-DD_007-produccion.txt` |
| Despues del push: `perfil-arranque.mjs --url <PROD> --repeticiones 3` y `diagnostico.mjs --url <PROD> --repeticiones 3` | CA4, CA5 | `evidencia/AAAA-MM-DD_007-produccion.txt` |

Si no hay push, CA1 a CA5 quedan SIN VERIFICAR y la spec se cierra en local con CA6 a CA9, como dice la spec.

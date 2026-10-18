# Tareas 007 · Que /_next/image sirva imagenes redimensionadas en Vercel

- **Plan:** `plan.md` (aprobado el 2026-10-18)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T1** · El script exporta JPEG en vez de AVIF
  - Fichero(s): `scripts/prepare-images.mjs` (`:2`, `:133`, `:139`)
  - Comprobacion: `grep -n "avif" scripts/prepare-images.mjs` no da resultados. El sitio no cambia todavia, porque `public/` sigue igual
- [x] **T2** · Regenerar en el scratchpad y comparar con `photos.ts` antes de tocar `public/`
  - Fichero(s): ninguno del repo (`--out <scratchpad>/007/out`)
  - Comprobacion: las 31 fotos del manifiesto coinciden con `src/data/photos.ts` en `src` (sin la extension), `width` y `height`. Tambien queda medido el peso total de los JPEG. Salida en `evidencia/2026-10-18_007-regeneracion.txt`
- [x] **T3** · Escribir los JPEG en `public/photos/` y cambiar `.avif` por `.jpg` en `photos.ts`, en el mismo paso
  - Fichero(s): `public/photos/*/NN.jpg` (crear), `scripts/photos-manifest.json`, `src/data/photos.ts` (`src:`, `cover:` y el comentario `:49`)
  - Comprobacion: `grep -c "\.avif" src/data/photos.ts` da 0, y cada `src`/`cover` apunta a un fichero que existe. CA9: `exifr` lee `Artist` y `Copyright` en las 31 fotos
- [x] **T4** · Borrar los 31 AVIF de `public/photos/`
  - Fichero(s): `public/photos/*/NN.avif`
  - Comprobacion: `find public/photos -name "*.avif"` vacio, y `grep -rn "\.avif" src` solo da `src/app/about/page.tsx:49`, que esta comentado
- [x] **T5** · Diagnostico local completo y perfil de `next start`
  - Fichero(s): ninguno
  - Comprobacion: CA6 (`node scripts/diagnostico.mjs`: tsc, lint y build ok, 0 errores, 29 de 29) y CA7 (`perfil-arranque.mjs --local-prod --repeticiones 3`: decodificacion ≤ 50 ms)
  - Resultado: la primera ejecucion dio 23 de 29. Las 6 rutas dieron `page.goto: Timeout 30000ms exceeded` esperando `load`, aunque el resto de invariantes de `/` pasaban. La segunda, sin tocar nada, dio verde: 0 errores, 29 de 29, y el arranque en 233 ms. Causa probable: la cache de `next dev` para `/_next/image` estaba fria con las URLs `.jpg` nuevas. El landing se monta en todas las rutas, asi que todas esperan sus fotos. SIN VERIFICAR como causa unica. CA7: decodificacion 25 ms y frame 167 ms (medianas de 3)
- [x] **T6** · CA8: alcance del diff
  - Fichero(s): ninguno
  - Comprobacion: `git diff --stat main -- src/ ':!src/data/photos.ts'` vacio, y en `git diff main -- src/data/photos.ts` solo cambian las extensiones
- [x] **T7** · Documentacion
  - Fichero(s): `CLAUDE.md` (`:68`, `:74`)
  - Comprobacion: `grep -n "AVIF" CLAUDE.md` ya no presenta los AVIF como formato de origen
- [x] **T8** · Produccion, despues del push de Javi (`37ecf04..bc283b0`, 2026-10-18)
  - Fichero(s): ninguno
  - Comprobacion: CA1 a CA5, en `evidencia/2026-10-18_007-produccion.txt`, `evidencia/2026-10-18_007-perfil-produccion.txt` y `evidencia/2026-10-18_diagnostico_produccion_007.txt`. Sin push, quedan SIN VERIFICAR
  - Resultado:
    - CA1: `america/01.jpg` a `w=640` sale como WebP de 640x480 y 36 912 bytes.
    - CA2: a 256 sale de 256x192 (9 950 bytes) y a 1080 de 1080x810 (73 906 bytes).
    - CA3: con `Accept: image/webp` llega `image/webp`. Tambien responden bien una foto vertical (`sol/02`, 828x1104) y otra de otro album (`ny/03`, 384x288).
    - CA4: mediana de decodificacion 28 ms (≤ 50) y frame del arranque sin trace 150 ms (≤ 400). Antes eran 382 ms y 817 ms.
    - CA5: 0 errores en 6 rutas y 29 de 29, con la entrada en 167 ms de mediana de 3. El harness repite solo la seccion `entrada /`; las invariantes y la consola se miden una vez, asi que "en cada repeticion" no se puede afirmar tal como esta escrito el CA

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/` (`evidencia/2026-10-18_diagnostico_007-b.txt`; el rojo de la caché fría está en `evidencia/2026-10-18_diagnostico_007.txt`)
- [x] Criterios de aceptacion de la spec ejecutados (CA6 a CA9 en local; CA1 a CA5 despues del push)
- [x] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado
- [x] Estado de `spec.md` → Implementada

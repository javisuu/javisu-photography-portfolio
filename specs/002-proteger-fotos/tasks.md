# Tareas 002 · Proteger las fotografias

- **Plan:** `plan.md` (aprobado el 2026-10-15)
- **Rama:** `feat/002-proteger-fotos`, desde `f9c47a5`

## Parte local

- [x] **T1** · Probar que se pueden escribir los metadatos y comprobar que esta la herramienta de filtrado
  - Comprobacion:
    - sharp 0.35.4 escribe EXIF y XMP en AVIF, verificado en el scratchpad (ver spec, pregunta 3).
    - `git filter-repo` no estaba instalado. Se instalo con `python -m pip install --user git-filter-repo` (v2.47.0) y se ejecuta como `python -m git_filter_repo`.
- [x] **T2** · `scripts/prepare-images.mjs`: opcion `--out <dir>`, constantes `ARTIST`, `COPYRIGHT` y `XMP`, y `withExif` + `withXmp` en la cadena de sharp
  - Nombre corregido por Javi el 2026-10-15: **Javier Suárez Suquía**. El EXIF es ASCII por estandar, asi que libvips lo translitera a `Javier Suarez Suquia` / `(C) 2026 ...`. El XMP conserva las tildes.
- [x] **T3** · Regenerar en una carpeta temporal y comparar con `photos.ts` antes de sobrescribir
  - Comprobacion:
    - Manifest con 31 fotos frente a 31 entradas en `photos.ts`, y las 4 portadas: "COINCIDE TODO" (ancho, alto, ruta y portada).
    - Pixeles decodificados identicos 31/31 frente a los AVIF anteriores.
    - El peso total pasa de 5 873 298 a 5 939 743 bytes, un +1,13 %, porque los metadatos ocupan unos 2 KB por foto, mas de lo estimado en el plan (unos 450 bytes).
    - `SOL` cae al orden alfabetico (prefijos `04` duplicados en `photos-master/SOL/`), igual que en la exportacion de agosto: las dimensiones coinciden.
- [x] **T4** · Copiar los 31 AVIF regenerados a `public/photos/`
  - Comprobacion: `git diff -- src/data/photos.ts` vacio (CA6)
- [x] **T5** · `LICENSE` (MIT para el codigo, todos los derechos reservados para las fotos) y `README.md`
- [x] **T6** · `src/app/robots.ts` y `robots: "noai, noimageai"` en `src/app/layout.tsx`
- [x] **T7** · `.github/workflows/mirror.yml`
  - Corregido al verificar: la comprobacion posterior al filtrado usaba `git log --all`. Eso incluye las ramas remotas que `--refs main` no filtra (y que nunca se publican), y habria hecho fallar la Action. Ahora mira solo `main`.

- [x] **T8** · `/credits` con el nombre completo, a peticion de Javi (2026-10-15): "Javier Suárez Suquía" en la autoria y "© 2026 ... All rights reserved." (ano fijo, coherente con `LICENSE`)
  - Comprobacion: `node scripts/diagnostico.mjs --medir /credits` sin fallos

## Verificacion local (CA1 a CA8)

| CA | Resultado |
|---|---|
| CA1 | Clon filtrado de `feat/002-proteger-fotos`: en su historial solo queda `public/atlas/land-mask.png` (1 imagen, y 1 blob de imagen alcanzable desde HEAD) |
| CA2 | Filtrado dos veces: el mismo HEAD `2f7da89b…` las dos veces. Es determinista |
| CA3 | `LICENSE` separa los dos ambitos, con "© 2026 Javier Suárez Suquía. All rights reserved." |
| CA4 | 31/31 con EXIF `Javier Suarez Suquia` y XMP `Javier Suárez Suquía` (via `sharp().metadata()`) |
| CA5 | `robots.txt`: `Disallow: /` para 16 crawlers de IA y `Allow: /` para `*` |
| CA6 | `photos.ts` sin cambios |
| CA7 | `<meta name="robots" content="noai, noimageai"/>` |
| CA8 | Diagnostico: tsc ok, lint 0 errores y 1 aviso (B1), build ok, 0 errores de consola en 6 rutas, 29 de 29 invariantes. Lo lanzo Javi: `evidencia/2026-10-15_diagnostico_002.txt` |

## Parte GitHub

- [x] Javi sigue `guia-github.md`, bloques 0 a 5 (2026-10-17)
  - 0.1: 0 forks (API publica de GitHub, `forks_count: 0`).
  - Cambio de orden respecto a la guia: el bloque 2 (renombrar y privatizar) se hizo **antes** del push de `main`, para que `docs/referencias/2026-10-11_notas-laterales.png` y los AVIF nuevos no llegaran a ser publicos. La Action del push fallo (sin espejo ni secret todavia), como se esperaba. La ejecucion manual posterior, la del bloque 5, publico el espejo.
- [x] CA9 a CA12

## Verificacion GitHub (CA9 a CA12, 2026-10-17)

| CA | Resultado |
|---|---|
| CA9 | `main` privado en `50e3017`. Filtrado local (`python -m git_filter_repo --force --refs main --path public/photos --path docs/referencias --invert-paths` sobre un clon `--no-local`) → `235968fd…`. `git ls-remote` del espejo → `235968fd…`. Coinciden |
| CA10 | Clon del espejo: `git log --all --name-only` da 1 imagen, `public/atlas/land-mask.png`. No existen `public/photos/` ni `docs/referencias/`. 32 commits |
| CA11 | Javi abre produccion: la web carga con fotos. La entrada va a tirones hasta que termina de cargar todo: es un defecto aparte (ver `docs/ESTADO.md`), no un fallo de este criterio |
| CA12 | `curl -L https://github.com/javisuu/javisu-photography-portfolio` sin sesion: 200, el repo publico. El privado `javisu-photography-portfolio-private` da 404 a un usuario anonimo |

## Cierre

- [x] Evidencia de CA8 en `evidencia/2026-10-15_diagnostico_002.txt`
- [x] CA9 a CA12 ejecutados
- [x] `CLAUDE.md`: mencionar `LICENSE`, el espejo y el nuevo nombre del repo
- [x] Estado de `spec.md` → Implementada

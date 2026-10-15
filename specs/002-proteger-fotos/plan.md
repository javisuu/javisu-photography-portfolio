# Plan 002 · Proteger las fotografias: repo privado y espejo publico

- **Spec:** `spec.md` (aprobada el 2026-10-15)
- **Estado:** Borrador, pendiente de aprobacion de Javi

## Enfoque

El trabajo tiene dos mitades, y la segunda no empieza hasta que la primera este verificada.

**Mitad local (la hago yo, en la rama `feat/002-proteger-fotos`):**

1. **`LICENSE`.** MIT para el codigo. Para las fotografias (`public/photos/**`, `photos-master/**`, `docs/referencias/**`): "© 2026 Javier Suquia. All rights reserved."
2. **Metadatos.** `scripts/prepare-images.mjs` anade a la cadena de sharp (`:110-113`) dos cosas: `withExif({ IFD0: { Artist, Copyright } })` y `withXmp(...)` con `dc:creator`, `dc:rights`, `xmpRights:Marked=True` y `photoshop:Credit`. El XMP es lo que lee Google Imagenes para mostrar el autor y la licencia; el EXIF, casi cualquier visor. Las dos cosas ya se probaron (spec, pregunta 3). Despues se regeneran los 31 AVIF desde `photos-master/`.
3. **Exclusion de IA.**
   - `src/app/robots.ts` (nuevo, la API de metadata de Next) bloquea los crawlers de IA y permite `*`.
   - En `src/app/layout.tsx:15`, `metadata.other` anade `robots: "noai, noimageai"`. **SIN VERIFICAR** que Next lo emita como `<meta name="robots">` sin chocar con su propio campo `robots`. Se comprueba con CA7. Si choca, se usa `metadata.robots` con esas directivas como texto.
4. **Workflow del espejo**, en `.github/workflows/mirror.yml`. Se dispara con cada push a `main`:
   - `actions/checkout` con `fetch-depth: 0`;
   - `pip install git-filter-repo`;
   - `git filter-repo --force --path public/photos --path docs/referencias --invert-paths`;
   - un push normal (sin `--force`) de `main` al espejo por SSH, con la deploy key del secret `MIRROR_DEPLOY_KEY`.
   
   Lleva la guarda `if: github.repository == 'javisuu/javisu-photography-portfolio-private'`, porque el workflow tambien viaja al espejo y alli no debe ejecutarse. Si el push no es fast-forward, falla y avisa, en lugar de forzar.
5. **`README.md` (nuevo).** Hoy no existe. Explica que es el sitio, el stack, que las fotografias no estan en el repo publico y por que (con un enlace a `LICENSE`), y que sin ellas el sitio arranca con imagenes rotas.

**Mitad GitHub (la haces tu, siguiendo `guia-github.md`):** fusionar en `main`, renombrar este repo, pasarlo a privado, crear el espejo, crear la deploy key y hacer el primer push. Cada paso lleva su comprobacion.

**Alternativas descartadas:**
- Quitar el workflow del espejo en lugar de usar la guarda `if`: se perderia transparencia sin ganar nada.
- Escribir solo EXIF: Google Imagenes lee IPTC/XMP y no EXIF.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `LICENSE` | crear | Dos ambitos: el codigo con MIT y las fotografias con todos los derechos reservados |
| `README.md` | crear | Descripcion, stack, nota de que faltan las fotos y licencia |
| `scripts/prepare-images.mjs` | modificar | `:110-113`: `withExif` + `withXmp` antes de `.avif()`. Las constantes `ARTIST` y `COPYRIGHT` van arriba, junto a `MAX_LONG_EDGE` (`:25`) |
| `public/photos/**/*.avif` (31) | regenerar | Los mismos pixeles y el mismo tamano, mas unos 450 bytes de metadatos cada uno (medido en la prueba: 9122 frente a 8529 bytes en una foto de 400 px) |
| `scripts/photos-manifest.json` | regenerar | Lo reescribe el script. Se compara con `photos.ts` |
| `src/app/robots.ts` | crear | Reglas para crawlers de IA |
| `src/app/layout.tsx` | modificar | `:15-27`: `noai, noimageai` en `metadata` |
| `.github/workflows/mirror.yml` | crear | El filtrado y el push al espejo |
| `specs/002-proteger-fotos/guia-github.md` | crear | Los pasos manuales de Javi |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Regenerar desde `photos-master/` produce otro orden u otro tamano que el de `photos.ts` (por ejemplo, si los originales cambiaron desde agosto) | Baja | Alto: fotos con proporcion o posicion equivocada | Antes de sobrescribir, el script se ejecuta contra una carpeta temporal y se compara el manifest con `photos.ts` (ancho, alto, orden y portada). Solo si coincide todo se copia a `public/photos/` |
| **Fusionar en `main` publica en produccion 22 commits de trabajo** (`git rev-list --count main..HEAD` = 22: la entrada del landing, el atlas de globo, el wordmark...) | Segura | Medio: es lo que se quiere, pero sale en vivo de golpe | La guia hace que Javi revise primero la preview de Vercel de la rama. La fusion es fast-forward (`main` es ancestro de `HEAD`) |
| Vercel pierde la conexion con el repo al renombrarlo | Baja | Alto: los pushes dejan de desplegar | Paso de la guia: comprobar en Vercel → Settings → Git que apunta al repo renombrado, antes de seguir |
| El filtrado no es determinista y el segundo push no es fast-forward | Baja | Medio: la Action falla | CA2 lo prueba en local antes. Si falla en produccion, la Action se para sin forzar y avisa |
| Se filtra la clave privada de la deploy key | Baja | Alto: escritura en el espejo | La clave solo da escritura en el espejo, nunca en el privado. Se genera fuera del repo, se pega en el secret y se borra del disco. La guia lo dice paso a paso |
| `next build` del espejo falla sin fotos | Media | Bajo: el espejo es para leer | El README lo explica. `photos.ts` usa rutas de texto y no imports estaticos, asi que el build no deberia romper. SIN VERIFICAR: se prueba en CA1 con `npx next build` sobre el clon filtrado |
| Cache o historial de GitHub del repo antiguo | Segura | Bajo | Ya se acepto en la spec: lo clonado no se recupera |

## Vuelta atras

- **Rama:** `feat/002-proteger-fotos`, desde `feat/001-diagnostico-corregir-medicion` (`f9c47a5`).
- **Como se revierte la parte local:** `git revert` de los commits de la spec. Las fotos anteriores siguen en el historial del privado.
- **Como se revierte la parte de GitHub:** devolver el nombre y la visibilidad desde Settings, y borrar el espejo y la deploy key. Ningun paso destruye nada en el repo privado.
- **Que avisaria de que se ha roto algo:** el diagnostico (consola y `landing-photo` visibles, por si una foto regenerada falla), CA6 (`photos.ts` sin tocar) y el estado de la Action en la pestana Actions del privado.

## Verificacion

- **CA1 a CA8**, en local, antes de dar la guia por ejecutable. La salida va a `evidencia/<fecha>_002-proteger-fotos.txt`.
- **CA9 a CA12**, despues de la guia. Se anaden a la misma evidencia o a otra con fecha.

# Spec 003 · Fijar el runner y las acciones del workflow del espejo

- **Estado:** Implementada (2026-10-18). CA1 a CA8 pasan (`tasks.md`)
- **Fecha:** 2026-10-18
- **Requiere decision de Javi:** No (no toca wordmark, blend, `GLSurface` ni scroll infinito; no choca con el spec). Las preguntas abiertas ya tienen respuesta (2026-10-18). Javi tiene que hacer el push y mirar la Action en GitHub (CA5 y CA6)

## Problema

`.github/workflows/mirror.yml` publica el espejo en cada push a `main` (`.github/workflows/mirror.yml:7-10`). Tiene dos dependencias sin fijar que van a cambiar sin que nadie toque el fichero:

1. **`runs-on: ubuntu-latest`** (`.github/workflows/mirror.yml:19`). Segun la anotacion de GitHub Actions en la ejecucion de `50e3017`, `ubuntu-latest` pasa a Ubuntu 26 a partir del 2026-10-19 (captura de Javi, sin copia en `evidencia/`, ver `docs/ESTADO.md`, "Proximos pasos" 1). El workflow instala `git-filter-repo` con `pip install` sobre el Python del runner (`.github/workflows/mirror.yml:27`). Funciona en la imagen actual: CA9 paso con ella (`specs/002-proteger-fotos/tasks.md`, "Verificacion GitHub"). Que funcione igual en Ubuntu 26 esta **SIN VERIFICAR**. Si la imagen nueva trae un Python marcado como "externally managed" (PEP 668), `pip install` falla, el espejo deja de actualizarse y el fallo solo se ve en la pestana Actions.
2. **`actions/checkout@v4`** (`.github/workflows/mirror.yml:21`) declara `using: node20`. v5, v6 y v7 declaran `using: node24` (`evidencia/2026-10-18_003-checkout-runtimes.txt:3-6`). La misma ejecucion avisa de que Node 20 esta obsoleto (captura de Javi).

Hoy no hay ningun fallo. Esto es mantenimiento preventivo: el workflow va bien (`docs/ESTADO.md`, registro del 2026-10-17: el espejo en `5ad12bf` coincide con el filtrado local de `f4e8823`).

## Objetivo

El workflow corre en una imagen de runner fija y con un `checkout` que usa Node 24. Asi una ejecucion solo cambia de entorno cuando alguien edita el fichero, y el espejo sigue saliendo con el mismo hash que el filtrado local.

## Fuera de alcance

- La logica del filtrado: las `--path`, la comprobacion de imagenes y el push fast-forward (`.github/workflows/mirror.yml:29-57`) no se tocan.
- Fijar `git-filter-repo` a una version concreta. Ver la pregunta abierta 3: solo entra si Javi lo pide.
- El secret y la deploy key `MIRROR_DEPLOY_KEY`.
- Cualquier cosa de `src/`. El sitio no cambia, asi que el diagnostico tiene que salir igual que el ultimo (`evidencia/2026-10-17_diagnostico.txt:192-197`).
- `--force`, en el workflow o en cualquier push.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion
- [x] **CI: `.github/workflows/mirror.yml`** (no estaba en la plantilla)

## Choca con el spec

Nada. `docs/design-spec-v2.md` no habla de CI ni del espejo (`grep -niE "github|workflow|mirror|espejo"` solo encuentra la linea del enlace al repositorio en §4b, `docs/design-spec-v2.md:51`). Las reglas duras de `CLAUDE.md` (fotos sin recortar, escala de grises, sin parallax de cursor, `prefers-reduced-motion`) no aplican.

## Criterios de aceptacion

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `grep -nE "runs-on:\|uses:" .github/workflows/mirror.yml` | Una sola linea `runs-on: ubuntu-24.04` (no `ubuntu-latest`) y una sola linea `uses: actions/checkout@v5` (pregunta 1) |
| CA2 | `curl -s https://raw.githubusercontent.com/actions/checkout/v5/action.yml \| grep using:` | `using: node24` |
| CA3 | `git diff main -- .github/workflows/mirror.yml \| grep -E '^[+-][^+-]'` | Solo cambian las lineas de `runs-on` y `uses` (y un comentario, si se anade). Ninguna linea de `--path`, del `grep` de imagenes ni del `git push` |
| CA4 | `grep -c -- "--force" .github/workflows/mirror.yml` | `2`, igual que hoy: el `git filter-repo --force` (`.github/workflows/mirror.yml:31`), que reescribe el clon local de la Action y no hace ningun push, y el comentario `# No --force` (`.github/workflows/mirror.yml:55`). Ningun `--force` nuevo |
| CA5 | Push a `main` (lo hace Javi) y, cuando termine la Action, `git ls-remote git@github.com:javisuu/javisu-photography-portfolio.git main` frente a `git rev-parse HEAD` de un filtrado local del mismo commit (el procedimiento de CA9 de `specs/002-proteger-fotos/spec.md:77`) | Los dos hashes coinciden |
| CA6 | La ejecucion de CA5 en la pestana Actions del repo privado (la mira Javi, porque `gh` no esta instalado en local: `gh: command not found`, 2026-10-18) | Estado `success`, ninguna anotacion sobre Node 20 ni sobre el cambio de `ubuntu-latest`, y el paso "Set up job" muestra la imagen `ubuntu-24.04` |
| CA7 | `git clone git@github.com:javisuu/javisu-photography-portfolio.git <tmp> && git -C <tmp> log --all --name-only --pretty=format: \| grep -ciE '\.(avif\|webp\|jpe?g\|png\|tiff?)$'` | `1` (`public/atlas/land-mask.png`), como CA10 de la spec 002 |
| CA8 | `node scripts/diagnostico.mjs` | Verde, 29 de 29 y 0 errores de consola, igual que `evidencia/2026-10-17_diagnostico.txt:192-197` (el sitio no cambia; este criterio solo comprueba que no se ha tocado nada mas) |

## Preguntas abiertas

1. ~~**Que version de `checkout`.**~~ v5, v6 y v7 corren en Node 24 (`evidencia/2026-10-18_003-checkout-runtimes.txt`). La ultima mayor es v7 (v7.0.0 del 18 de junio, v7.0.1 del 20 de julio). No he leido las notas de cambio de v5 a v7. Que alguna rompa el `fetch-depth: 0` + `ref: main` que usa el workflow esta SIN VERIFICAR. Propuesta: **v5**. Es el salto minimo que quita Node 20, y su unico cambio de calado conocido es el runtime. La alternativa es v7, leyendo antes sus notas de cambio en el plan. Decide Javi.
   **Decidido por Javi el 2026-10-18: v5** (`actions/checkout@v5`). Antes respondio "v2", pero era una errata: v2 declara `using: node12` (`evidencia/2026-10-18_003-checkout-runtimes.txt:9`) y no cumpliria CA2.
2. ~~**`@vN` o un hash de commit.**~~ **Decidido por Javi el 2026-10-18: por etiqueta mayor (`@vN`)**, como hasta ahora. El workflow ya falla de forma visible si algo cambia (`.github/workflows/mirror.yml:36-44`).
3. ~~**`pip install git-filter-repo` sin version.**~~ **Decidido por Javi el 2026-10-18: no se toca.** Hoy instala la ultima version. Un cambio de version podria cambiar los hashes y hacer que se rechace el push fast-forward. El fallo seria visible y no publicaria nada mal. Sigue fuera de alcance.
4. **Ubuntu 26 en el futuro.** Fijar `ubuntu-24.04` aplaza el cambio, no lo evita: GitHub retirara esa imagen algun dia. No hay fecha en el repo. Se deja anotado en `docs/ROADMAP.md`, "Deuda conocida", al cerrar la spec.
5. ~~**Anotaciones sin evidencia.**~~ **Cerrada el 2026-10-18: Javi no tiene la captura.** Las dos advertencias se quedan como testimonio de Javi. CA6 las sustituye por evidencia: la ejecucion nueva no debe mostrar ninguna de las dos.

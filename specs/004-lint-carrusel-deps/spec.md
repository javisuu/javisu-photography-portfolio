# Spec 004 · Dependencia del carrusel y lint sin avisos

- **Estado:** Implementada (2026-10-18). CA1 a CA7 pasan: `evidencia/2026-10-18_004-lint-carrusel-deps.txt`, `evidencia/2026-10-18_diagnostico_004.txt`
- **Fecha:** 2026-10-18
- **Requiere decision de Javi:** No. No toca el wordmark, el blend `difference`, `GLSurface` ni el scroll infinito del landing. El carrusel esta dado por cerrado (`CLAUDE.md`, "Landing, the albums carousel... are considered settled"), asi que aprobar esta spec cuenta como el permiso explicito para tocarlo.

## Problema

El diagnostico tiene un aviso de lint abierto (B1 en `docs/ESTADO.md`):

```
551:6  warning  React Hook useEffect has a missing dependency: 'anchorRestOffsetPx'. Either include it or remove the dependency array  react-hooks/exhaustive-deps
```

(`evidencia/2026-10-18_diagnostico_cierre.txt:8`)

- El `useEffect` del bucle de fisica del carrusel empieza en `src/motion/AlbumsCarousel.tsx:381`, lee `anchorRestOffsetPx` dentro del `tick` (`src/motion/AlbumsCarousel.tsx:515`) y declara solo `[albums]` (`src/motion/AlbumsCarousel.tsx:551`).
- El diagnostico no exige 0 avisos. Lanza `npx eslint src` sin `--max-warnings=0` (`scripts/diagnostico.mjs:56`), y el codigo de salida solo cuenta invariantes, consola y `tsc` (`scripts/diagnostico.mjs:237`). Un aviso nuevo pasa sin que el diagnostico falle.

**Por que anadir la dependencia no cambia el comportamiento:**
- `anchorRestOffsetPx` depende solo de `albums`. Se calcula como `averageNaturalWidth(albums) / 2` (`src/motion/AlbumsCarousel.tsx:269`), `averageNaturalWidth` solo lee `album.cover` (`src/motion/AlbumsCarousel.tsx:101-104`) y `naturalWidthFor` solo lee `cover.width`/`cover.height` y la constante `SLIDE_HEIGHT` (`src/motion/AlbumsCarousel.tsx:81-83`).
- Su valor cambia solo cuando cambia `albums`, y eso ya hace que el efecto se vuelva a ejecutar. Como es un `number` y React compara con `Object.is`, una referencia nueva de `albums` con el mismo valor no anade ninguna ejecucion. El conjunto de re-ejecuciones queda igual.
- `albums` lo construye un server component (`src/app/albums/page.tsx:15-18`) y llega como prop serializada, asi que es estable durante el montaje.
- Coincide con el design spec: `X_RIGHT`/`X_LEFT` "are computed once from the *average* natural cover width across all albums and never move" (`docs/design-spec-v2.md:30`).

## Objetivo

`npx eslint src` sale sin errores ni avisos, y el diagnostico termina con codigo 1 si en el futuro aparece cualquier aviso de lint.

## Fuera de alcance

- Cualquier otro cambio en `AlbumsCarousel.tsx`: fisica, anclaje, commit, hover o estilos.
- Los `eslint-disable-next-line react-hooks/exhaustive-deps` que ya existen (`src/motion/Atlas.tsx:275,360,381,409,636`, `src/components/AlbumPhotoNav.tsx:85`). No se revisan aqui.
- La prueba negativa del diagnostico (`--autotest`, paso 10 de `docs/ESTADO.md`).
- El diagnostico contra produccion y el aviso de `next dev` duplicado (paso 2 de `docs/ESTADO.md`).

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [x] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`): una linea, el array de dependencias
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion
- [x] Otros: `scripts/diagnostico.mjs` (llamada a eslint, resumen y codigo de salida)

## Choca con el spec

Nada. No cambia ningun comportamiento visible. Las reglas duras (fotos sin recortar, escala de grises, sin parallax de cursor, `prefers-reduced-motion`) no se tocan.

## Criterios de aceptacion

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `npx eslint src --max-warnings=0; echo "exit=$?"` | Sin ningun problema listado y `exit=0` |
| CA2 | `npx tsc --noEmit; echo "exit=$?"` | Sin salida y `exit=0` |
| CA3 | `git diff --stat main -- src/` y `git diff main -- src/` | `1 file changed, 1 insertion(+), 1 deletion(-)` en `src/motion/AlbumsCarousel.tsx`. El unico cambio es `}, [albums]);` → `}, [albums, anchorRestOffsetPx]);` |
| CA4 | `grep -n "max-warnings=0" scripts/diagnostico.mjs` | Exactamente 1 coincidencia, en la llamada a eslint |
| CA5 | `grep -n "process.exit(failed.length" scripts/diagnostico.mjs` | La condicion de salida incluye el resultado del lint (si no es `ok`, sale con 1) |
| CA6 | `node scripts/diagnostico.mjs; echo "exit=$?"` | Resumen con `lint ok`, `invariantes 29 de 29`, `consola 0 errores en 6 rutas` y `exit=0` |
| CA7 | `/medir-dom /albums` en `main` y en la rama, con el carrusel en reposo y sin interaccion | El `width` y el `translateX` de cada frame visible coinciden al pixel entre las dos mediciones |

## Preguntas abiertas

- Ninguna. Decidido por Javi el 2026-10-18: se anade la dependencia (no se usa `eslint-disable`), el diagnostico sale con codigo 1 cuando haya avisos de lint y el cambio va en la rama propia `feat/004-lint-carrusel-deps`.

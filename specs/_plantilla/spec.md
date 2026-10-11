# Spec NNN · Titulo

- **Estado:** Borrador | Aprobada | Implementada | Descartada
- **Fecha:** AAAA-MM-DD
- **Requiere decision de Javi:** No | Si (motivo: wordmark / blend difference / GLSurface / scroll infinito / choca con el spec)

## Problema

Que pasa hoy y como se nota. Con evidencia (`ruta:linea` o `evidencia/...`). Si el problema es visual, la evidencia es una cifra medida, no una impresion.

## Objetivo

Que sera cierto cuando esto este hecho. Una o dos frases.

## Fuera de alcance

Que no se toca, aunque este cerca.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion

## Choca con el spec

Que regla de `docs/design-spec-v2.md` o de `CLAUDE.md` contradice, si contradice alguna. Si no, "nada".

## Criterios de aceptacion

Cada uno es un comando con su resultado esperado.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs --skip-build` | 0 fallos de invariantes |
| CA2 | | |

## Preguntas abiertas

-

# Plan 015 · Pagina de album sin freno al hacer scroll

- **Spec:** `spec.md` (aprobada el 2026-11-01)

## Enfoque

Primero se mide. Una seccion nueva del diagnostico, `scroll del album`, lanza una rafaga de rueda en `/album/<slug>` y muestrea por rAF `scrollY` y `lenis.velocity`. Da el retraso de hoy entre el scroll pedido y el aplicado, y la velocidad maxima que ve la curva GL. Tambien prueba NEXT ALBUM con el clic en plena inercia (B10).

Despues se pasan opciones a `useLenis` desde `AlbumPhotos` (`src/motion/AlbumPhotos.tsx:60`), sin tocar el hook ni el landing:
- **`lerp`:** sube desde 0,1, el valor por defecto de Lenis 1.3.26 (`node_modules/lenis/dist/lenis.mjs:434`). Cuanto mas alto, menos va el scroll por detras de la rueda. Se prueban tres valores (0,2, 0,35 y 0,5) con la seccion nueva, y Javi elige en `npm run dev`.
- **`stopInertiaOnNavigate: true`:** opcion de Lenis 1.3.26, desactivada por defecto (mismo sitio). Si T1 reproduce B10, es el primer candidato.

`useLenis` ya aplica las opciones solo sin reduced motion (`src/motion/useLenis.ts:31-38`), asi que reduced motion no cambia.

Si con el `lerp` elegido la curva GL deja de notarse (CA5), se baja `velocityNormalize` en el `<GLSurface>` del album. Es una prop que ya existe; `GLSurface.tsx` no se toca.

**Descartado:** quitar Lenis del album. `GLSurface` lee de Lenis la velocidad de la curva (`src/motion/GLSurface.tsx:386-387`), y sin el la curva desaparece.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/diagnostico.mjs` | modificar | Seccion nueva `scroll del album` |
| `src/motion/AlbumPhotos.tsx` | modificar | Opciones de `useLenis` en una constante del modulo: `lerp` y, si hace falta, `stopInertiaOnNavigate`. Si CA5 lo pide, `velocityNormalize` |
| `docs/design-spec-v2.md` | modificar | §3: una linea con el suavizado del album y por que |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Con `lerp` alto la curva GL deja de notarse, porque la velocidad dura menos frames | Media | Medio | CA5 lo mide. Se compensa con `velocityNormalize` |
| La rafaga sintetica de Playwright no se parece a la rueda de un raton real (sin inercia del sistema) | Alta | Medio | Las cifras sirven para comparar antes y despues. La decision final es de Javi probandolo (CA6) |
| B10 no se reproduce en Playwright | Alta | Bajo | Se queda abierto en `docs/ESTADO.md`. `stopInertiaOnNavigate` solo entra si T1 lo reproduce o si Javi lo sigue viendo despues del cambio |
| `useLenis` lee `options` solo al construir la instancia (`src/motion/useLenis.ts:11-13`) | Baja | Bajo | Constante del modulo, no un objeto en linea |

## Vuelta atras

- **Rama:** `feat/015-album-sin-freno`, creada por Javi desde `main` despues de fusionar la 013.
- **Como se revierte:** quitar las opciones de `useLenis()` en `AlbumPhotos.tsx`.
- **Que invariante avisaria de que esto ha roto algo:** `barra de scroll` (rueda y teclado en el album, tambien con reduced motion), `llegada al album` y 0 errores de consola.

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| Linea base de `scroll del album` sobre el codigo de hoy | CA2, CA3 y CA5 (base) | `evidencia/AAAA-MM-DD_015-linea-base.txt` |
| La seccion con cada `lerp` candidato | CA2 y CA5 | `evidencia/AAAA-MM-DD_015-candidatos.txt` |
| `node scripts/diagnostico.mjs` completo | CA1 y CA4 | `evidencia/AAAA-MM-DD_015-completo.txt` |
| Javi en su maquina | CA6 | Testimonio en `tasks.md` |

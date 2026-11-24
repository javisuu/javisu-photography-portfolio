# Tareas 023 · Pagina de album en movil

- **Plan:** `plan.md` (aprobado el 2026-11-24)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. Commit por tarea verificada.

- [ ] **T0** · Medicion y linea base
  - Fichero(s): `scripts/lib/albumMovil.mjs` (nuevo), `scripts/diagnostico.mjs`
  - Que:
    - la seccion `album-movil` en modo dispositivo (CA3 a CA11);
    - linea base de escritorio con `--capturas-guardar`, con `/album/america` y `/album/sol` añadidas a las capturas si no estan;
    - los cinco perfiles moviles y `ipad --horizontal`.
  - Comprobacion: `album-movil` falla donde el lienzo difiere de hoy (GL y Lenis presentes, titulo a 48 px, pie en una fila, `NEXT ALBUM` en fila). El resto del diagnostico, sin fallos nuevos frente al cierre del 2026-11-24.
- [ ] **T1** · Sin GL ni Lenis en el album movil, y llegada de la foto 1 por `decode()`
  - Fichero(s): `src/motion/AlbumPhotos.tsx`, `scripts/diagnostico.mjs` (`sinGL` para el album en perfiles moviles)
  - Comprobacion: CA3, CA4 (`ipad --horizontal`), CA9 y CA13. En escritorio: CA2 a 0 px, y `llegada al album` y `transicion` sin fallos nuevos frente a T0.
- [ ] **T2** · Bloque de titulo
  - Fichero(s): `src/app/album/[slug]/page.tsx`, `src/app/globals.css`
  - Comprobacion: CA5 en los perfiles en vertical; escritorio, CA2.
- [ ] **T3** · Filas y pie en tres lineas, en vertical
  - Fichero(s): `src/motion/AlbumPhotos.tsx`, `src/app/globals.css`, `src/motion/albumTransition/flight.ts`
  - Comprobacion: CA6 y CA7 en los perfiles en vertical; CA12 (`notas-movil` y «fotos enteras») en los cinco; escritorio, CA2. Capturas de `/album/america` y `/album/sol` en el iPhone y el iPad mini, para Javi.
- [ ] **T4** · Horizontal
  - Fichero(s): `src/motion/AlbumPhotos.tsx`, `src/app/globals.css`
  - Comprobacion: CA7 y CA8 en `iphone --horizontal`; CA12 en ese perfil. Capturas de una fila centrada, una desplazada a la izquierda y otra a la derecha, y de la fila con nota, para Javi.
- [ ] **T5** · Final: `NEXT ALBUM`, fundido de la portada y pie de pagina
  - Fichero(s): `src/app/album/[slug]/page.tsx`, `src/components/Footer.tsx`, `src/motion/FundidoAlEntrar.tsx` (nuevo), `src/app/globals.css`
  - Comprobacion: CA10 y CA11 en los perfiles en vertical, con y sin reduced motion; escritorio, CA2.

## Cierre

- [ ] Javi para su `npm run dev`. `node scripts/diagnostico.mjs` con build en escritorio (CA1, CA2), mas los cinco perfiles y `ipad --horizontal` (CA12, CA13). Salidas en el scratchpad para copiar a `evidencia/`
- [ ] Push de la rama y preview de Vercel. CA14: Javi, en el iPhone 13 y el iPad mini, con scroll rapido y lento
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md` (§3, §6 y Motion inventory #1) actualizados; en `docs/ESTADO.md`, M11, y M3 y M12 en su parte del album
- [ ] Estado de `spec.md` → Implementada

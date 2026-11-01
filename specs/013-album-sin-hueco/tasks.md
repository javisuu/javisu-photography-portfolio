# Tareas 013 · Pagina de album sin hueco al llegar

- **Plan:** `plan.md` (aprobado el 2026-10-31)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T0** · Javi crea la rama `feat/013-album-sin-hueco` desde `main` y para su `npm run dev`
  - Fichero(s): ninguno
  - Comprobacion: `git branch --show-current` da `feat/013-album-sin-hueco`
- [x] **T1** · Seccion `llegada al album` en el diagnostico: carrusel, NEXT ALBUM, carga directa, reduced motion y sin WebGL; screencast clasificado por pixeles; atributos de la foto 1
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: `MSYS_NO_PATHCONV=1 node scripts/diagnostico.mjs --medir /album/america` corre sin excepcion y saca las cifras de cada pasada
- [x] **T2** · Linea base con la seccion nueva sobre el codigo de hoy, en local y en produccion
  - Fichero(s): ninguno (salida al scratchpad; Javi la copia a `evidencia/`)
  - Comprobacion: la seccion da **rojo** en CA2 (algun fotograma en blanco) y en CA6 (`loading="lazy"` en la foto 1), y verde en CA7 (sin WebGL la foto se ve). Si no da rojo, la medida no ve el hueco y no se sigue
- [x] **T3** · `preload` y `fetchPriority="high"` en la foto 1
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: CA6 en verde en local
- [x] **T4** · Fila 0 a `opacity: 0` inline, fundido por rAF de 400 ms ease-out al disparar `onTexturesReady` (`readyNodeCount={1}`), salida sin GL, tiempo maximo de 1,5 s, reduced motion en un frame, y `<noscript>`
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: CA2, CA3, CA4 y CA7 en verde en local; 0 errores de consola
- [x] **T5** · Javi lo mira en `npm run dev` (carrusel, NEXT ALBUM y recarga) y decide la duracion del fundido
  - Fichero(s): `src/motion/AlbumPhotos.tsx`, si cambia la duracion
  - Comprobacion: testimonio de Javi (CA9, en local). 2026-10-31: "Esta bien"; la foto 1 aun se nota llegar despues, y eso queda para la transicion carrusel→album (enmienda 1). Duracion: 400 ms, sin cambios
- [-] **T6** · ~~Documentacion: retirada del Flip~~ Anulada por la enmienda 1 de la spec: el Flip no se retira
  - Fichero(s): `docs/design-spec-v2.md`, `CLAUDE.md`, `docs/ROADMAP.md`, `src/app/album/[slug]/page.tsx` (solo el comentario)
  - Comprobacion: `grep -rn "Flip\|jump-into" docs/design-spec-v2.md CLAUDE.md docs/ROADMAP.md src/` solo devuelve menciones que digan que esta retirado
- [x] **T7** · Diagnostico completo en local
  - Fichero(s): ninguno
  - Comprobacion: CA1 y CA8; salida a `evidencia/2026-11-01_013-completo.txt`. 2026-11-01: tsc, lint y build ok, 0 errores de consola en 6 rutas, 145 de 145 invariantes; `llegada al album`: 0 fotogramas en blanco con opacity 1 y sin parpadeo en carrusel, NEXT ALBUM, carga directa y reduced motion; sin WebGL, opacity 1 a 305 ms sin fundido; foto 1 `eager` + `fetchpriority=high` en los 4 albumes
- [x] **T8** · Commit; Javi fusiona y hace push. Medida en produccion
  - Fichero(s): ninguno
  - Comprobacion: CA2 a CA6 con `--url ... --repeticiones 3`; salida a `evidencia/2026-11-01_013-produccion.txt`; Javi lo confirma en su maquina (CA9)
  - 2026-11-01, commits `d76746f` y `47d4780`, push de Javi `eef0a27..47d4780`. Produccion: 0 errores de consola, 105 de 105 invariantes.
    - CA2, CA3 y CA4: 0 fotogramas en blanco con opacity 1 y sin parpadeo en las 9 pasadas y con reduced motion.
    - CA6: los 4 albumes con la foto 1 `eager` + `fetchpriority=high`.
    - CA7: sin WebGL, opacity 1 a 371 ms, sin fundido.
    - **CA5 no se cumple del todo.** Medianas de "foto entera" frente a linea base + 400 ms: carrusel 715 contra 706 (+9 ms), NEXT ALBUM 717 contra 617 (+100 ms), carga directa 830 contra 932 (cumple). El fundido arranca cuando la textura ya esta subida, no cuando GL tiene contexto, y eso suma la espera de la textura a los 400 ms. Pendiente de que Javi lo acepte como medido.

- [x] **T9** · Enmienda 2: sin fundido, aparece de golpe con la textura
  - Fichero(s): `src/motion/AlbumPhotos.tsx`, `scripts/diagnostico.mjs`, `CLAUDE.md`, `docs/design-spec-v2.md`
  - Comprobacion: `--medir /album/norte --repeticiones 3`, 75 de 75, "sin fundido" en verde en las 9 pasadas (`evidencia/2026-11-01_013-enmienda2.txt`). Produccion 2026-11-01, tras el push `47d4780..4915ec1` (`evidencia/2026-11-01_015-produccion.txt`): 0 errores de consola, 119 de 119 invariantes. Ningun fotograma en blanco con opacity 1, sin parpadeo y sin fundido en las 9 pasadas. Medianas de "foto entera": carrusel 551, NEXT ALBUM 690 y carga directa 802 ms

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/`
- [x] Criterios de aceptacion de la spec ejecutados (CA5 redefinido en la enmienda 2)
- [x] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado
- [x] Estado de `spec.md` → Implementada
- [ ] B9 cerrado en `docs/ESTADO.md`

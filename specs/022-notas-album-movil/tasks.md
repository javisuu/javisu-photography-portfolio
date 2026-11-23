# Tareas 022 · Notas del album en movil

- **Plan:** `plan.md` (aprobado el 2026-11-23)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T0** · Medicion y linea base
  - Fichero(s): `scripts/lib/notasMovil.mjs` (nuevo), `scripts/diagnostico.mjs`
  - Que:
    - la seccion `notas-movil` en modo dispositivo;
    - las cajas de escritorio (CA3) junto a las capturas: `--capturas-guardar` y `--capturas-comparar` las guardan y comparan como `notas-cajas.json` en la misma carpeta (desvio del plan, que pedia `--notas-guardar` y `--notas-comparar`: una sola linea base y un solo flag);
    - linea base de escritorio, con capturas y cajas de los textos;
    - los cinco perfiles moviles.
  - Comprobacion: en los cinco perfiles, la seccion falla en el iPad tal y como mide `2026-11-20_022-t0-notas.txt` (citas de 42 a 151 px) y en el estilo de la cita (CA7). El resto del diagnostico, sin fallos nuevos.
  - **Hecho el 2026-11-23** (`--skip-build`, `next dev` en 3100). Salidas `2026-11-23_022-t0-<perfil>.txt` y linea base `022-capturas-base/` en el scratchpad, pendientes de copiar a `evidencia/`.
    - `ipad-mini` (173 de 179) e `ipad` (171 de 179): fallan CA4, CA5, CA6 y los tres CA7. Citas de 42,2 a 150,5 px en el iPad mini, como en la medida del 2026-11-20; de 122,2 a 135,3 px en el iPad.
    - `iphone` (176 de 178) e `iphone-max`: CA4, CA5 y CA6 ok; fallan el estilo de la cita (16/24 px, `rgb(136, 136, 136)`, 280 px) y el aire.
    - `iphone --horizontal`: lo mismo, y ademas el margen izquierdo en las filas desplazadas (`america` 6, `sol` 3 y 6).
    - Fallos ajenos, de partida: `iphone-max` con 6 `goto` en frio de `next dev`; `ipad` deslizar 01 -> 01 (M8); `iphone --horizontal` E1.
    - Escritorio (536 de 553): `notas: 6 cajas guardadas` y las tres capturas. Fallan solo los tiempos de `transicion` (CA8b, CA10, CA11, CA13) y NEXT ALBUM, que ya oscilan entre ejecuciones (cierre de 021: 547 y 555 de 557).
- [x] **T1** · Texto debajo del pie en movil
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion:
    - CA4, CA5 y CA6 en los cinco perfiles;
    - el `display` computado de la rejilla es `contents` en `ipad-mini` (gana a `md:grid`);
    - escritorio: CA2 y CA3.
  - **Hecho el 2026-11-23.** Salidas `2026-11-23_022-t1-<perfil>.txt`, `t1b` y `t1c-ipad` en el scratchpad.
    - Rejilla `contents` en los cinco perfiles, tambien en `ipad-mini`: `movil:` gana a `md:grid` sin `!`.
    - CA4, CA5 y CA6 ok en los cinco. Aire de 48 px y texto en el margen izquierdo de la fila en todos los textos, tambien en las filas desplazadas del `iphone --horizontal`. Solo falla el estilo de la cita (CA7), que es T2.
    - `ipad-mini` 178 de 179, `iphone` 177 de 178, `iphone --horizontal` 179 de 181 (E1, de partida), `iphone-max` 171 de 178 (los `goto` en frio), `ipad` 176 de 179 (M8, de partida).
    - **Arreglo del harness:** en el `ipad` (834 px) CA6 fallaba con la foto a 583,8 px frente a 706. No era la maqueta: `sizes` es `(max-width: 768px) 90vw, 70vw` (`src/motion/albumTransition/flight.ts:46`), asi que toda foto, con texto o sin el, mide como mucho 70vw. El ancho esperado usa ahora `naturalWidth`, que ya viene corregido por la densidad del srcset, en vez del atributo `width`.
    - Escritorio: capturas a 0 px en las tres rutas y `notas: 0 diferencias en 6 cajas` (CA2, CA3). Los fallos de `transicion` (lamina, titulo y descripcion a 1-3 px, duraciones) oscilan entre ejecuciones y ya salieron antes en esta rama.
- [ ] **T2** · Estilo de la cita y aire en movil
  - Fichero(s): `src/components/AlbumTexts.tsx`, `src/motion/AlbumPhotos.tsx`
  - Comprobacion:
    - CA7 en los cinco perfiles;
    - escritorio: CA2 y CA3;
    - capturas de `/album/norte` y `/album/sol` en el iPhone y el iPad mini para Javi, incluida la raya de encima de la cita.
- [ ] **T3** · Ojo de Javi (CA9)
  - Que: Javi, en la preview de Vercel, en el iPad mini en vertical y el iPhone 13.
  - Comprobacion: visto bueno anotado aqui con fecha.

## Cierre

- [ ] `node scripts/diagnostico.mjs` con build: sin fallos nuevos frente a T0 (CA1), con capturas a 0 px (CA2) y cajas iguales (CA3)
- [ ] Seccion `notas-movil` y `navegacion` en los cinco perfiles (CA4 a CA8)
- [ ] `docs/design-spec-v2.md` §3 y `CLAUDE.md` (Album texts): el texto en movil
- [ ] Estado de `spec.md` → Implementada

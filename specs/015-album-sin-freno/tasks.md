# Tareas 015 · Pagina de album sin freno al hacer scroll

- **Plan:** `plan.md` (aprobado el 2026-11-01)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T0** · Javi fusiona la 013 en `main`, crea `feat/015-album-sin-freno` y para su `npm run dev`
  - Fichero(s): ninguno
  - Comprobacion: `git branch --show-current` da `feat/015-album-sin-freno`
  - 2026-11-01: rama `feat/015-album-sin-freno` creada por Javi tras fusionar la 013 (`eef0a27..47d4780`)
- [x] **T1** · Seccion `scroll del album`: rafaga de rueda con `scrollY` y `lenis.velocity` por rAF; NEXT ALBUM con el clic en plena inercia, en los 4 albumes
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: corre sin excepcion. Linea base: retraso, velocidad maxima y `scrollY` tras NEXT ALBUM
  - Linea base (`evidencia/2026-11-01_015-linea-base.txt`), `lerp` 0,1 por defecto: al soltar la rueda faltaban 1000 px y llego 985 ms despues; velocidad maxima normalizada 2,98. **B10 reproducido 4 de 4:** con el clic en plena inercia (la rueda se lanza desde la pagina; la rafaga de `page.mouse.wheel` era demasiado lenta y la pagina ya estaba parada), el album nuevo empieza en `scrollY` 5142-7242
- [x] **T2** · Tres candidatos de `lerp` (0,2, 0,35 y 0,5), medidos con la seccion
  - Fichero(s): `src/motion/AlbumPhotos.tsx` (temporal)
  - Comprobacion: tabla de retraso y velocidad maxima por candidato
  - `evidencia/2026-11-01_015-candidatos.txt`, todos con `stopInertiaOnNavigate: true`. Faltaban al soltar y tiempo hasta llegar: 0,2 → 593 px y 450 ms; 0,35 → 375 px y 237 ms; 0,5 → 281 px y 150 ms. Velocidad maxima normalizada 3,63 / 4,30 / 5,58. B10: `scrollY` 0 en los 4 albumes con los tres valores; 49 de 49 invariantes
- [x] **T3** · Javi prueba los candidatos en `npm run dev` y elige
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: testimonio de Javi (CA6)
  - Javi, con 0,2 en `npm run dev`: "esta genial asi". Se queda `lerp: 0.2`
- [x] **T4** · Si T1 reproduce B10 o Javi lo sigue viendo: `stopInertiaOnNavigate: true`
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: CA3
  - `stopInertiaOnNavigate: true` (`node_modules/lenis/dist/lenis.mjs:554-558`: `reset()` al pulsar un enlace a otra ruta). CA3 en verde en T2
- [-] **T5** · No hace falta: CA5 cumple (3,63 con 0,2). Si CA5 falla: ajustar `velocityNormalize` en el `<GLSurface>` del album
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: CA5
- [x] **T6** · Design spec §3: el suavizado del album y por que
  - Fichero(s): `docs/design-spec-v2.md`
  - Comprobacion: la linea cita esta spec
- [x] **T7** · Diagnostico completo, commit; Javi fusiona y hace push
  - Fichero(s): ninguno
  - Comprobacion: CA1 y CA4; salida a `evidencia/2026-11-01_015-completo.txt`. 2026-11-01: tsc, lint y build ok, 0 errores de consola en 6 rutas, 153 de 153 invariantes (incluidas `barra de scroll`, `llegada al album` y `scroll del album`); al soltar la rueda faltaban 595 px, llego en 451 ms; B10 con `scrollY` 0 en los 4 albumes

## Cierre

- [ ] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/`
- [ ] Criterios de aceptacion de la spec ejecutados
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado
- [ ] Estado de `spec.md` → Implementada
- [ ] B10 cerrado o actualizado en `docs/ESTADO.md`

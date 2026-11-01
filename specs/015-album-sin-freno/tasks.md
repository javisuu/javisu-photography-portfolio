# Tareas 015 · Pagina de album sin freno al hacer scroll

- **Plan:** `plan.md` (aprobado el 2026-11-01)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [ ] **T0** · Javi fusiona la 013 en `main`, crea `feat/015-album-sin-freno` y para su `npm run dev`
  - Fichero(s): ninguno
  - Comprobacion: `git branch --show-current` da `feat/015-album-sin-freno`
- [ ] **T1** · Seccion `scroll del album`: rafaga de rueda con `scrollY` y `lenis.velocity` por rAF; NEXT ALBUM con el clic en plena inercia, en los 4 albumes
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: corre sin excepcion. Linea base: retraso, velocidad maxima y `scrollY` tras NEXT ALBUM
- [ ] **T2** · Tres candidatos de `lerp` (0,2, 0,35 y 0,5), medidos con la seccion
  - Fichero(s): `src/motion/AlbumPhotos.tsx` (temporal)
  - Comprobacion: tabla de retraso y velocidad maxima por candidato
- [ ] **T3** · Javi prueba los candidatos en `npm run dev` y elige
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: testimonio de Javi (CA6)
- [ ] **T4** · Si T1 reproduce B10 o Javi lo sigue viendo: `stopInertiaOnNavigate: true`
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: CA3
- [ ] **T5** · Si CA5 falla: ajustar `velocityNormalize` en el `<GLSurface>` del album
  - Fichero(s): `src/motion/AlbumPhotos.tsx`
  - Comprobacion: CA5
- [ ] **T6** · Design spec §3: el suavizado del album y por que
  - Fichero(s): `docs/design-spec-v2.md`
  - Comprobacion: la linea cita esta spec
- [ ] **T7** · Diagnostico completo, commit; Javi fusiona y hace push
  - Fichero(s): ninguno
  - Comprobacion: CA1 y CA4; salida a `evidencia/AAAA-MM-DD_015-completo.txt`

## Cierre

- [ ] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/`
- [ ] Criterios de aceptacion de la spec ejecutados
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md` actualizados si cambio algo documentado
- [ ] Estado de `spec.md` → Implementada
- [ ] B10 cerrado o actualizado en `docs/ESTADO.md`

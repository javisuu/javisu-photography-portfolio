# Tareas 021 · Landing movil

- **Plan:** `plan.md` (aprobado el 2026-11-18)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion. Escritorio, en cada tarea que toque `src/`: capturas a 0 px frente a la linea base de T0 (regla «movil no toca escritorio»).

- [x] **T0** · Diagnostico y linea base
  - Que: arreglar la regex de «fotos enteras» (`scripts/diagnostico.mjs:402`) y ampliarla al ancho; crear la seccion `landing-movil` (`scripts/lib/landingMovil.mjs`) con CA3-CA5 y CA7-CA13, llamada solo en modo dispositivo. Medir sobre el codigo de hoy: escritorio con `--capturas-guardar`, y los cinco perfiles.
  - Fichero(s): `scripts/diagnostico.mjs`, `scripts/lib/landingMovil.mjs`
  - Comprobacion: la seccion corre en los cinco perfiles y falla donde hoy falla el sitio (M13 en vertical, M1 en horizontal, Lenis presente, canvas GL presente). En escritorio no anade fallos salvo los de «fotos enteras» en albumes, si los hay, que pasan a ser linea base.
  - Resultado (2026-11-18, `next dev`, `--skip-build`; salidas `2026-11-18_021-t0-*.txt`, pendientes de copiar a `evidencia/`):
    - **Escritorio:** 538 de 553. Sin fallos de «fotos enteras» ni de la seccion nueva. Los 15 fallos son de tiempos en `next dev` (fundidos de `transicion`, CA8b, «NEXT ALBUM empieza arriba», frames > 50 ms del atlas), los mismos tipos que en el cierre de la spec 020 (540 de 557). Capturas base en `021-capturas-base/` (landing, album, atlas y `landing-currentSrc.json`).
    - **iphone 157/171, iphone-max 159/171, ipad-mini 159/171, ipad 158/172, iphone horizontal 162/176.** En los cinco, `landing-movil` falla donde se esperaba: CA7 (1 lienzo GL, 30 `<img>` ocultas), CA8 (Lenis presente; un arrastre de 265,6 px mueve 251 en iphone), CA9 (30 fotos; llega al final del documento sin vuelta, retrocesos 0: **medido, Lenis `infinite` no da la vuelta en tactil**), CA11 y CA12 (wordmark a 64 px en iphone, 120 px en horizontal; descriptor a 13 px), CA13 (no salta), CA3/CA4 (6 fotos salen por los lados; 8 fuera del 40-65 %: M13). En horizontal, ademas CA3 a lo alto y CA5 con 15 fotos fuera (M1). «Fotos enteras» con la regex arreglada: 12 de 30 fuera en vertical, 28 de 30 en horizontal. En las tablets, CA7 tras girar: sigue el lienzo.
    - Pasan ya: CA10 (parallax 0,9-1,1 y reduced motion 1,0) y CA3 a lo alto en vertical.
    - Fallos fuera de la seccion, linea base: en `ipad`, «deslizar cambia de album» (carrusel, M de `carrusel-tactil`); en `iphone --horizontal`, «wordmark dice SUQUIA» (dice "") y E1 `?diag` (0/0 pintados). Que estos dos sean de tiempo y no del sitio: SIN VERIFICAR; la spec 020 no tiene corrida en horizontal con que compararlos.
- [ ] **T1** · `useEsMovil` y la media query en un solo sitio
  - Fichero(s): `src/lib/movil.ts`, `scripts/lib/navegacion.mjs`
  - Comprobacion: tsc y lint limpios; seccion `navegacion` sin fallos en `iphone`; escritorio a 0 px.
- [ ] **T2** · Composicion movil: las 15 fotos en vertical y en horizontal, sin la copia, con alto finito, `sizes` y `geometriaPx`
  - Fichero(s): `src/motion/landingLayoutMovil.ts`, `src/motion/LandingComposition.tsx`, `src/app/globals.css`
  - Comprobacion: CA3, CA4, CA5 y CA6 en los cinco perfiles; escritorio a 0 px y `currentSrc` igual. **Parada:** capturas de `iphone` (0, 1, 2 y 3 alturas), `iphone --horizontal` e `ipad-mini` para el visto bueno de Javi (respuesta 3).
- [ ] **T3** · Sin `GLSurface` ni Lenis en movil; contador por `window.scroll`; `depth` movil
  - Fichero(s): `src/motion/LandingComposition.tsx`
  - Comprobacion: CA7, CA8 y CA10; la entrada sigue funcionando (sin `.landing-photo` a `opacity: 0` en reposo); escritorio a 0 px y la entrada de escritorio frente a T0.
- [ ] **T4** · Disparador del panel al final
  - Fichero(s): `src/motion/LandingComposition.tsx`
  - Comprobacion: CA9 y CA13.
- [ ] **T5** · Wordmark y descriptor a su tamaño movil
  - Fichero(s): `src/motion/LandingComposition.tsx`, `src/app/globals.css`
  - Comprobacion: CA11, CA12 y CA15; blend y «wordmark dice SUQUIA» ok; escritorio a 0 px.
- [ ] **T6** · Fluidez con CPU x4
  - Comprobacion: CA14 (`--dispositivo iphone --cpu 4`).
- [ ] **T7** · Ojo de Javi (CA16)
  - Que: Javi en la preview de Vercel, en el iPhone 13 (vertical y horizontal) y el iPad mini en vertical, con `?diag` si hace falta.
  - Comprobacion: visto bueno anotado aqui con fecha.

## Cierre

- [ ] `node scripts/diagnostico.mjs` con build: sin fallos nuevos frente a T0 (CA1) y capturas a 0 px (CA2), salida guardada
- [ ] Seccion `landing-movil` y `navegacion` en los cinco perfiles
- [ ] `CLAUDE.md` y `docs/design-spec-v2.md`: el landing en movil (finito, nativo, sin GL) y los choques de la spec
- [ ] `docs/ESTADO.md`: M1, M4 y M13 cerrados si CA3-CA6 pasan
- [ ] Estado de `spec.md` → Implementada

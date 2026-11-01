# Tareas 016 · Atlas: mas zoom y visor de fotos

- **Plan:** `plan.md` (aprobado el 2026-11-01)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

## Medir

- [x] **T1** · Sonda de solo lectura `window.__atlas` (`state()`, `clusters()`, `latticeCount()`) y seccion `atlas` en el diagnostico, ejecutada sobre el codigo de hoy
  - Fichero(s): `src/motion/Atlas.tsx`, `scripts/diagnostico.mjs`
  - Comprobacion: `node scripts/diagnostico.mjs --medir /atlas` da la linea base. Hoy CA2 falla (R maximo ≈ 974 px) y CA4 no encuentra `[data-atlas-viewer]`. CA3 da una cifra de frames. Salida en `evidencia/AAAA-MM-DD_016-linea-base.txt`
  - **Hecho 2026-11-01.** Linea base: 8 de 20 en la seccion `atlas`, 0 errores de consola. Salida: `evidencia/2026-11-01_016-linea-base.txt` (resumen en `:74-79`; copiada por Javi desde el scratchpad, por la regla deny de `evidencia/**`). Cifras:
    - Encuadre por defecto: R 256 (minR 195, maxR 974), caja 1440x609. Reticula: 4423 puntos construidos y 3184 pintados.
    - Par de CA2: norte/05 y sol/01, en San Sebastian, a 40 m. Separarlo a 14 px pide R ≈ 2,24 M. Hoy, en 12 pasos de rueda R llega a 974 y el par sigue agrupado (grupo de 11 fotos).
    - **CA3 ya falla hoy:** 2 frames > 50 ms (el peor, 67 ms) durante la rueda hasta 974. Al maximo, la reticula de todo el globo tiene 48.630 puntos construidos y 43.004 pintados. Es justo lo que corrige T3.
    - CA4 a CA8: no hay visor, sale el panel de lista. Grupo elegido: america/01-04, con 04 (Xilitla) `city`.
    - CA10: 42 parejas exact necesitan zona y no existe `atlas-zones.json`. CA11 pasa (974 ≤ 4563). CA12: sin cita de OSM.
  - Un primer intento midio mal: `document.querySelector("main canvas")` cogia el canvas del landing, montado y oculto (caja 0), y los clics y la rueda caian fuera del globo. Corregido para tomar el `<main>` visible.
  - De paso, `existsSync` (`scripts/diagnostico.mjs:14`) ya se usa (CA10), y desaparece su aviso de import sin usar (paso 5 de `docs/ESTADO.md`). `npx eslint .` del repo entero todavia da 1 aviso, en otro fichero: `scripts/medir-carrusel.mjs:154`, `'S' is defined but never used` (medido el 2026-11-01)
- [x] **T2** · Centroides aprobados por Javi (Puerto Escondido `15.8720, -97.0767` y San Blas `9.5583, -78.9483`, `precision: "city"`) y "New York" → "New York City"
  - Fichero(s): `src/data/photos.ts:206,218,231,241,253` y `:368,380,390,400,410,420`
  - Comprobacion: tsc ok. La linea de cifras de `/atlas` pasa de 26 a 31 fotos, sin contar dos veces Nueva York. Aparecen dos marcas de grupo nuevas (`clusters()` de la sonda)
  - **Hecho 2026-11-01.** tsc ok y 0 `lat: null` en `src/data/photos.ts`. En `/atlas` (`next dev`, 1440x900, 0 errores de pagina), la linea de cifras dice `31 Photographs — 11 Cities — 5 Countries`. La sonda da 6 grupos en el encuadre por defecto, dos de ellos nuevos: Puerto Escondido (america/05-07) y San Blas (america/08-09). Salida en la conversacion

## Zoom

- [x] **T3** · Reticula acotada al viewport: `unproject`, indices anclados a la esfera y recorrido solo del rango visible. Sin tocar todavia el limite del zoom
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: con el encuadre por defecto, `latticeCount()` queda en ±2 % de la linea base. Con zoom maximo y una rotacion, frames > 50 ms ≤ los de la linea base. Invariante del buffer del canvas en verde
  - **Hecho 2026-11-01.** `node scripts/diagnostico.mjs --medir /atlas`: 9 de 20 (antes 8), 0 errores de consola y buffer del canvas = caja x dpr. Salida en el scratchpad, pendiente de copiar a `evidencia/2026-11-01_016-t3.txt`. Cifras:
    - **Encuadre por defecto:** 3184 puntos pintados, los mismos que en la linea base. Se recorren 15.617 candidatos (tierra y mar) dentro del rango visible.
    - **Rueda hasta R = 974 sobre San Sebastian:** 0 frames > 50 ms (antes 2) y el peor baja de 67 a 17 ms. CA3 pasa. Al maximo se recorren 26.911 puntos y se pintan 12.853. El "43.004 pintados" de la linea base no es comparable: el codigo viejo contaba tambien los puntos fuera del canvas.
    - **Mismos puntos, comprobado pixel a pixel.** Captura del canvas con el `Atlas.tsx` de `HEAD` y con el nuevo, en tres estados: encuadre por defecto, 6 pasos de rueda sin rotar y grupo de San Sebastian centrado a R = 974. 0 pixeles distintos (umbral 8/255) en los tres. Estado final identico en las dos: R 973,6, lambda0 -0,0340, phi0 0,7565. Scripts `shots.mjs` y `diff.mjs` en el scratchpad de la sesion; salida en la conversacion
  - La sonda cambia `built` por `visited` (puntos recorridos en la ultima pasada): ya no hay una reticula construida que contar
- [ ] **T4** · Script de mascaras locales: rasterizador extraido a funcion comun, zonas desde `photos.ts`, piramide por zona y `atlas-zones.json`. Dependencia `shapefile` (dev) y `atlas-source/` en `.gitignore`
  - Fichero(s): `scripts/generate-atlas-local-masks.mjs`, `scripts/generate-atlas-land-mask.mjs`, `package.json`, `.gitignore`, `public/atlas/local/`, `src/data/atlas-zones.json`
  - Comprobacion: salen 3 zonas (San Sebastian, Nueva York, San Miguel de Allende). Los PNG suman menos de 300 KB. `land-mask.png` regenerado da el mismo hash que el actual. Una captura de cada nivel, mirada a ojo: la costa de San Sebastian y Manhattan se reconoce
- [ ] **T5** · Deriva y umbral de inercia escalados por `min(1, 974 / R)`
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: con R ≤ 974, la deriva medida con la sonda (lambda0 en 2 s) es igual a la de la linea base. Con R forzado alto se mueve menos de 1 px/frame en pantalla
- [ ] **T6** · Mascaras locales en el dibujo: carga perezosa, mascara mas fina por punto y fundido de 200 ms al cargar (sin fundido con reduced motion)
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: sin cambiar aun el limite, ningun PNG local se pide en red (no se pasa de 4563). Forzando la carga, 0 errores de consola
- [ ] **T7** · `maxR` por posicion (limite de la mascara mas fina que cubre el centro, tope del R necesario de la zona), con vuelta al limite al salir de una zona. `ZOOM_MAX_MULT` se retira
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: seccion `atlas`, CA2 (par de 40 m de San Sebastian a mas de 14 px), CA3 (0 frames > 50 ms durante la rueda hasta el maximo), CA10 (0 parejas fuera de zona) y CA11 (R ≤ 4563 fuera de zona). Salida en `evidencia/AAAA-MM-DD_016-zoom.txt`
- [ ] **T8** · Cita de OpenStreetMap junto a la leyenda, solo en el atlas (`/credits` no se toca, decision de Javi)
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: CA12

## Visor

- [ ] **T9** · `AtlasMark` gana `capture` y `order`, y `page.tsx` ordena las marcas por album y foto
  - Fichero(s): `src/app/atlas/page.tsx`, `src/motion/Atlas.tsx` (tipo)
  - Comprobacion: tsc ok. `clusters()` devuelve los miembros de cada grupo en el orden del album
- [ ] **T10** · `AtlasViewer`: foto grande sin recortar, informacion (DMS solo si es `exact`), enlace al album, entrada en 200 ms y estado final directo con reduced motion
  - Fichero(s): `src/components/AtlasViewer.tsx`
  - Comprobacion: tsc y lint ok (todavia no se monta)
- [ ] **T11** · Tira de miniaturas a la misma altura, la actual con `scale`, flechas, ← →, Esc
  - Fichero(s): `src/components/AtlasViewer.tsx`
  - Comprobacion: tsc y lint ok
- [ ] **T12** · Visor montado en `Atlas.tsx` en lugar del panel de grupo y del `router.push` de la foto suelta; centro del globo desplazado al espacio libre mientras esta abierto
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: seccion `atlas`, CA4 a CA8. 0 errores de consola

## Cierre

- [ ] `docs/atlas-data-sources.md` (OSM, ODbL, regenerar), `docs/design-spec-v2.md` §5 y changelog, y `CLAUDE.md` (linea del atlas, licencia)
- [ ] `node scripts/diagnostico.mjs` en verde, salida guardada en `evidencia/AAAA-MM-DD_016-completo.txt` (CA1)
- [ ] Contra produccion despues del push de Javi: `evidencia/AAAA-MM-DD_016-produccion.txt`
- [ ] CA9: Javi lo prueba en su maquina y en el movil (testimonio aqui)
- [ ] Estado de `spec.md` → Implementada

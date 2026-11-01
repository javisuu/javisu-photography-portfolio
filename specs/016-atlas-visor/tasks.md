# Tareas 016 · Atlas: mas zoom y visor de fotos

- **Plan:** `plan.md` (aprobado el 2026-11-01)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

## Medir

- [ ] **T1** · Sonda de solo lectura `window.__atlas` (`state()`, `clusters()`, `latticeCount()`) y seccion `atlas` en el diagnostico, ejecutada sobre el codigo de hoy
  - Fichero(s): `src/motion/Atlas.tsx`, `scripts/diagnostico.mjs`
  - Comprobacion: `node scripts/diagnostico.mjs --medir /atlas` da la linea base. Hoy CA2 falla (R maximo ≈ 974 px) y CA4 no encuentra `[data-atlas-viewer]`. CA3 da una cifra de frames. Salida en `evidencia/AAAA-MM-DD_016-linea-base.txt`
- [ ] **T2** · Centroides aprobados por Javi (Puerto Escondido `15.8720, -97.0767` y San Blas `9.5583, -78.9483`, `precision: "city"`) y "New York" → "New York City"
  - Fichero(s): `src/data/photos.ts:206,218,231,241,253` y `:368,380,390,400,410,420`
  - Comprobacion: tsc ok. La linea de cifras de `/atlas` pasa de 26 a 31 fotos, sin contar dos veces Nueva York. Aparecen dos marcas de grupo nuevas (`clusters()` de la sonda)

## Zoom

- [ ] **T3** · Reticula acotada al viewport: `unproject`, indices anclados a la esfera y recorrido solo del rango visible. Sin tocar todavia el limite del zoom
  - Fichero(s): `src/motion/Atlas.tsx`
  - Comprobacion: con el encuadre por defecto, `latticeCount()` queda en ±2 % de la linea base. Con zoom maximo y una rotacion, frames > 50 ms ≤ los de la linea base. Invariante del buffer del canvas en verde
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

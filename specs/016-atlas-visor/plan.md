# Plan 016 · Atlas: mas zoom y visor de fotos

- **Spec:** `spec.md` (aprobada el 2026-11-01; enmienda 1, submapas locales, aprobada el 2026-11-01)
- **Plan aprobado** por Javi el 2026-11-01 ("OK"). Las respuestas a "Preguntas para Javi" estan en la enmienda 1 de `spec.md`

## Enfoque

Son dos piezas independientes que comparten fichero: el zoom con submapas locales y el visor. Primero se mide (seccion `atlas` del diagnostico, sobre el codigo de hoy). Despues el zoom, porque cambia el motor de dibujo. El visor va al final, porque es casi todo JSX nuevo.

### 1. Zoom: reticula acotada al viewport

Hoy `buildLattice` recorre el globo entero (`src/motion/Atlas.tsx:161-175`). A R = 974 px son unas 70k comprobaciones y a 5x pasarian de 1,7 M por reconstruccion. La reticula pasa a generarse **solo para la zona visible**:
- El paso angular sigue siendo `TARGET_PX / R` y solo cambia al reconstruir (deriva de R > 15 %, como hoy). Los indices se anclan a la esfera (`phi = LAT_MIN + k·delta`, `lambda = -PI + j·lngStep`), asi que los puntos no "nadan" al rotar.
- En cada frame se recorre solo el rango de `k` y `j` visible. El rango sale de una proyeccion inversa (`unproject`) del borde del viewport. Si el globo cabe entero en pantalla, el rango es el completo, igual que hoy.
- Coste: proporcional a los puntos en pantalla (≈ 1440x609 / 49 ≈ 18k como mucho), no al zoom.

### 2. Zoom: mascaras locales y limite por posicion

**Zonas (datos).** Un script nuevo, `scripts/generate-atlas-local-masks.mjs`, lee `src/data/photos.ts` y agrupa las coordenadas `exact` distintas que no se separan a R = 4563 px (con un margen de 1,5 sobre `CLUSTER_THRESHOLD_PX`). Medido hoy, salen tres zonas:

| Zona | Coordenadas distintas | Mas cercanas | Extension | R necesario |
|---|---|---|---|---|
| San Sebastian | 5 | 40 m | 4,6 km | ≈ 3,36 M px |
| Nueva York | 6 | 167 m | 9,6 km | ≈ 0,80 M px |
| San Miguel de Allende | 3 | 226 m | 0,5 km | ≈ 0,59 M px |

Biarritz, Galicia y Villaquiran no necesitan zona: o ya se separan a 4563 px o sus fotos tienen coordenadas identicas.

**Mascaras (piramide por zona).** Cada zona lleva 2 o 3 niveles de 1024x1024 (por ejemplo, 400 km a ~400 m/px, 40 km a ~40 m/px y, solo en San Sebastian, 8 km a ~8 m/px). Se generan niveles hasta que el limite de resolucion del ultimo supera el R necesario de la zona. Son PNG monocromo de pocas decenas de KB, que se guardan en `public/atlas/local/`. El script escribe tambien `src/data/atlas-zones.json`: zonas, niveles, bbox, fichero y R necesario. Las zonas se derivan de `photos.ts`, asi que una foto nueva no toca ningun componente: basta con volver a ejecutar el script, como `prepare-images`. CA10 avisa si alguien se olvida.

**Fuente.** `land-polygons-split-4326` de osmdata.openstreetmap.de (costa de OSM ya convertida en poligonos de tierra; ~900 MB en zip, descarga unica, gitignorada en `atlas-source/` igual que la GeoJSON de Natural Earth). Para leer el `.shp` hace falta el paquete `shapefile` como dependencia de **desarrollo**. El rasterizador se reutiliza de `scripts/generate-atlas-land-mask.mjs` (ray-casting con huecos), extraido a una funcion comun.
Descartado: la API Overpass por bbox, porque obliga a montar a mano los poligonos desde lineas de costa abiertas; y Natural Earth 10m, porque llega a ~1 km y no separa fotos a 40 m.

**Dibujo.** `sampleLand` elige, para cada punto, la mascara **mas fina que lo cubre** (local si esta cargada, si no la del mundo). Las mascaras locales se cargan perezosamente: la primera vez que R pasa de 4563 px con el centro dentro del nivel 1 de una zona. Cuando un nivel acaba de cargar, sus puntos aparecen con un fundido de 200 ms. Con reduced motion entran sin fundido.

**Limite del zoom.** `ZOOM_MAX_MULT` deja de existir como multiplicador del viewport. `maxR` pasa a depender de la posicion: es el limite de resolucion de la mascara mas fina que cubre el **centro** de la vista (14 px por pixel de mascara), tope del R necesario de la zona. Fuera de toda zona: 4563 px, absoluto (CA11). Si al rotar el centro sale a una zona mas basta y R queda por encima del nuevo limite, R vuelve al limite con la curva del recentrado (600 ms, ease-out); con reduced motion, al instante. `ZOOM_MIN_MULT` no cambia.

**Navegacion (sin cambiar el modelo).** El arrastre ya escala con `PI / R` (`:707-708`), y la inercia hereda esa velocidad. Lo que no escala es la deriva en reposo (1,5°/s, `:61`: a R = 3 M serian ~80.000 px/s) y el umbral de parada de la inercia (`:59`). Los dos se multiplican por `min(1, 974 / R)`. Hasta el zoom maximo de hoy, el comportamiento queda identico.

**Rueda.** De R = 256 a 3,36 M con el factor actual (`1.0015^-deltaY`, `:353`) salen unas 63 muescas. Se deja tal cual y lo juzga Javi (CA9). Si se queda largo, se acelera por encima de 4563 px.

### 3. Visor

Es un componente nuevo, `src/components/AtlasViewer.tsx`, declarativo. Sustituye el panel de grupo (`:881-927`) y el `router.push` de la foto suelta (`:805-808`):
- **Posicion:** fijo a la derecha, toda la altura del viewport, ancho `min(520px, 40vw)`. A 1440x900 tapa 520 de 1440 px del canvas (36 %): el X de CA6 se fija en **40 %**. Mientras esta abierto, el centro del globo se desplaza al centro del espacio libre (`cx = (w - anchoVisor) / 2`), con la misma curva del recentrado.
- **Foto grande:** `next/image` con tamano calculado de su `width`/`height`, sin `object-cover`, y que quepa en el alto libre (unos 560 px a 900). No se recorta (CA4).
- **Informacion:** titulo (serif, Title Case); `CIUDAD · PAIS` (etiqueta 12-13 px); datos de captura (14 px, `#666`); DMS solo si `precision === "exact"` (CA7, se reutiliza `toDMS`); y el enlace a su album (`/album/<slug>#photo-<n>`, como hoy).
- **Tira:** solo en grupos, con las miniaturas a la misma altura (56 px), enteras y de anchos distintos. La actual crece con `transform: scale` (regla de solo transform/opacity). Flechas ‹ ›, teclas ← → y Esc cierra. El orden es el del album y despues el de la foto: `page.tsx` ordena las marcas y el agrupado ya conserva ese orden (`:559-570`), que es lo que mide CA5.
- **Contenido fijo al abrir:** si luego el grupo se parte con el zoom, el visor no cambia. Un clic en otra marca sustituye el contenido.
- **Animacion:** entra con un fundido mas un desplazamiento de 16 px, en 200 ms. Con reduced motion aparece ya en su estado final (CA8).
- **Datos:** `AtlasMark` gana `capture` y `order`, que pasa `src/app/atlas/page.tsx`.

### 4. Sonda para el diagnostico

El canvas no tiene DOM que medir. `Atlas.tsx` expone una sonda de **solo lectura**, `window.__atlas = { state(), clusters(), latticeCount() }`: R, lambda0, phi0 y maxR; las posiciones en pantalla del ultimo frame; y los puntos de la ultima pasada. Se borra al desmontar. El diagnostico la usa para hacer clic en la marca de San Sebastian (que recentra), lanzar la rueda y leer la separacion. Las secciones `llegada al album` y `scroll del album` ya hacen algo parecido con `window.__llegada` y `window.__scroll`, aunque esas las instala el propio diagnostico.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/data/photos.ts` | modificar | Centroides en `:206,218,231,241,253` (ver "Preguntas para Javi", 2). "New York" → "New York City" en `:368,380,390,400,410,420` |
| `scripts/generate-atlas-local-masks.mjs` | crear | Zonas desde `photos.ts`, piramide de mascaras y `atlas-zones.json` |
| `scripts/generate-atlas-land-mask.mjs` | modificar | Extraer el rasterizador a una funcion reutilizable; la mascara del mundo sale identica byte a byte |
| `public/atlas/local/*.png` | crear (generado) | 7-8 mascaras, menos de 300 KB en total |
| `src/data/atlas-zones.json` | crear (generado) | Zonas, niveles, bbox y R necesario |
| `src/motion/Atlas.tsx` | modificar | Reticula acotada, `unproject`, mascaras locales, `maxR` por posicion con vuelta al limite, escalado de deriva e inercia, sonda, visor en lugar del panel y desplazamiento del centro |
| `src/components/AtlasViewer.tsx` | crear | Visor: foto, informacion, tira, flechas y teclado |
| `src/app/atlas/page.tsx` | modificar | `capture` y `order` en `AtlasMark`, y marcas ordenadas por album y foto |
| `scripts/diagnostico.mjs` | modificar | Seccion nueva `atlas`: CA2 a CA8 y CA10 a CA12 |
| `package.json` | modificar | `shapefile` en `devDependencies` |
| `.gitignore` | modificar | `atlas-source/` |
| `docs/atlas-data-sources.md` | modificar | Seccion de OSM: fuente, licencia ODbL, cita y como regenerar |
| `docs/design-spec-v2.md` | modificar | §5 (zoom, submapas y visor, sin panel de lista) y changelog |
| `CLAUDE.md` | modificar | Linea del atlas en "Build order" y nota de la licencia de OSM |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| **Costuras** entre niveles: donde termina una mascara local, la costa fina de OSM no casa con la de Natural Earth 110m | Alta | Medio | Cada nivel mide 10 veces el siguiente, asi que la costura queda lejos del centro cuando se nota. Lo juzga Javi (CA9). Si molesta, se funde el borde de cada nivel en sus ultimos 32 px |
| **San Miguel de Allende es interior:** de cerca, la mascara local es toda tierra, un campo uniforme de puntos sin geografia | Segura | Bajo | Es lo que dice el dato: no hay costa. Las 3 marcas se separan igual. Si Javi quiere algo mas (rios, lagos), es otra spec |
| Rendimiento de la reticula acotada en el borde del globo (el `unproject` de las esquinas cae fuera de la esfera) | Media | Medio | Si alguna esquina cae fuera del disco, se usa el rango completo de longitudes visibles. CA3 lo mide |
| Precision numerica a R ≈ 3 M | Baja | Medio | Con doubles, el error de `project()` a ese R es de ~1e-9 px. CA2 lo mide en la zona mas exigente |
| La deriva o la inercia sin escalar lanzan el globo a zoom alto | Alta si no se hace | Alto | Factor `min(1, 974/R)`. Lo comprueba una tarea propia (T5) |
| Descarga de ~900 MB y dependencia de desarrollo nueva | Segura | Bajo | Solo hace falta para regenerar. Lo que se commitea son los PNG y el JSON |
| ODbL: falta la cita | Baja | Alto (licencia) | CA12 la comprueba en el DOM |
| La sonda `window.__atlas` queda en produccion | Segura | Bajo | Es de solo lectura, no cambia nada y pesa unos bytes |

## Vuelta atras

- **Rama:** `feat/016-atlas-visor`, que crea Javi desde `main`.
- **Como se revierte:** el zoom y el visor van en commits separados (T3-T8 y T9-T12). Revertir los del zoom deja el limite de hoy; revertir los del visor deja el panel de lista. Los PNG y el JSON generados se van con su commit.
- **Que invariante avisaria de que esto ha roto algo:** el buffer del canvas del atlas = caja x dpr, 0 errores de consola en `/atlas`, sin barra de scroll en `/atlas` y la seccion nueva `atlas`.

## Preguntas para Javi (antes de implementar)

1. **Cita de OpenStreetMap.** Propuesta: una linea pequena en el atlas, junto a la leyenda ("Map data © OpenStreetMap contributors", 11 px, `#A8A8A8`), y en `docs/atlas-data-sources.md`. ¿Va tambien en `/credits`? Esa pagina esta cerrada y tiene 5 lineas.
2. **Centroides** (decision 1 de la spec), propuestos por el agente: **SIN VERIFICAR**, revisalos.
   - Puerto Escondido: `15.8720, -97.0767` (centro del pueblo)
   - San Blas: `9.5583, -78.9483` (El Porvenir, puerta del archipielago de Guna Yala). Si las fotos son de una isla concreta y prefieres su centro, dimelo.
3. **Observado, fuera de alcance:** la miniatura del hover recorta la foto a un cuadrado (`object-cover`, `src/motion/Atlas.tsx:865`), contra la regla dura de no recortar. Y "New York City" frente a "New York" (`src/data/photos.ts:356` frente a `:368`) cuenta NY como dos ciudades en la linea de cifras. ¿Entran en esta spec o se apuntan aparte?

## Verificacion

| Comprobacion | CA | Salida |
|---|---|---|
| Linea base de la seccion `atlas` sobre el codigo de hoy (zoom maximo, frames, panel) | CA2, CA3 y CA6 (base) | `evidencia/AAAA-MM-DD_016-linea-base.txt` |
| Seccion `atlas` despues del zoom (T3-T8) | CA2, CA3, CA10 y CA11 | `evidencia/AAAA-MM-DD_016-zoom.txt` |
| `node scripts/diagnostico.mjs` completo, al final | CA1, CA4-CA8 y CA12 | `evidencia/AAAA-MM-DD_016-completo.txt` |
| Lo mismo contra produccion, despues del push | CA1-CA8 y CA10-CA12 | `evidencia/AAAA-MM-DD_016-produccion.txt` |
| Javi en su maquina y en el movil | CA9 | Testimonio en `tasks.md` |

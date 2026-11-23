# Plan 022 · Notas del album en movil

- **Spec:** `spec.md` (aprobada el 2026-11-23)

## Enfoque

**Solo clases `movil:`, en dos ficheros.** En movil, la fila con texto se comporta como una fila sin texto, y el texto va debajo.

**La fila con texto** (`src/motion/AlbumPhotos.tsx:253-265`):
- **La rejilla** lleva `movil:contents`. Sus tres celdas (foto, pie, texto) pasan a ser hijas directas de la fila, que es `flex flex-col` con `items-start`, `items-center` o `items-end` segun la colocacion (`src/motion/AlbumPhotos.tsx:67-76`). Asi, foto y pie quedan alineados exactamente igual que en una fila sin texto, y la foto mide lo mismo (CA6). Ya no queda columna lateral que la estreche.
- **La fila** lleva `movil:gap-4`, el mismo hueco de 16 px que una fila sin texto (`src/motion/AlbumPhotos.tsx:277`). Hoy ese hueco lo pone la rejilla (`gap-y-4`), que con `contents` deja de contar.
- **La celda del texto** lleva `movil:self-start`, para quedarse en el margen izquierdo tambien en las filas desplazadas (respuesta 3), y `movil:mt-8`: 32 px que, con los 16 del hueco, dan los 48 px de aire (respuesta 2).

**Los textos** (`src/components/AlbumTexts.tsx`):
- **`SideNote`** lleva `movil:mt-0`, que anula el `md:mt-20` en el iPad. Su `max-w-[440px]` se queda.
- **`Quote`** lleva `movil:max-w-[300px]`, y su `<p>` `movil:text-[22px] movil:leading-[28px] movil:text-[#111111]` (respuesta 1). La raya de 24 px de encima se queda: el lienzo no la dibuja, pero tampoco dice que se quite. Se ve en las capturas de T2.

**Que gane `movil:` sobre `md:`.** Ya pasa en el sitio: `md:flex movil:hidden` en `src/components/AlbumPhotoNav.tsx:100` oculta la flecha en el iPad (spec 020). Tailwind v4 emite las variantes propias despues de las de su tema. Se comprueba en T1 con el valor computado. Si en algun caso no gana, se usa el modificador `!` solo en esa clase.

**Riesgo de `contents`: la foto dentro de su celda.** La `<img>` lleva `max-w-full` (`src/motion/AlbumPhotos.tsx:177`), y su celda pasa a ser un elemento flex con ancho segun su contenido. En una fila sin texto, en cambio, la `<img>` es hija directa de la fila. Si la celda no limita bien el ancho, la foto podria salirse. Por eso la celda de la foto lleva tambien `movil:max-w-full`, y CA6 compara su caja con la de una fila sin texto.

**La medicion: `scripts/lib/notasMovil.mjs`, nuevo.**
- Recorre los cuatro albumes y, por cada `[data-album-text][data-text-kind=beside]` y `[data-photo-quote]`, mide:
  - las cajas del texto, de la `<img>` de su fila y del pie;
  - el `left` del contenido de la fila;
  - en la cita, `font-size`, `line-height`, `font-style` y `color` computados.
- Sus comprobaciones son CA4, CA5, CA6 y CA7.
- **CA6:** el ancho esperado de la foto sale de la misma cuenta que una fila sin texto: `min(ancho natural, ancho util de la fila, 85vh × proporcion)`.
- Se llama desde `scripts/diagnostico.mjs` en modo dispositivo, como `landing-movil` (spec 021).
- En escritorio, la misma funcion guarda (`--notas-guardar <fichero>`) o compara (`--notas-comparar <fichero>`) las cajas a 1440 × 900 (CA3). Es el mismo patron que `--capturas-guardar` y `--capturas-comparar`.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/motion/AlbumPhotos.tsx` | modificar | Clases `movil:` en la fila con texto, la rejilla y sus celdas |
| `src/components/AlbumTexts.tsx` | modificar | `movil:mt-0` en `SideNote`; tamaño, interlineado, color y ancho de `Quote` en movil |
| `scripts/lib/notasMovil.mjs` | crear | Medicion de notas (CA3 a CA7) |
| `scripts/diagnostico.mjs` | modificar | Seccion `notas-movil` en modo dispositivo, y `--notas-guardar` / `--notas-comparar` en escritorio |
| `docs/design-spec-v2.md`, `CLAUDE.md` | modificar (cierre) | §3: en movil el texto va debajo del pie, con el estilo de cita de Album A |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| La foto se sale o encoge dentro de su celda con `contents` | Media | Foto mas pequeña o mas ancha que la pantalla | `movil:max-w-full` en la celda; CA6 y «fotos enteras» |
| Una clase `md:` gana a su `movil:` | Baja (ya probado en la spec 020) | El iPad sigue con la rejilla | Valor computado en T1; `!` si hace falta |
| `GLSurface` del album pinta la foto en la caja vieja un frame | Baja | Un parpadeo al cargar | Lee las cajas de las `<img>` en cada frame (`CLAUDE.md`); no se toca. La medida es de reposo |
| El escritorio cambia | Muy baja: todo va bajo `movil:` | Rompe la regla de escritorio identico | CA2 (capturas a 0 px) y CA3 (cajas al px) |
| El telefono cambia mas de lo esperado (la cita pasa de 16 a 22 px) | Es lo pedido (respuesta 1) | — | Capturas en T2 para Javi |

## Vuelta atras

- **Rama:** `feat/022-notas-album-movil`
- **Como se revierte:** `git revert` de los commits de T1 y T2. El diagnostico nuevo puede quedarse, porque solo mide.
- **Que invariante avisaria de que esto ha roto algo:**
  - en escritorio, CA2 (capturas) y CA3 (cajas de los textos);
  - en movil, «fotos enteras» y CA4 a CA6.

## Verificacion

- **T0:**
  - linea base de escritorio: `--capturas-guardar` y `--notas-guardar`;
  - los cinco perfiles moviles, con sus fallos de partida;
  - la medida de las notas antes del cambio.
- **Cada tarea:** su CA en los perfiles que toca, y escritorio a 0 px.
- **Cierre:** diagnostico con build en escritorio, mas los cinco perfiles.
- **Salidas:** en el scratchpad, como `2026-11-23_022-<tarea>-<perfil>.txt`. Javi las copia a `evidencia/`.

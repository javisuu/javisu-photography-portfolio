# Plan 009 · Ocultar la barra de scroll

- **Spec:** `spec.md` (aprobada el 2026-10-20)

## Enfoque

Primero se mide y despues se cambia. Se anade a `scripts/diagnostico.mjs` una seccion `barra de scroll` que abre un Chromium aparte sin `--hide-scrollbars`, y se ejecuta sobre el sitio de hoy. Tiene que dar rojo en CA2: `innerWidth - clientWidth > 0` en `/` y en el album. Si no da rojo, la invariante no sirve y se para aqui. Despues se oculta la barra solo en el documento, con dos reglas sobre `html` en `src/app/globals.css`:
- `scrollbar-width: none`, el estandar, para Chrome 121+ y Firefox
- `html::-webkit-scrollbar { display: none }`, para Safari y Chromium antiguo

Se vuelve a medir y CA2 a CA6 tienen que dar verde.

Alternativas descartadas:
- `overflow: hidden` en `html`: mata el scroll nativo, el teclado y Lenis.
- `scrollbar-gutter: stable`: reserva el hueco, justo lo contrario de lo que se busca.
- Selector universal `*` / `*::-webkit-scrollbar`: tambien ocultaria la barra de la lista de un cluster del atlas, y Javi quiere conservarla.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `scripts/diagnostico.mjs` | modificar | Seccion nueva `barra de scroll`, entre el bucle de rutas y `entrada /`. Abre un Chromium propio (`chromium.launch({ ignoreDefaultArgs: ["--hide-scrollbars"] })`) a 1440x900 y dpr 1, recorre las mismas `routes`, espera `SETTLE_MS` y mide CA2 a CA5 con `addInv`. Lo cierra antes de la entrada. El navegador y la pagina de las 29 invariantes actuales no cambian |
| `src/app/globals.css` | modificar | Regla `html { scrollbar-width: none; }` y `html::-webkit-scrollbar { display: none; }`, con un comentario en el estilo del fichero: por que se oculta solo en `html` y no en `*` (el atlas) |
| `specs/009-ocultar-barra-scroll/tasks.md` | modificar | Marcar las tareas |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| El landing se recoloca al ganar unos 15 px de ancho y una foto queda bajo el nombre, o se acerca a otra, distinto de la composicion aprobada | Media | Bajo, aceptado por Javi | CA8: Javi lo revisa a ojo. Las posiciones salen de `vw` y del ancho CSS real (`src/motion/LandingComposition.tsx:183-187`), asi que se escala en proporcion, no se rompe |
| Una foto se estira: el canvas GL a `innerWidth` frente a una caja visible distinta | Baja: sin barra, `innerWidth` es el ancho visible (`src/motion/GLSurface.tsx:231-234`) | Alto, Javi lo prohibe | CA5 mide cada `<img>` y la caja del canvas |
| Lenis deja de recibir la rueda o el teclado | Muy baja: el CSS solo cambia como se pinta la barra, no el overflow (medido: 600 px de scroll con y sin el CSS, scratchpad `2026-10-20_009-linea-base-barra.txt`) | Alto | CA3 y CA4, con reduced motion incluido |
| La seccion nueva alarga el diagnostico | Alta | Bajo | Un navegador mas y 6 rutas mas, unos 25 s. Solo mide; se mantiene aparte para no tocar la linea base de las 29 |
| Safari ignora `::-webkit-scrollbar` sobre `html` | Baja | Medio | SIN VERIFICAR: Javi no tiene Safari. Queda anotado en la spec |

## Vuelta atras

- **Rama:** `feat/009-ocultar-barra-scroll`
- **Como se revierte:** quitar las reglas de `html` en `src/app/globals.css`. La seccion del diagnostico se puede quedar, porque solo mide. Si se revierte el CSS, CA2 volvera a dar rojo, y es lo correcto.
- **Que invariante avisaria de que esto ha roto algo:** `scroll con rueda` y `scroll con teclado` (nuevas), `proporcion de las fotos` (nueva), `sin scroll horizontal` y `buffer del canvas = caja * dpr` (actuales), y la seccion `entrada /`.

## Verificacion

- T1 mide la linea base (CA2 en rojo): `evidencia/2026-10-20_009-linea-base.txt`
- T3 mide CA1 a CA7: `evidencia/2026-10-20_009-ocultar-barra-scroll.txt`
- CA8 es el testimonio de Javi, anotado en `tasks.md`

La regla deny `Write(evidencia/**)` de `.claude/settings.json:27` sigue en pie, asi que la salida va al scratchpad y la copia Javi, como en las specs 007 y 008.

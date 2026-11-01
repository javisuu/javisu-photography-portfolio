# Spec 015 · Pagina de album sin freno al hacer scroll

- **Estado:** Aprobada (Javi, 2026-11-01: "OK ambos revisados")
- **Fecha:** 2026-10-31
- **Requiere decision de Javi:** No. No toca el wordmark, el blend, el ciclo de vida de `GLSurface` ni el scroll infinito del landing: solo cambia las opciones de Lenis de la pagina de album

## Problema

En la pagina de album, el scroll frena cuando se baja rapido. Javi: "El efecto ese que impide scrollear agresivamente esta bien, pero es muy incomodo y limita la navegabilidad si el freno es muy potente", "Quita el efecto de ralentizado o bajalo mucho" (conversacion del 2026-10-31).

`AlbumPhotos` llama a `useLenis()` sin opciones (`src/motion/AlbumPhotos.tsx:60`), asi que Lenis usa su suavizado por defecto (`src/motion/useLenis.ts:38`). La cifra del retraso entre la rueda y la pagina: SIN VERIFICAR, se mide en T1.

Relacionado, sin confirmar: **B10**. Javi vio dos veces (desde NY y desde America) que NEXT ALBUM le dejaba al final del album nuevo, no arriba. En produccion, con Playwright, la pagina nueva empieza en `scrollY = 0` en las 8 pruebas (4 albumes, llegando al enlace con `scrollIntoView` o con 60 pasos de rueda; `next-scroll.mjs`, scratchpad de la sesion, salida en la conversacion). Hipotesis, SIN VERIFICAR: el clic llega mientras Lenis aun aplica inercia, y esa inercia sigue moviendo la pagina nueva.

## Objetivo

En la pagina de album, el scroll sigue a la rueda y al teclado casi sin retraso, tambien al bajar rapido. La curva GL de las fotos se sigue notando. NEXT ALBUM siempre deja el album nuevo arriba del todo.

## Fuera de alcance

- El landing (`useLenis({ infinite: true }, active)`, `src/motion/LandingComposition.tsx:322`) y el carrusel, que esta cerrado.
- `src/motion/GLSurface.tsx`. Si la curva GL deja de notarse, se ajusta `velocityNormalize` desde `AlbumPhotos` (prop ya existente, `src/motion/GLSurface.tsx:117-119`), no el renderizador.
- Quitar Lenis de la pagina de album. `GLSurface` lee la velocidad de Lenis para la curva (`src/motion/GLSurface.tsx:386-387`); sin Lenis, la curva desaparece. Solo se plantea si Javi no queda contento con un suavizado bajo.

## Zonas afectadas

- [x] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [x] Diagnostico (`scripts/diagnostico.mjs`): retraso del scroll y posicion tras NEXT ALBUM
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Landing, wordmark, carrusel, atlas, datos

## Choca con el spec

Nada. `docs/design-spec-v2.md` no fija el suavizado de la pagina de album. `prefers-reduced-motion` sigue igual: Lenis ya lo respeta y `useLenis` no aplica opciones con reduced motion (`src/motion/useLenis.ts:31-38`).

## Criterios de aceptacion

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs` | tsc, lint y build ok; 0 errores de consola; todas las invariantes en verde |
| CA2 | Seccion nueva del diagnostico: una rafaga de rueda en `/album/<slug>` (por ejemplo 20 pasos de 400 px cada 16 ms), muestreando `scrollY` por rAF | Retraso entre el scroll pedido y `scrollY` como mucho X ms; X se fija con la linea base de T1 y la prueba de Javi |
| CA3 | Misma seccion: NEXT ALBUM en los 4 albumes, con clic durante la inercia de una rafaga de rueda | `scrollY = 0` en la pagina nueva 500 ms despues del clic, en todos |
| CA4 | Secciones `barra de scroll` (rueda y teclado en el album, tambien con reduced motion) y `llegada al album` | Sin regresion |
| CA5 | La curva GL con el suavizado nuevo, misma rafaga | `lenis.velocity` normalizada (`/ velocityNormalize`) llega al menos a 0,5 en algun frame, para que la curva siga viendose |
| CA6 | Javi baja rapido por un album en su maquina | No nota el freno (testimonio) |

## Preguntas abiertas

1. ¿Cuanto suavizado se deja? Propuesta: medir la linea base y probar dos o tres valores de `lerp` en `npm run dev` hasta que Javi elija.
2. ¿B10 entra en esta spec, si la hipotesis de la inercia se confirma? Propuesta: si, porque es el mismo Lenis. Si no se reproduce, se deja abierto en `docs/ESTADO.md`.

# Roadmap

> Las fases salen del "Build order" de `CLAUDE.md`. Este fichero es el estado por fase; `docs/ESTADO.md` es el estado del dia.

Es un proyecto personal: no se miden horas y no hay fecha de entrega. Lo que importa es el orden.

## Calendario

| Fase | Que cierra la fase | Estado |
|---|---|---|
| F1 · Scaffold | Pagina vacia desplegada en Vercel, fuentes cargando | Hecha |
| F2 · Paginas estaticas | Las 6 rutas con su composicion aprobada, sin motion | Hecha |
| F3 · Motion | Inventario de motion del design spec completo | **En curso** |
| F4 · Pulido | Responsive, metadatos/OG, LCP < 2,5 s, CLS ~ 0, 60 fps en movil medio | Pendiente |

## F3 · Motion — detalle

| # | Tarea | Estado |
|---|---|---|
| 1 | Lenis, blend del nombre fijo, parallax por foto | Hecha |
| 2 | Entrada del landing (montaña de fotos y dispersion) | Hecha |
| 3 | Hover de imagen en el landing | Hecha |
| 4 | Efecto tubo con `GLSurface` en landing y pagina de album | Hecha |
| 5 | Carrusel infinito circular con su modelo de anclaje y commit | Hecha |
| 6 | Wordmark: descifrado en la llegada, nombre completo en hover | Hecha. Todo mecanismo de cambio de letra se retiro para siempre el 2026-09-26 (ADR pendiente de redactar) |
| 7 | Scramble de las etiquetas de navegacion | Hecha |
| 8 | Atlas: globo ortografico en canvas con retícula remuestreada | Hecha |
| 9 | Transicion carrusel→album (GSAP Flip) | Pendiente |
| 10 | Digitos rodantes | Pendiente |
| 11 | Flechas prev/next de foto | Pendiente |

## Pasada de 5 etapas (en curso, transversal)

| Etapa | Que | Estado |
|---|---|---|
| 1 | Limpieza de navegacion y descriptor de la home | Hecha |
| 2 | Datos de lugar por foto y jerarquia del pie de album | Hecha |
| 3 | Re-verificar `/about` y `/credits` contra el spec revisado | **Pendiente** (saltada a peticion de Javi) |
| 4 | Pagina `/atlas` | Hecha |
| 5 | Pasada de documentacion y commit | Pendiente |

## Deuda conocida

- Los numeros de Core Web Vitals son anteriores al landing persistente y al atlas de canvas: hay que volver a medirlos en F4.
- Falta redactar los ADR de las decisiones ya tomadas: stack, retirada de los efectos de cambio de letra en el wordmark, landing persistente desde el layout raiz, y atlas como globo en vez de mapa plano.

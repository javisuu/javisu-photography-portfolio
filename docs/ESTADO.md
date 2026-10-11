# Estado

> Fichero vivo. Lo lee `/estado` y lo actualiza `/cerrar-sesion`. Cada afirmacion lleva evidencia o `SIN VERIFICAR`. No se registran horas ni hay calendario por dias.

**Ultima actualizacion:** 2026-10-11
**Fase:** F3 · Motion (ver `docs/ROADMAP.md`). Landing, carrusel, pagina de album, About, Credits y Atlas estan dados por cerrados. Queda la pasada de 5 etapas a medias: la etapa 3 (re-verificar About y Credits) sigue sin hacer. Despues vienen la transicion carrusel→album, los digitos rodantes y la regla de hover sobre imagen.
**Rama:** `feat/001-diagnostico-corregir-medicion`, creada desde `feat/landing-gl-surface` · ultimo commit `b741d04` "Full name included in hover" · cambios sin commit (ver `git status`)

## Build

**Verde.** tsc ok · lint 0 errores, 1 aviso · build ok · consola: 0 errores en 6 rutas · invariantes: 29 de 29. Evidencia: `evidencia/2026-10-11_diagnostico_cierre.txt`.

El primer diagnostico del dia (`evidencia/2026-10-11_diagnostico.txt`, 17 de 27) estaba falseado por el propio harness. La spec `specs/001-diagnostico-corregir-medicion/` lo corrigio:
- El harness pedia las paginas desde `127.0.0.1`, y `next dev` responde 403 a los chunks JS que se piden desde cualquier origen que no sea `localhost`. Asi el cliente no llegaba a hidratarse.
- Habia tres invariantes mal medidos.
- El `next dev` del harness se quedaba vivo en Windows.

## Entregables

| # | Entregable | Estado | Evidencia |
|---|---|---|---|
| E1 | Scaffold, fuentes y despliegue en Vercel | Hecho | `CLAUDE.md` build order §1 |
| E2 | Paginas estaticas segun los mockups aprobados | Hecho: `/`, `/albums`, `/album/[slug]`, `/about`, `/credits`, `/atlas` | `CLAUDE.md` build order §2 |
| E3 | Motion | En curso. Hecho: Lenis, blend del nombre, parallax por foto, entrada, hover de imagen en el landing, efecto tubo (landing y album via `GLSurface`), carrusel infinito, descifrado del wordmark y scramble de etiquetas. Falta: transicion carrusel→album (GSAP Flip), digitos rodantes y flechas prev/next de foto | `CLAUDE.md` build order §3 |
| E4 | Pulido: responsive, metadatos/OG, Lighthouse | Pendiente | — |
| E5 | Infraestructura agentica (comandos, subagentes, SDD, diagnostico) | Hecha y estrenada. Primer ciclo SDD completo (spec 001). El diagnostico mide bien: los fallos que reportaba eran del propio harness | `specs/001-diagnostico-corregir-medicion/`, `evidencia/2026-10-11_diagnostico_cierre.txt` |

## Defectos abiertos

| # | Defecto | Bloquea | Estado | Evidencia |
|---|---|---|---|---|
| B1 | `react-hooks/exhaustive-deps`: falta la dependencia `anchorRestOffsetPx` en un `useEffect` | No | Abierto. Salida literal: `551:6  warning  React Hook useEffect has a missing dependency: 'anchorRestOffsetPx'. Either include it or remove the dependency array  react-hooks/exhaustive-deps` | `src/motion/AlbumsCarousel.tsx:551`, `evidencia/2026-10-11_diagnostico_cierre.txt:8` |
| B2 | "Al recargar, las fotos del landing parecen salir de arriba" | Por decidir | SIN VERIFICAR. Se reporto el 2026-09-27, cuando el landing estaba roto. El diagnostico de hoy da `landingHidden: 0` en reposo, pero no mide la trayectoria de la entrada. Hay que mirarlo a ojo o con `/medir-dom /` durante la entrada | `evidencia/2026-10-11_diagnostico_cierre.txt` (solo el estado en reposo) |
| B4 | INP 304 ms | No | SIN VERIFICAR. Se midio antes del landing persistente y no se sabe si con la pagina bien hidratada. Hay que volver a medirlo en F4 | `CLAUDE.md` (arquitectura del landing persistente) |
| B5 | `/album/america`: aviso de Next de que `/photos/america/01.avif` es el LCP y no lleva `loading="eager"` | No | Abierto. Es un aviso, no un error. Afecta al LCP (F4) | `evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt:130` |

**Cerrados el 2026-10-11:**
- **B3**, el buffer del canvas del atlas a 300x150. No existia: el cliente no se hidrataba en el harness. Medido con hidratacion: buffer `[1440,609]` = caja x dpr (`evidencia/2026-10-11_diagnostico_cierre.txt`).
- El crash de render del landing de septiembre (`REFERENCE_VIEWPORT_W` y otros dos identificadores) ya no existe: 0 ocurrencias en `src/`, tsc limpio.

## Bloqueos

- Ninguno tecnico. Algunos pasos dependen de material que tiene que escribir Javi (ver "Esperando a").

## Proximos pasos

1. Javi revisa la web en `localhost:3000` y decide si B2 sigue existiendo.
2. Commit de los cambios previos de `feat/landing-gl-surface`: la entrada en dos fases del landing y lo que queda de la capa agentica (revisados el 2026-10-11).
3. Arreglar B1 y pasar a exigir `npx eslint src --max-warnings=0` en el diagnostico.
4. **Atlas: plan de que se hace con el y como.** Primero una spec que fije el objetivo del atlas, y despues decidir la implementacion.
5. **Notas laterales en algunas fotos del album.** La referencia de estilo es `docs/referencias/2026-10-11_notas-laterales.png`; cuenta solo el estilo, no las fotos ni los textos. Muestra dos piezas: un parrafo largo en serif junto a una foto, con una raya y la firma "JAVIER SUQUIA" en versalitas gris, y una frase corta en cursiva gris precedida de una raya fina, al lado contrario de la foto. **El campo no existe todavia:** `Photo` (`src/data/photos.ts:47-60`) no tiene ningun campo de texto. Hay que crearlo (es una spec) y Javi tiene que escribir los textos.
6. **Quitar la barra de scroll del navegador**, confirmado por Javi el 2026-10-11. `src/app/globals.css` no la oculta hoy. Hace falta una spec: hay que ocultarla sin perder el scroll con teclado ni con rueda, y comprobarlo en el landing (Lenis), en los albumes y en el atlas.
7. **Mejorar efectos y navegabilidad.** Primero un inventario de lo que falla o falta. Cuenta lo pendiente de F3: transicion carrusel→album (GSAP Flip), digitos rodantes y flechas prev/next de foto.
8. **Version movil y iPad.** Hoy el sitio esta orientado a escritorio. Primero se mide: anadir viewports de movil (390x844) y iPad (820x1180) al diagnostico, y despues una spec por pagina segun lo que salga.
9. Etapa 3 de la pasada de 5: re-verificar `/about` y `/credits` contra el spec revisado.
10. Opcional: spec de prueba negativa para el diagnostico (`--autotest`).

## Esperando a

- Javi: biografia real de `/about` (hoy es `[PLACEHOLDER BIO]`, no inventar). Pedido el 2026-09-01
- Javi: handle de Instagram para `/about` (hoy `[PLACEHOLDER]`). Pedido el 2026-09-01
- Javi: textos de las notas laterales (parrafo largo y frase corta, ver el paso 5) y en que fotos van. Pedido el 2026-09-20. El campo para guardarlos no existe en `src/data/photos.ts`; lo crea la spec del paso 5
- Javi: las `lat`/`lng` que siguen a `null` en `src/data/photos.ts`, cuyas fotos no aparecen en el atlas. Pedido el 2026-09-23

## Pendiente de verificar

- Cuantas fotos siguen con `lat`/`lng` a `null`. `CLAUDE.md` dice "a handful", pero no hay recuento.
- Si la copia `copy-1` del scroll infinito sigue quedandose fuera de la entrada, como dice `CLAUDE.md`. Fuera de `/` el diagnostico ve 15 de 30 `landing-photo` a `opacity < 1` con el landing oculto. Es coherente con 15 participantes, pero no esta medido en `/`.
- Las cifras de Core Web Vitals (LCP 1,84 s, CLS 0, INP 304 ms) son de antes del landing persistente y del atlas de canvas.

## Registro de sesiones

| Fecha | Que se hizo | Evidencia |
|---|---|---|
| 2026-10-11 | Montada la infraestructura agentica: 6 comandos, 3 subagentes de solo lectura, ciclo SDD con plantillas, carpeta de evidencia y `scripts/diagnostico.mjs`. Comprobado que el crash de render del landing de septiembre ya no existe | `.claude/`, `specs/`, `scripts/diagnostico.mjs` |
| 2026-10-11 | Primer diagnostico (17 de 27) y `/verificar` de sus fallos. Spec 001: arreglada la medicion (origen `localhost`, wordmark, canvas, `<main>` en `/albums`, `next dev` huerfano, URL en errores). Diagnostico de cierre: 29 de 29. B3 cerrado. Se quitan del flujo las horas y el plan por dias | `evidencia/2026-10-11_diagnostico.txt`, `evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt`, `evidencia/2026-10-11_diagnostico_cierre.txt`, `specs/001-diagnostico-corregir-medicion/` |

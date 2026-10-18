# Estado

> Fichero vivo. Lo lee `/estado` y lo actualiza `/cerrar-sesion`. Cada afirmacion lleva evidencia o `SIN VERIFICAR`. No se registran horas ni hay calendario por dias.

**Ultima actualizacion:** 2026-10-18 (diagnostico del 2026-10-18, de cierre)
**Fase:** F3 · Motion (ver `docs/ROADMAP.md`). Landing, carrusel, pagina de album, About, Credits y Atlas estan dados por cerrados. Queda la pasada de 5 etapas a medias: la etapa 3 (re-verificar About y Credits) sigue sin hacer. Despues vienen la transicion carrusel→album, los digitos rodantes y la regla de hover sobre imagen.
**Rama:** `main` · ultimo commit `37ecf04`, el mismo que `origin/main` (push de Javi). El espejo publico esta en `6333a65`, que es `37ecf04` filtrado (comprobado el 2026-10-18 con `git ls-remote` frente a un filtrado local). Quedan dos ramas locales ya fusionadas en `main`, `feat/001-diagnostico-corregir-medicion` y `feat/landing-gl-surface` (`git branch --merged main`), que se pueden borrar con `git branch -d` cuando Javi lo decida. `feat/002-proteger-fotos` ya no existe y `feat/003-fijar-runner-mirror` se borro el 2026-10-18. Cada spec nueva sale en una rama propia desde `main`
**Repo:** privado en `github.com/javisuu/javisu-photography-portfolio-private` (Vercel despliega desde aqui). El nombre original `javisu-photography-portfolio` es el espejo publico sin fotos, que llena `.github/workflows/mirror.yml` en cada push a `main` (`specs/002-proteger-fotos/tasks.md`, seccion "Verificacion GitHub")

## Build

**Verde.** tsc ok · lint 0 errores, 1 aviso · build ok · consola: 0 errores en 6 rutas · invariantes: 29 de 29. Evidencia: `evidencia/2026-10-18_diagnostico_cierre.txt:194-199`, medido sobre `37ecf04`. Antes, `evidencia/2026-10-18_diagnostico.txt` (CA8 de la spec 003) y `evidencia/2026-10-17_diagnostico.txt` dieron el mismo resultado. En `/` salen 4 avisos `GPU stall due to ReadPixels` (`evidencia/2026-10-18_diagnostico_cierre.txt:48-51`). Son avisos y no errores, y salen en todas las evidencias desde el 2026-10-11.

El primer intento del 2026-10-17 se paro en `next dev` (`Another next dev server is already running`, PID 43156): era el `npm run dev` que seguia abierto desde la revision de la web. Se paro ese proceso y se repitio. El harness no comprueba antes si hay otro `next dev` en la carpeta.

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
| E6 | Proteger las fotos (spec 002): licencia, autoria en los metadatos, exclusion de IA, repo privado y espejo publico sin fotos | Hecho (2026-10-17). CA1 a CA12 verificados, spec Implementada | `specs/002-proteger-fotos/tasks.md` (secciones "Verificacion local" y "Verificacion GitHub"), `specs/002-proteger-fotos/spec.md:3` |
| E7 | Espejo con runner y acciones fijados (spec 003): `runs-on: ubuntu-24.04` y `actions/checkout@v5` (Node 24) | Hecho (2026-10-18). CA1 a CA8 verificados, spec Implementada. CA6 es testimonio de Javi | `specs/003-fijar-runner-mirror/tasks.md`, `evidencia/2026-10-18_003-fijar-runner-mirror.txt`, `.github/workflows/mirror.yml:21-23` |

## Defectos abiertos

| # | Defecto | Bloquea | Estado | Evidencia |
|---|---|---|---|---|
| B1 | `react-hooks/exhaustive-deps`: falta la dependencia `anchorRestOffsetPx` en un `useEffect` | No | Abierto. Salida literal: `551:6  warning  React Hook useEffect has a missing dependency: 'anchorRestOffsetPx'. Either include it or remove the dependency array  react-hooks/exhaustive-deps` | `src/motion/AlbumsCarousel.tsx:551`, `evidencia/2026-10-18_diagnostico_cierre.txt:8` |
| B2 | "Al recargar, las fotos del landing parecen salir de arriba" | Por decidir | SIN VERIFICAR. Se reporto el 2026-09-27, cuando el landing estaba roto. El diagnostico de hoy da `landingHidden: 0` en reposo, pero no mide la trayectoria de la entrada. Hay que mirarlo a ojo o con `/medir-dom /` durante la entrada | `evidencia/2026-10-11_diagnostico_cierre.txt` (solo el estado en reposo) |
| B4 | INP 304 ms | No | SIN VERIFICAR. Se midio antes del landing persistente y no se sabe si con la pagina bien hidratada. Hay que volver a medirlo en F4 | `CLAUDE.md` (arquitectura del landing persistente) |
| B5 | `/album/america`: aviso de Next de que `/photos/america/01.avif` es el LCP y no lleva `loading="eager"` | No | Intermitente. Salio el 2026-10-11, y no el 2026-10-15, el 2026-10-17 ni el 2026-10-18 (`evidencia/2026-10-18_diagnostico_cierre.txt` no lo recoge). Es un aviso, no un error. Se revisa en F4 (LCP) | `evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt:130` |
| B6 | En produccion (Vercel), la entrada del landing va a tirones hasta que termina de cargar todo | Por decidir | SIN VERIFICAR. Lo vio Javi a ojo el 2026-10-17, tras el despliegue de `50e3017`. La web carga con fotos (CA11 pasa). El diagnostico solo mide `localhost`, donde las fotos llegan al instante, asi que no puede verlo. Hipotesis sin medir: la red real retrasa la decodificacion de las 15 fotos `priority` que se unen al monton | Testimonio de Javi, `specs/002-proteger-fotos/tasks.md` (CA11) |

**Cerrados el 2026-10-11:**
- **B3**, el buffer del canvas del atlas a 300x150. No existia: el cliente no se hidrataba en el harness. Medido con hidratacion: buffer `[1440,609]` = caja x dpr (`evidencia/2026-10-11_diagnostico_cierre.txt`).
- El crash de render del landing de septiembre (`REFERENCE_VIEWPORT_W` y otros dos identificadores) ya no existe: 0 ocurrencias en `src/`, tsc limpio.

## Bloqueos

- Ninguno tecnico. Algunos pasos dependen de material que tiene que escribir Javi (ver "Esperando a").

## Proximos pasos

1. **Arreglar B1** (`src/motion/AlbumsCarousel.tsx:551`) y pasar a exigir `npx eslint src --max-warnings=0` en `scripts/diagnostico.mjs`. Spec corta. El carrusel esta dado por cerrado, asi que la spec tiene que demostrar que anadir `anchorRestOffsetPx` a las dependencias no cambia su comportamiento (o que hay que dejarlo fuera con un comentario `eslint-disable` justificado). Sale: `specs/004-.../`, el diagnostico con lint `ok`.
2. **Spec: el diagnostico contra la URL de produccion** (opcion `--url <base>` en `scripts/diagnostico.mjs`, sin `tsc`/`lint`/`build`, solo consola, invariantes y tiempos de la entrada del landing). Sin esto, B6 no se puede medir, y no se toca la entrada hasta tener la medida. De paso: que el harness avise si ya hay un `next dev` corriendo en la carpeta, en vez de esperar 90 s (`scripts/diagnostico.mjs:104`).
3. Javi revisa la web (`npm run dev`, y abrir `http://localhost:3000`, no `127.0.0.1`) y decide si B2 sigue existiendo. El cambio que lo arregla ya esta en el commit `ab72272`. Se puede mirar junto con B6.
4. **Atlas: siguiente iteracion.** El plan acordado ya esta escrito: `docs/design-spec-v2.md` §5 (globo ortografico, marcas por foto, clusters, rotacion, zoom, hover y enlace al album) y `docs/atlas-data-sources.md`. Esta implementado (`src/motion/Atlas.tsx`). Si Javi hablo de planes posteriores en otra conversacion, no estan en el repo: hay que recogerlos en una spec antes de tocar nada.
5. **Notas laterales en algunas fotos del album.** La referencia de estilo es `docs/referencias/2026-10-11_notas-laterales.png`; cuenta solo el estilo, no las fotos ni los textos. Muestra dos piezas: un parrafo largo en serif junto a una foto, con una raya y la firma "JAVIER SUQUIA" en versalitas gris, y una frase corta en cursiva gris precedida de una raya fina, al lado contrario de la foto. **El campo no existe todavia:** `Photo` (`src/data/photos.ts:47-60`) no tiene ningun campo de texto. Hay que crearlo (es una spec) y Javi tiene que escribir los textos. Si los textos no llegan, la spec puede crear el campo con `// PLACEHOLDER` y se pasa al paso 6.
6. **Quitar la barra de scroll del navegador**, confirmado por Javi el 2026-10-11. `src/app/globals.css` no la oculta hoy. Hace falta una spec: hay que ocultarla sin perder el scroll con teclado ni con rueda, y comprobarlo en el landing (Lenis), en los albumes y en el atlas.
7. **Mejorar efectos y navegabilidad.** Primero un inventario de lo que falla o falta. Cuenta lo pendiente de F3: transicion carrusel→album (GSAP Flip), digitos rodantes y flechas prev/next de foto.
8. **Version movil y iPad.** Hoy el sitio esta orientado a escritorio. Primero se mide: anadir viewports de movil (390x844) y iPad (820x1180) al diagnostico, y despues una spec por pagina segun lo que salga.
9. Etapa 3 de la pasada de 5: re-verificar `/about` y `/credits` contra el spec revisado.
10. Opcional: spec de prueba negativa para el diagnostico (`--autotest`).

## Esperando a

- Javi: biografia real de `/about` (hoy es `[PLACEHOLDER BIO]`, no inventar). Pedido el 2026-09-01
- Javi: handle de Instagram para `/about` (hoy `[PLACEHOLDER]`). Pedido el 2026-09-01
- Javi: textos de las notas laterales (parrafo largo y frase corta, ver el paso 5 de "Proximos pasos") y en que fotos van. Pedido el 2026-09-20. El campo para guardarlos no existe en `src/data/photos.ts`; lo crea la spec del paso 5
- Javi: las coordenadas de las 5 fotos que aun tienen `lat`/`lng: null` (Puerto Escondido x3 y San Blas x2, `src/data/photos.ts:155,167,179,189,201`). Las otras 26 de 31 ya las tienen. Pedido el 2026-09-23

## Pendiente de verificar

- `CLAUDE.md` y `docs/design-spec-v2.md:93` hablan de 32 fotos, pero `src/data/photos.ts` tiene 31 entradas `src:` (contadas el 2026-10-15).
- Si la copia `copy-1` del scroll infinito sigue quedandose fuera de la entrada, como dice `CLAUDE.md`. Fuera de `/` el diagnostico ve 15 de 30 `landing-photo` a `opacity < 1` con el landing oculto. Es coherente con 15 participantes, pero no esta medido en `/`.
- Las cifras de Core Web Vitals (LCP 1,84 s, CLS 0, INP 304 ms) son de antes del landing persistente y del atlas de canvas.

## Registro de sesiones

| Fecha | Que se hizo | Evidencia |
|---|---|---|
| 2026-10-11 | Montada la infraestructura agentica: 6 comandos, 3 subagentes de solo lectura, ciclo SDD con plantillas, carpeta de evidencia y `scripts/diagnostico.mjs`. Comprobado que el crash de render del landing de septiembre ya no existe | `.claude/`, `specs/`, `scripts/diagnostico.mjs` |
| 2026-10-11 | Primer diagnostico (17 de 27) y `/verificar` de sus fallos. Spec 001: arreglada la medicion (origen `localhost`, wordmark, canvas, `<main>` en `/albums`, `next dev` huerfano, URL en errores). Diagnostico de cierre: 29 de 29. B3 cerrado. Se quitan del flujo las horas y el plan por dias | `evidencia/2026-10-11_diagnostico.txt`, `evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt`, `evidencia/2026-10-11_diagnostico_cierre.txt`, `specs/001-diagnostico-corregir-medicion/` |
| 2026-10-11 | Commits `35f93df` (infraestructura y spec 001), `ab72272` (entrada del landing en dos fases) y `314c281` (capa agentica). Tareas nuevas en Proximos pasos: atlas, notas laterales, barra de scroll, efectos y navegabilidad, movil e iPad | `git log`, `docs/referencias/2026-10-11_notas-laterales.png` |
| 2026-10-15 | Diagnostico de cierre: verde, 29 de 29, 0 errores de consola, lint con 1 aviso (B1) | `evidencia/2026-10-15_diagnostico.txt` |
| 2026-10-15 | Recuento de coordenadas: 26 de 31 fotos tienen `lat`/`lng` y faltan 5 (`src/data/photos.ts:155,167,179,189,201`). Spec 002 redactada: repo privado y espejo publico sin fotos, licencia, copyright 2026 en los metadatos y exclusion de IA. Encontrada otra imagen con fotos en el historial: `docs/referencias/2026-10-11_notas-laterales.png`. Diagnostico de cierre: verde, 29 de 29 | `specs/002-proteger-fotos/spec.md`, `evidencia/2026-10-15_diagnostico_cierre.txt` |
| 2026-10-15 | Spec 002, parte local (commit `e3dad79`): `LICENSE` (MIT para el codigo, todos los derechos reservados para las fotos), `README.md` del espejo, autoria "Javier Suárez Suquía" en EXIF/XMP de los 31 AVIF (mismos pixeles, `photos.ts` sin cambios), `robots.ts` con 16 crawlers de IA excluidos, `noai, noimageai`, workflow `mirror.yml` y `/credits` con el nombre completo. CA1 a CA8 verificados. Diagnostico de cierre: verde, 29 de 29 | `specs/002-proteger-fotos/tasks.md`, `evidencia/2026-10-15_diagnostico_002.txt`, `evidencia/2026-10-15_diagnostico_cierre_002.txt` |
| 2026-10-17 | Spec 002, parte GitHub, cerrada. 0 forks. Commit `50e3017` y fusion fast-forward de `main` (`9bf0416..50e3017`). Javi renombro y privatizo el repo **antes** del push, para no publicar la captura de `docs/referencias/` ni los AVIF nuevos. Remoto actualizado y push de `main` (lo hizo Javi). Espejo creado y llenado por la Action manual. Pasan CA9 (hash `235968f`, igual al del filtrado local), CA10 (1 imagen, `land-mask.png`), CA11 y CA12. `CLAUDE.md` gana la seccion "Repo, licence and the public mirror" y la spec pasa a Implementada. Nuevo B6: tirones de la entrada en produccion. Diagnostico: verde, 29 de 29 | `specs/002-proteger-fotos/tasks.md`, `specs/002-proteger-fotos/spec.md:3`, `CLAUDE.md`, `evidencia/2026-10-17_diagnostico.txt` |
| 2026-10-17 | Commit de cierre `f4e8823`, fusionado en `main` y con push de Javi. La Action `mirror` se lanzo sola con el push, por primera vez, y llevo el espejo a `5ad12bf`: el mismo hash que filtrar `f4e8823` en local. El espejo funciona sin intervencion | `git log`, `git ls-remote` del espejo (salida en la conversacion; no hay copia en `evidencia/`) |
| 2026-10-18 | Spec 003 completa en una sesion: `mirror.yml` con `runs-on: ubuntu-24.04` y `actions/checkout@v5` (v4 corre en Node 20; v5 a v7, en Node 24). Commits `6544808` y `37ecf04`, fusion fast-forward y push de Javi. CA5: el espejo en `c98b101` coincide con el filtrado local de `6544808`, y despues en `6333a65` con el de `37ecf04`. CA7: en el historial del espejo solo queda `land-mask.png`. CA6: verde, sin anotaciones y en `ubuntu-24.04`, segun Javi (sin captura). Deuda en `ROADMAP.md`: la retirada futura de `ubuntu-24.04`. Rama `feat/003` borrada. Diagnostico de cierre: verde, 29 de 29 | `specs/003-fijar-runner-mirror/`, `evidencia/2026-10-18_003-checkout-runtimes.txt`, `evidencia/2026-10-18_003-fijar-runner-mirror.txt`, `evidencia/2026-10-18_diagnostico_cierre.txt` |

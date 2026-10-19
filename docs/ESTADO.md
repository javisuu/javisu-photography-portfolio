# Estado

> Fichero vivo. Lo lee `/estado` y lo actualiza `/cerrar-sesion`. Cada afirmacion lleva evidencia o `SIN VERIFICAR`. No se registran horas ni hay calendario por dias.

**Ultima actualizacion:** 2026-10-19, cierre de la correccion de `CLAUDE.md` (diagnostico de cierre copiado al scratchpad, pendiente de que Javi lo traslade a `evidencia/` — ver "Esperando a")
**Fase:** F3 · Motion (ver `docs/ROADMAP.md`). Landing, carrusel, pagina de album, About, Credits y Atlas estan dados por cerrados. Queda la pasada de 5 etapas a medias: la etapa 3 (re-verificar About y Credits) sigue sin hacer. Despues vienen la transicion carrusel→album, los digitos rodantes y la regla de hover sobre imagen.
**Rama:** `main` · ultimo commit local `d472008` (push de Javi llego hasta `bc283b0`; tras `d472008` sigue sin comparar `git fetch` en esta sesion, 2 ficheros sin commit: `CLAUDE.md` y `docs/ESTADO.md`, ver "Registro de sesiones"). Ramas locales ya fusionadas en `main`, que se pueden borrar con `git branch -d` cuando Javi lo decida: `feat/001-diagnostico-corregir-medicion`, `feat/landing-gl-surface`, `feat/004-lint-carrusel-deps`, `feat/005-diagnostico-produccion`, `feat/006-perfil-hidratacion` y `feat/007-vercel-image-resize` (`git branch --merged main`, medido 2026-10-18). Cada spec nueva sale en una rama propia desde `main`
**Repo:** privado en `github.com/javisuu/javisu-photography-portfolio-private` (Vercel despliega desde aqui). El nombre original `javisu-photography-portfolio` es el espejo publico sin fotos, que llena `.github/workflows/mirror.yml` en cada push a `main` (`specs/002-proteger-fotos/tasks.md`, seccion "Verificacion GitHub")

## Build

**Verde.** tsc ok · lint ok (sin avisos; desde la spec 004 el diagnostico exige `--max-warnings=0`) · build ok · consola: 0 errores en 6 rutas · invariantes: 29 de 29. Medido sobre `d472008` con `CLAUDE.md` y este fichero sin commit todavia; salida completa en el scratchpad de la sesion (`2026-10-19_diagnostico_cierre-claude-md.txt`), pendiente de copiar a `evidencia/` (ver "Esperando a"). En `/` siguen los 4 avisos `GPU stall due to ReadPixels`: avisos, no errores, presentes desde el 2026-10-11.

Medida de la entrada en este diagnostico (local, `next dev`, cache vacia, 1 repeticion): 7 participantes (confirma el numero que acaba de entrar en `CLAUDE.md`, antes decia 15), arranque 483 ms, fase B 1151 ms, reposo 1951 ms, 3 frames >50 ms. Son numeros mas altos que los de `evidencia/2026-10-18_diagnostico_cierre-007.txt` (arranque 250 ms, fase B 821 ms, reposo 1571 ms, 0 frames >50 ms): SIN VERIFICAR si es variacion normal de una medida local de 1 sola repeticion o una regresion real; no se abre defecto nuevo sin repetir la medida.

El primer diagnostico despues de cambiar las fotos dio 23 de 29. Las 6 rutas agotaron el timeout de 30 s de `page.goto` esperando el evento `load`, aunque el resto de invariantes de `/` pasaban (`evidencia/2026-10-18_diagnostico_007.txt:49-60`). Repetido sin cambios, salio verde (`evidencia/2026-10-18_diagnostico_007-b.txt:197-203`). Causa probable: la cache de `/_next/image` de `next dev` estaba fria con las URLs nuevas, y el landing se monta en todas las rutas. SIN VERIFICAR como causa unica.

Produccion (dominio publico `https://javisu-photography-portfolio.vercel.app`): 0 errores en 6 rutas y 29 de 29, con entrada en 167 ms (`evidencia/2026-10-18_diagnostico_produccion_007.txt:207-213`). Las URLs de cada despliegue (`...-<hash>-javisuus-projects.vercel.app`) estan protegidas con login y el diagnostico se niega a medirlas (spec 005). Que commit esta desplegado: `bc283b0`, o uno posterior que contiene sus fotos. Se deduce porque `/photos/america/01.jpg` responde 200 y ese fichero solo existe desde `bc283b0` (`evidencia/2026-10-18_007-produccion.txt:1`).

Desde la spec 005, si ya hay un `next dev` en la carpeta el diagnostico lo dice y sale con 2 en vez de esperar 90 s (`evidencia/2026-10-18_005-diagnostico-produccion.txt`, CA5).

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
| E8 | Medida de produccion (specs 005 y 006): `diagnostico.mjs --url` y `--repeticiones`, seccion `entrada /`, y `scripts/perfil-arranque.mjs` (trace del frame del arranque) | Hecho (2026-10-18). Specs Implementadas, CA1 a CA8 de cada una | `specs/005-diagnostico-produccion/`, `specs/006-perfil-hidratacion/`, `evidencia/2026-10-18_005-diagnostico-produccion.txt`, `evidencia/2026-10-18_006-perfil-hidratacion.txt` |
| E9 | Imagenes redimensionadas en produccion (spec 007): fotos de origen en JPEG (mozjpeg q86) en vez de AVIF, porque Vercel no transforma un AVIF de origen | Hecho (2026-10-18). CA1 a CA9 verificados (CA1 a CA5 en produccion), spec Implementada | `specs/007-vercel-image-resize/tasks.md` (T8), `evidencia/2026-10-18_007-hipotesis.txt`, `evidencia/2026-10-18_007-produccion.txt`, `evidencia/2026-10-18_007-perfil-produccion.txt` |

## Defectos abiertos

| # | Defecto | Bloquea | Estado | Evidencia |
|---|---|---|---|---|
| B2 | "Al recargar, las fotos del landing parecen salir de arriba" | Por decidir | SIN VERIFICAR. Se reporto el 2026-09-27, cuando el landing estaba roto. El diagnostico de hoy da `landingHidden: 0` en reposo, pero no mide la trayectoria de la entrada. Hay que mirarlo a ojo o con `/medir-dom /` durante la entrada | `evidencia/2026-10-11_diagnostico_cierre.txt` (solo el estado en reposo) |
| B4 | INP 304 ms | No | SIN VERIFICAR. Se midio antes del landing persistente y no se sabe si con la pagina bien hidratada. Hay que volver a medirlo en F4 | `CLAUDE.md` (arquitectura del landing persistente) |
| B5 | `/album/america`: aviso de Next de que `/photos/america/01.avif` (hoy `.jpg`, spec 007) es el LCP y no lleva `loading="eager"` | No | Intermitente. Salio el 2026-10-11, y no el 2026-10-15, el 2026-10-17 ni el 2026-10-18 (`evidencia/2026-10-18_diagnostico_cierre.txt` no lo recoge). Es un aviso, no un error. Se revisa en F4 (LCP) | `evidencia/2026-10-11_001-diagnostico-corregir-medicion.txt:130` |
Salida literal del diagnostico de cierre (`evidencia/2026-10-18_diagnostico_cierre-007.txt:197-203`):

```
=== RESUMEN ===
tsc          ok
lint         ok
build        ok
consola      0 errores en 6 rutas
invariantes  29 de 29
entrada      arranque 250 ms · fase B 821 ms · reposo 1571 ms · frames >50 ms: 0
```

**Cerrado el 2026-10-18:**
- **B6**, los tirones de la entrada del landing en produccion. Vercel devolvia tal cual un AVIF de origen, a 2500 px, pidiera el ancho que pidiera; en cambio, un PNG del mismo despliegue si lo redimensionaba (`evidencia/2026-10-18_007-hipotesis.txt:3-35`). Spec 007: las fotos de origen pasan a JPEG. Ahora produccion sirve WebP del ancho pedido (`evidencia/2026-10-18_007-produccion.txt`). En el dominio publico, la decodificacion del frame del arranque baja de 382 a 28 ms y el frame, de 817 a 150 ms (medianas de 3, `evidencia/2026-10-18_007-perfil-produccion.txt:84-93`, frente a `evidencia/2026-10-18_006-perfil-produccion.txt:86-96`). Por que Vercel no transforma un AVIF de origen: SIN VERIFICAR, no se encontro en su documentacion.
- **B1**, la dependencia `anchorRestOffsetPx` que faltaba en `src/motion/AlbumsCarousel.tsx:551`. Anadida. La geometria del carrusel es identica al pixel antes y despues (29 frames, en reposo y tras ArrowRight) y lint sale limpio (`evidencia/2026-10-18_004-lint-carrusel-deps.txt`, `evidencia/2026-10-18_diagnostico_004.txt`).

**Cerrados el 2026-10-11:**
- **B3**, el buffer del canvas del atlas a 300x150. No existia: el cliente no se hidrataba en el harness. Medido con hidratacion: buffer `[1440,609]` = caja x dpr (`evidencia/2026-10-11_diagnostico_cierre.txt`).
- El crash de render del landing de septiembre (`REFERENCE_VIEWPORT_W` y otros dos identificadores) ya no existe: 0 ocurrencias en `src/`, tsc limpio.

## Bloqueos

- Ninguno tecnico. Algunos pasos dependen de material que tiene que escribir Javi (ver "Esperando a").

## Proximos pasos

1. Javi revisa la web (`npm run dev`, y abrir `http://localhost:3000`, no `127.0.0.1`) y decide si B2 sigue existiendo. El cambio que lo arregla ya esta en el commit `ab72272`. Si lo sigue viendo, se mide con la seccion `entrada /` del diagnostico, que ya da las fases de la entrada.
2. **Spec del harness: guardar la evidencia y la cache fria.** Hay dos problemas:
   - La regla deny `Write(evidencia/**)` de `.claude/settings.json:27` impide que el agente redirija la salida de `diagnostico.mjs` a `evidencia/`. En la spec 007 la tuvo que copiar Javi.
   - El primer diagnostico despues de cambiar fotos agota el timeout de `page.goto` (`evidencia/2026-10-18_diagnostico_007.txt:49-60`).

   Propuesta: una opcion `--salida <fichero>` en `scripts/diagnostico.mjs` y en `scripts/perfil-arranque.mjs`, y calentar `/_next/image` antes de medir. Sale `specs/008-.../`. Depende de que Javi decida como se escribe en `evidencia/` (ver "Esperando a"). Mientras no lo decida, la salida va al scratchpad y Javi la copia (otra vez el 2026-10-19: `2026-10-19_diagnostico_cierre-claude-md.txt`).
3. **Atlas: siguiente iteracion.** El plan acordado ya esta escrito: `docs/design-spec-v2.md` §5 (globo ortografico, marcas por foto, clusters, rotacion, zoom, hover y enlace al album) y `docs/atlas-data-sources.md`. Esta implementado (`src/motion/Atlas.tsx`). Si Javi hablo de planes posteriores en otra conversacion, no estan en el repo: hay que recogerlos en una spec antes de tocar nada.
4. **Notas laterales en algunas fotos del album.** La referencia de estilo es `docs/referencias/2026-10-11_notas-laterales.png`; cuenta solo el estilo, no las fotos ni los textos. Muestra dos piezas: un parrafo largo en serif junto a una foto, con una raya y la firma "JAVIER SUQUIA" en versalitas gris, y una frase corta en cursiva gris precedida de una raya fina, al lado contrario de la foto. **El campo no existe todavia:** `Photo` (`src/data/photos.ts:47-60`) no tiene ningun campo de texto. Hay que crearlo (es una spec) y Javi tiene que escribir los textos. Si los textos no llegan, la spec puede crear el campo con `// PLACEHOLDER` y se pasa al paso 5.
5. **Quitar la barra de scroll del navegador**, confirmado por Javi el 2026-10-11. `src/app/globals.css` no la oculta hoy. Hace falta una spec: hay que ocultarla sin perder el scroll con teclado ni con rueda, y comprobarlo en el landing (Lenis), en los albumes y en el atlas.
6. **Mejorar efectos y navegabilidad.** Primero un inventario de lo que falla o falta. Cuenta lo pendiente de F3: transicion carrusel→album (GSAP Flip), digitos rodantes y flechas prev/next de foto.
7. **Version movil y iPad.** Hoy el sitio esta orientado a escritorio. Primero se mide: anadir viewports de movil (390x844) y iPad (820x1180) al diagnostico, y despues una spec por pagina segun lo que salga.
8. Etapa 3 de la pasada de 5: re-verificar `/about` y `/credits` contra el spec revisado.
9. Opcional: spec de prueba negativa para el diagnostico (`--autotest`).

## Esperando a

- Javi: biografia real de `/about` (hoy es `[PLACEHOLDER BIO]`, no inventar). Pedido el 2026-09-01
- Javi: handle de Instagram para `/about` (hoy `[PLACEHOLDER]`). Pedido el 2026-09-01
- Javi: textos de las notas laterales (parrafo largo y frase corta, ver el paso 5 de "Proximos pasos") y en que fotos van. Pedido el 2026-09-20. El campo para guardarlos no existe en `src/data/photos.ts`; lo crea la spec del paso 5
- Javi: las coordenadas de las 5 fotos que aun tienen `lat`/`lng: null` (Puerto Escondido x3 y San Blas x2, `src/data/photos.ts:155,167,179,189,201`). Las otras 26 de 31 ya las tienen. Pedido el 2026-09-23
- Javi: como se guarda la evidencia en `evidencia/`. Opciones: que los scripts la escriban con `--salida`, ajustar la regla deny de `.claude/settings.json:27`, o seguir copiandola a mano (paso 3). Pedido el 2026-10-18

## Pendiente de verificar

- `CLAUDE.md` y `docs/design-spec-v2.md:93` hablan de 32 fotos, pero `src/data/photos.ts` tiene 31 entradas `src:` (contadas el 2026-10-15).
- Por que Vercel no transforma un AVIF de origen (`evidencia/2026-10-18_007-hipotesis.txt:20-35`). Ya no afecta al sitio, pero cualquier foto nueva tiene que entrar en JPEG o PNG (`scripts/prepare-images.mjs`).
- Que el espejo en `d9eef61` sea `bc283b0` filtrado (no se comparo con un filtrado local).
- Que la cache fria de `/_next/image` sea la unica causa del primer diagnostico rojo de la spec 007.
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
| 2026-10-18 | Spec 004: anadida `anchorRestOffsetPx` a las dependencias del efecto del carrusel; geometria identica al pixel; el diagnostico exige lint sin avisos y sale con 1 si los hay. B1 cerrado. Commit `76a2757` | `specs/004-lint-carrusel-deps/`, `evidencia/2026-10-18_004-lint-carrusel-deps.txt`, `evidencia/2026-10-18_diagnostico_004.txt` |
| 2026-10-18 | Spec 005: `diagnostico.mjs --url` y `--repeticiones` (sin tsc/lint/build ni `next dev`; sale con 2 ante una URL protegida o un `next dev` que muere) y seccion `entrada /`. Primera medida de B6 en el dominio publico: frame del arranque de 917-1117 ms. Commit `d82d59f` | `specs/005-diagnostico-produccion/`, `evidencia/2026-10-18_005-diagnostico-produccion.txt`, `evidencia/2026-10-18_diagnostico_produccion.txt` |
| 2026-10-18 | Spec 006: `scripts/perfil-arranque.mjs` (trace de Chromium del frame del arranque). Causa de B6: `createImageBitmap` decodifica 22 AVIF de 2500 px en el hilo principal, porque Vercel los sirve sin redimensionar. Commit `033fa0a`. Ningun push en la sesion (`main` va 4 por delante de `origin`). Diagnostico de cierre: verde, 29 de 29 | `specs/006-perfil-hidratacion/`, `evidencia/2026-10-18_006-perfil-produccion.txt`, `evidencia/2026-10-18_006-perfil-hidratacion.txt`, `evidencia/2026-10-18_diagnostico_cierre-006.txt` |
| 2026-10-18 | Spec 007, con la enmienda 1 aprobada:
<br>• Vercel redimensiona un PNG, pero devuelve tal cual un AVIF de origen.
<br>• Las 31 fotos se regeneran en JPEG desde `photos-master/`, con la misma medida y autoria; se borran los AVIF y `photos.ts` solo cambia de extension.
<br>• Commit `bc283b0`, fusion fast-forward y push de Javi.
<br>• En produccion llegan WebP del ancho pedido. Frame del arranque: de 817 a 150 ms. Decodificacion: de 382 a 28 ms.
<br>• B6 cerrado.
<br>• Javi copio la evidencia a mano: la regla deny `Write(evidencia/**)` bloquea la redireccion del agente.
<br>• Diagnostico de cierre: verde, 29 de 29 | `specs/007-vercel-image-resize/`, `evidencia/2026-10-18_007-hipotesis.txt`, `evidencia/2026-10-18_007-produccion.txt`, `evidencia/2026-10-18_007-perfil-produccion.txt`, `evidencia/2026-10-18_diagnostico_cierre-007.txt` |
| 2026-10-19 | Solo documentacion, sin spec (no toca codigo). Cuatro afirmaciones de `CLAUDE.md` corregidas contra lo ya medido: (1) la decodificacion de textura con `createImageBitmap` no es fuera del hilo principal con un `<img>` como fuente, (2) la entrada tiene 7 participantes de los 15 candidatos copy-0, no 15, (3) GSAP esta en "Stack" como decidido pero no esta instalado en `package.json`, (4) los `src` de `photos.ts` son cadenas de texto, no imports estaticos. El diagnostico de cierre confirma el punto 2: `participantes 7` esta vez tambien. Diagnostico de cierre: verde, 29 de 29, pero sin copiar a `evidencia/` (regla deny), copiado al scratchpad de la sesion en su lugar | `CLAUDE.md`, scratchpad de la sesion: `2026-10-19_diagnostico_cierre-claude-md.txt` |

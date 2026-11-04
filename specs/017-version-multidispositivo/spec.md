# Spec 017 · Version multidispositivo: medir iPhone e iPad

- **Estado:** Aprobada por Javi el 2026-11-03 ("aprobado"), con las preguntas 1 a 8 respondidas
- **Fecha:** 2026-11-03
- **Requiere decision de Javi:** No para esta spec, que solo mide y no toca `src/`. Las specs de arreglo que salgan de ella si pueden necesitarla: el landing en movil roza el scroll infinito y `GLSurface`, y el candidato 2 de B7 es `GLSurface` (`docs/ESTADO.md`, "Proximos pasos", paso 1)

## Problema

El sitio nunca se ha medido fuera de un escritorio, y lo poco que se sabe del movil es malo.

- **Testimonio de Javi (2026-11-03):**
  - "En la version movil ni se ve ninguna foto de la landing". SIN VERIFICAR con medida: es lo primero que tiene que confirmar o refutar esta spec.
  - Del atlas en movil: "me parecio ir un poco menos fluido", y "puede que el mapa en movil sea mas pesado".
  - Contrasta con lo que dijo la gente, que "en movil es lo unico que va" (`specs/016-atlas-visor/spec.md:10`).
- **El diagnostico solo mira escritorio.** Todas sus paginas y contextos abren a 1440x900, con `deviceScaleFactor: 1`, sin tactil y en Chromium (`scripts/diagnostico.mjs:59-60`, `:205`, `:329`, `:482`, `:583`, `:626`, `:708`, `:809`, `:924`, `:990`, `:1124`). La unica excepcion es un cambio a 1300x900 (`scripts/diagnostico.mjs:1027`). Ninguna de las 174 invariantes (`docs/ESTADO.md`, "Build") se ha comprobado en un viewport estrecho, con dpr mayor que 1, con eventos tactiles ni en WebKit, que es el motor de todo navegador en iOS y iPadOS.
- **El design spec pide un movil "bueno"** y "60fps on mid-range mobile" (`docs/design-spec-v2.md:115-116`). F4 lo tiene pendiente (`docs/ROADMAP.md`, tabla de fases), y Javi lo adelanto el 2026-11-02 (`docs/ESTADO.md`, "Proximos pasos", paso 1).
- **Lo que hay hoy para pantallas estrechas es poco y nunca se ha medido:**
  - Landing: por debajo de 900 px de ancho, cada foto mide `min(w·2,4, 85vw)` (`src/app/globals.css:61-65`). Solo esta comprobado el punto de reunion del monton, en una ventana de 615x694 (`docs/design-spec-v2.md:160`). Los participantes de la entrada son las fotos cuya posicion final cae en pantalla (`CLAUDE.md`, arquitectura del landing persistente). En movil no se sabe cuantas son.
  - Pagina de album: la rejilla alterna solo desde `md:` (768 px). Por debajo, foto, pie y textos se apilan (`src/motion/AlbumPhotos.tsx:192-227`, `docs/design-spec-v2.md:56`). Las flechas prev/next van `hidden ... md:flex` (`src/components/AlbumPhotoNav.tsx:89`). Un iPad en vertical (768-834 px) cae justo encima del corte.
  - Carrusel: se mueve con rueda (`src/motion/AlbumsCarousel.tsx:886`), teclado (`:865`) y arrastre con puntero (`:890-939`), con `touchAction: "pan-y"` (`:936`). Que un deslizamiento con el dedo lo mueva: SIN VERIFICAR.
  - Wordmark: el hover solo existe con `hover: hover` (`src/app/globals.css:121-136`). En tactil no hay pie con el nombre completo, a proposito.
  - Atlas: el canvas lleva `touch-none` (`src/motion/Atlas.tsx:1513`). El visor mide `min(520, max(min(280, vw), 0,4·vw))` (`src/components/AtlasViewer.tsx:36-38`): 280 px en un movil de 390. Como encaja en vertical quedo para esta pasada (`specs/016-atlas-visor/spec.md:37`, `:74`; `specs/016-atlas-visor/tasks.md:220`).

## Objetivo

El diagnostico mide el sitio en iPhone e iPad, en vertical y en horizontal, con su dpr y con tactil, en WebKit y en Chromium. Deja en `evidencia/` una linea base con:
- las invariantes que pasan y las que fallan, por dispositivo y por ruta;
- cuantas fotos se ven en el landing;
- la fluidez del atlas y de la entrada con la CPU limitada.

De esa linea base sale la lista de specs de arreglo, una por pagina, que se abren despues. Javi lo prueba ademas en su iPhone y en un iPad.

## Dispositivos

Los perfiles de Playwright 1.64 (`playwright.devices`). Su viewport es el area visible con la barra del navegador descontada, no la pantalla entera. Comprobado el 2026-11-03 con `node -e` sobre `devices[...]`:

| Clave | Perfil de Playwright | Vertical | dpr | Por que |
|---|---|---|---|---|
| `iphone` | iPhone 13 | 390x664 | 3 | iPhone 13, 14, 15 y 16 de tamaño base |
| `iphone-max` | iPhone 15 Pro Max | 430x739 | 3 | El iPhone mas ancho |
| `ipad-mini` | iPad Mini | 768x1024 | 2 | El iPad de Javi (mini 5ª gen.). Cae exactamente en el corte `md:` de Tailwind |
| `ipad` | iPad Pro 11 | 834x1194 | 2 | iPad de tamaño medio |

Cada uno en vertical y en horizontal (`devices["<perfil> landscape"]`). Cada combinacion en WebKit y en Chromium: 16 pasadas. WebKit 27.2 (`webkit-2370`) quedo instalado el 2026-11-03 con `npx playwright install webkit`, y crea contextos WebGL2. Hay un limite: es WebKit de escritorio para Windows, no Safari de iOS. Por eso el testimonio de Javi (CA12) sigue haciendo falta.

## Fuera de alcance

- **Arreglar nada en `src/`**, por decision de Javi (2026-11-03): "por ahora solo medicion". Cada arreglo va en su propia spec (`specs/018-...` en adelante), con decision de Javi si toca alguna de las cuatro zonas sensibles. Para Javi lo primero es el landing, no el visor del atlas.
- El diseño del landing propio para movil que preve el design spec (`docs/design-spec-v2.md:115`). Se decide con la linea base delante.
- Como encaja el visor del atlas en vertical (decision 3 de la spec 016). Aqui solo se mide si rompe.
- Android: Javi pide iPhone 13 en adelante e iPad.
- Lighthouse y Core Web Vitals en movil: son de F4 (`docs/ROADMAP.md`, "Deuda conocida").
- El escritorio: sus invariantes, su viewport de 1440x900 y su navegador (Chromium) no cambian.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores): se mide, no se toca
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`): se mide, no se toca
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`): se mide, no se toca
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`): se mide, no se toca
- [ ] Atlas (`src/app/atlas/`): se mide, no se toca
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`): se mide, no se toca
- [ ] Datos (`src/data/photos.ts`)
- [x] Harness: `scripts/diagnostico.mjs`, que no esta en la lista de la plantilla
- [x] Documentacion: `docs/ESTADO.md` con la linea base y la lista de specs que salen de ella

## Choca con el spec

Nada. La spec no cambia el sitio. Las reglas duras de `CLAUDE.md` pasan a comprobarse tambien en iPhone e iPad: fotos sin recortar y enteras en el viewport, `prefers-reduced-motion` respetado y sin parallax de cursor. Cualquier fallo que salga es un defecto del sitio, no un cambio de regla.

## Criterios de aceptacion

`<disp>` es una clave de "Dispositivos". Los nombres de los flags (`--dispositivo`, `--horizontal`, `--motor`, `--cpu`) los fija el plan; aqui se fija lo que tiene que medir. "El mismo comando" es `node scripts/diagnostico.mjs --skip-build --dispositivo <disp>`, en las 16 combinaciones.

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs --skip-build` | El escritorio no cambia: las 174 invariantes de hoy, a 1440x900 y en Chromium, con el mismo resultado que `evidencia/2026-11-02_diagnostico.txt`, salvo B11, que es intermitente (`docs/ESTADO.md`, B11) |
| CA2 | El mismo comando | La cabecera imprime lo que midio el navegador, no lo que se pidio: motor, `innerWidth`, `innerHeight`, `devicePixelRatio`, `'ontouchstart' in window`, `matchMedia('(pointer: coarse)').matches` y `matchMedia('(hover: hover)').matches`. Los tres primeros coinciden con la tabla. En WebKit no se usa `navigator.maxTouchPoints`: el 2026-11-03 daba 0 aunque el contexto tuviera tactil |
| CA3 | El mismo comando | Corre en las 6 rutas las invariantes por ruta de hoy: `/`, `/albums`, `/about`, `/credits`, `/atlas` y el album del primer enlace de `/albums` (`scripts/diagnostico.mjs:221-226`). Son estas: consola sin errores, un solo `<main>` visible, sin scroll horizontal, sin ancestro del blend con transform/opacity/filter/perspective/isolation/will-change, wordmark `SUQUIA` en reposo, ninguna `.landing-photo` a `opacity: 0`, buffer del canvas del atlas = caja × dpr y canvas GL fijo = viewport. Cada invariante sale con su resultado, en una tabla por combinacion |
| CA4 | El mismo comando | **Fotos del landing:** en reposo tras la entrada, por cada `.landing-photo` se imprimen su caja, su `opacity` calculada, si interseca el viewport y si el canvas GL pinta su plano. Para el canvas se lee un pixel del centro de su caja: distinto del fondo `#FAFAFA` con la tolerancia que ya usa la seccion de llegada (`ARRIVAL_BG_TOL`, `scripts/diagnostico.mjs:474`). Al final, el total de fotos visibles en el primer viewport y tras desplazar 1, 2 y 3 alturas. Confirma o refuta "no se ve ninguna foto" (Javi, 2026-11-03) |
| CA5 | El mismo comando | Por cada foto de `/` y de cada album: caja entera dentro del viewport (alto ≤ `innerHeight`, ancho ≤ `innerWidth`) y proporcion natural con desviacion < 1 %, la tolerancia de la seccion `barra de scroll` (spec 009). Una linea por foto que falle, con su `src` y su caja |
| CA6 | El mismo comando | Gestos tactiles con CDP (`Input.dispatchTouchEvent`) en Chromium, o con `page.touchscreen` y los eventos tactiles sinteticos que admita WebKit (lo fija el plan). Con y sin `reducedMotion: "reduce"`: un deslizamiento vertical sube `scrollY` en `/` y en un album. En `/albums`, un deslizamiento horizontal cambia la diapositiva abierta. En `/atlas`, un arrastre cambia la rotacion de `window.__atlas` y un pellizco cambia el radio. Se imprime el valor antes y despues de cada gesto. Si un motor no puede simular un gesto, sale `NO MEDIBLE` con el motivo, nunca un aprobado |
| CA7 | El mismo comando | En `/atlas`, tocar una marca sola abre el visor. Se imprimen el ancho del visor y su caja: dentro del viewport y sin scroll horizontal. Es la decision 3 de la spec 016: "solo tiene que no romper" |
| CA8 | El mismo comando, con `--repeticiones 3` y otra vez con CPU×4 | Entrada del landing por combinacion: arranque, fase B, reposo, frames > 50 ms (las cifras del bloque RESUMEN, `docs/ESTADO.md`, "Build") y numero de participantes del monton. Sin umbral de aprobado: es la linea base del candidato 2 de B7 |
| CA9 | El mismo comando, con y sin CPU×4 | **Fluidez del atlas:** durante 2 s de arrastre continuo y durante un pellizco se miden la duracion de los frames (rAF), su mediana, el p95 y los frames > 50 ms. Lo mismo a 1440x900 como referencia. Sin umbral de aprobado: confirma o refuta "un poco menos fluido" (Javi, 2026-11-03) y dice si pesa mas el dpr (buffer de hasta 3×) o la CPU |
| CA10 | `ls evidencia/*017-linea-base*` | Una salida por motor y dispositivo, copiada a `evidencia/` (hoy se copia a mano, `docs/ESTADO.md`, "Esperando a") |
| CA11 | `grep -n "017" docs/ESTADO.md` | `docs/ESTADO.md` lleva una tabla de fallos por dispositivo, orientacion, motor y ruta, con su `evidencia/...:linea`, y la lista ordenada de specs de arreglo propuestas, con el landing primero (Javi, 2026-11-03). Las que toquen el wordmark, el blend, `GLSurface` o el scroll infinito llevan "Requiere decision de Javi: Si" |
| CA12 | Javi lo prueba en su iPhone 13 y en su iPad mini de 5ª generacion, sobre una preview de Vercel de la rama | Su testimonio queda en `tasks.md`, contrastado con la linea base: lo que ve coincide con lo que dice la medida, o la diferencia queda anotada como defecto del harness |
| CA13 | `node scripts/diagnostico.mjs --url https://javisu-photography-portfolio.vercel.app --dispositivo iphone` | Corre contra produccion sin tsc, lint ni build, igual que hoy con `--url` (`scripts/diagnostico.mjs:83-108`) |

## Preguntas abiertas

Respondidas por Javi el 2026-11-03:
1. Dispositivos: "iphone del 13 en adelante y tablets iPad sobre todo". Quedan los cuatro perfiles de "Dispositivos".
2. Horizontal: si.
3. Safari: instalar WebKit. Hecho.
4. Testimonio en dispositivo real: si (CA12).
5. CPU limitada: si, y con el atlas en el foco (CA9).
6. Alcance: solo medicion. El landing va antes que el visor.

7. Dispositivos reales para el CA12: un iPhone 13 y un iPad mini de 5ª generacion. Los dos coinciden con perfiles de la tabla: `iphone` (iPhone 13) e `ipad-mini` (768x1024, dpr 2, la resolucion logica del iPad mini 5). El perfil de Playwright no descuenta la barra de Safari en el iPad Mini (da el alto entero, 1024), al contrario que en los iPhone. Por eso, en CA5, el alto util real del iPad mini sera algo menor que el medido.
8. Donde se prueba el CA12: en una preview de Vercel, no en `npm run dev` por la red local. Asi no hace falta tocar `allowedDevOrigins`. `scripts/diagnostico.mjs` ya mide previews protegidas con `VERCEL_BYPASS` (`scripts/diagnostico.mjs:41-53`), y CA13 se repite contra esa misma preview.

No queda ninguna abierta.

## Enmiendas

1. **CA5, tolerancia de redondeo** (decidido por Javi el 2026-11-03, "Confirmo"). Una foto cuenta como deformada solo si su desviacion de proporcion pasa del 1 % **y** su alto difiere en mas de 1 px del que corresponde a su ancho. Motivo: la caja se ajusta a pixeles, y en una foto de 112 px de alto 1 px ya supone un 1 %. Con esta regla siguen fallando `america/01` en el iPhone (150x112, 1,21 px) y `norte/03` en el iPad mini (571x162, 1,63 px) (`tasks.md`, T4).

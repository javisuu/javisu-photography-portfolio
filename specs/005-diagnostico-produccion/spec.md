# Spec 005 · Diagnostico contra produccion y tiempos de la entrada

- **Estado:** Implementada (2026-10-18). Evidencia: `evidencia/2026-10-18_005-diagnostico-produccion.txt`, `evidencia/2026-10-18_diagnostico_produccion.txt`, `evidencia/2026-10-18_diagnostico_005.txt`
- **Fecha:** 2026-10-18
- **Requiere decision de Javi:** No. El harness solo observa el landing desde fuera (lee estilos del DOM y tiempos de frame). No cambia el codigo de la entrada, el wordmark, el blend, `GLSurface` ni el scroll infinito. Arreglar B6 es otra spec, despues de tener la medida.

## Problema

B6 (`docs/ESTADO.md`, "Defectos abiertos") es SIN VERIFICAR: en produccion, la entrada del landing va a tirones hasta que termina de cargar todo, pero solo lo ha visto Javi a ojo. Javi lo confirmo otra vez el 2026-10-18: "la web se sigue trabando al entrar por primera vez". Sigue siendo testimonio y no medida. Hoy el diagnostico no puede medirlo, por tres motivos:

1. **Solo mide `localhost`.** Arranca su propio `next dev` (`scripts/diagnostico.mjs:89`) y mide siempre contra `BASE = http://localhost:3100` (`scripts/diagnostico.mjs:10,15`). En local las fotos llegan al instante, que es justo lo que oculta B6 (`docs/ESTADO.md`, B6).
2. **No mide la entrada.** Lee el estado en reposo 3,5 s despues de `load` (`scripts/diagnostico.mjs:16,145`). De la entrada solo sabe si alguna `.landing-photo` se quedo a `opacity < 1` (`scripts/diagnostico.mjs:178-180`), y eso tampoco dice nada de su trayectoria (B2, `docs/ESTADO.md`).
3. **Con otro `next dev` abierto, falla tarde.** Si ya hay un `next dev` en la carpeta en otro puerto, el arrancado por el harness falla con `Another next dev server is already running` y el harness espera 90 s antes de rendirse (`scripts/diagnostico.mjs:95-104`). Paso el 2026-10-17 (`docs/ESTADO.md`, seccion "Build"). Hoy solo comprueba si el puerto 3100 esta ocupado (`scripts/diagnostico.mjs:82-85`).

Que se puede observar de la entrada sin tocarla:
- Escribe por frame `transform` y `opacity` inline en cada envoltorio `.landing-photo-entrance` (`src/motion/LandingComposition.tsx:693-735,848`).
- Al empezar, emite `console.log("[entrance] start", ...)`, una vez por entrada (`src/motion/LandingComposition.tsx:429`).
- Fase A: cada foto se une al monton cuando se resuelve su propia decodificacion (`whenImageReady`, `src/motion/LandingComposition.tsx:133-145,580-595`).
- La fase B empieza cuando todas se han unido y han pasado `PILE_MIN_DWELL_MS = 350`, o a los `PILE_MAX_WAIT_MS = 2500` como muy tarde. Las que no llegan a tiempo son rezagadas y aparecen solas en su sitio (`src/motion/LandingComposition.tsx:70-91,517-533,597-600`).

## Objetivo

1. `node scripts/diagnostico.mjs --url <base>` mide una web ya desplegada: consola, invariantes y una seccion nueva con los tiempos de la entrada del landing. No ejecuta `tsc`, `lint` ni `build` y no arranca ningun servidor.
2. El diagnostico local saca la misma seccion de la entrada, para tener con que comparar.
3. Si ya hay un `next dev` corriendo en la carpeta, el harness lo dice y sale enseguida, sin esperar 90 s.

## Fuera de alcance

- Arreglar B6 o B2, o cambiar cualquier cosa de la entrada (`src/motion/LandingComposition.tsx`). Eso sale de otra spec, con la medida de esta delante.
- Emular red lenta en local (throttling de Playwright/CDP). Ver "Preguntas abiertas".
- Viewports de movil e iPad (paso 8 de `docs/ESTADO.md`).
- La prueba negativa del diagnostico (`--autotest`, paso 10 de `docs/ESTADO.md`).
- Instrumentar el codigo del sitio (logs nuevos, `performance.mark`). El harness mide desde fuera.

## Zonas afectadas

- [ ] Landing (`src/motion/LandingComposition.tsx` y alrededores): solo se observa, no se modifica
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`)
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion
- [x] Otros: `scripts/diagnostico.mjs` y los comandos `.claude/commands/diagnostico.md` y `medir-dom.md`, si hay que documentar la opcion nueva

## Choca con el spec

Nada. No cambia nada visible del sitio. Las reglas duras (fotos sin recortar, escala de grises, sin parallax de cursor, `prefers-reduced-motion`) no se tocan.

## Criterios de aceptacion

`<PROD>` es la URL de produccion (ver "Preguntas abiertas").

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs --url <PROD>; echo "exit=$?"` | Las secciones `tsc`, `eslint` y `next build` dicen `omitido (--url)`. No hay seccion `next dev`. Se miden las 6 rutas de siempre contra `<PROD>`, con sus invariantes, y sale `exit=0` si todo pasa |
| CA2 | `netstat -ano \| grep LISTENING \| grep -c ":3100 "` antes y durante CA1 | `0` las dos veces: con `--url` no se arranca ningun servidor |
| CA3 | En la salida de CA1, la seccion `=== entrada / ===` | Trae: participantes; para cada uno, el ms desde la navegacion en que se une al monton; el ms en que empieza la fase B; rezagadas; el ms en que todas quedan en `opacity: 1` sin `transform`; el numero de frames de mas de 50 ms durante la entrada; el frame mas largo; y cuantas veces aparece `[entrance] start` (esperado `1`). Todo numerico, nada vacio |
| CA4 | `node scripts/diagnostico.mjs; echo "exit=$?"` (local, completo) | `29 de 29`, `lint ok`, `0 errores en 6 rutas`, `exit=0`, y la misma seccion `=== entrada / ===` con `[entrance] start` = `1` |
| CA5 | Con `npx next dev -p 3101` corriendo: `time node scripts/diagnostico.mjs --skip-build; echo "exit=$?"` | Un mensaje que dice que ya hay un `next dev` en la carpeta, `exit=2` y menos de 15 s de reloj |
| CA6 | `node scripts/diagnostico.mjs --url no-es-una-url; echo "exit=$?"` | Un mensaje de URL invalida y `exit=2`, sin abrir el navegador |
| CA7 | `npx tsc --noEmit` y `npx eslint src --max-warnings=0` | Los dos con exit 0 (el harness no esta en `src/`, pero el sitio no debe cambiar) |
| CA8 | `git diff --stat main -- src/` | Vacio: el sitio no cambia |

## Preguntas abiertas

Resueltas el 2026-10-18:
- La 1 con `https://javisu-photography-portfolio.vercel.app` (ver `tasks.md`).
- La 2 con `--repeticiones N`, por defecto 1 y 3 para produccion.
- La 3 queda fuera, por decision de Javi.
- La 5: el dominio publico no da ningun error de terceros (`evidencia/2026-10-18_diagnostico_produccion.txt`, 0 errores en 6 rutas). Los 4xx de terceros solo salieron con la URL protegida, que era la pagina de login de Vercel.

1. **La URL de produccion.** No esta en el repo: no hay `vercel.app` ni `metadataBase` en ningun fichero fuera de `node_modules`. ¿Cual es? ¿Se escribe en el script como valor por defecto o se pasa siempre a mano?
2. **Cuantas repeticiones.** Una sola carga en red real es ruidosa. ¿Basta con una, o anadimos `--repeticiones N` y damos mediana y maximo? Recomiendo 3 con la cache del navegador vacia en cada una, que es lo que ve un visitante nuevo.
3. **Red lenta en local.** ¿Queremos tambien poder emular red lenta contra `localhost` para reproducir B6 sin desplegar? Lo he dejado fuera de alcance. Seria una spec aparte o una opcion extra aqui.
4. ~~Como detectar otro `next dev`.~~ **Resuelta el 2026-10-18.** Next 16.3.2 (`package.json:14`) intenta coger un lockfile durante 1 s (`MAX_RETRY_MS = 1000`). Si no puede, imprime `Another next dev server is already running` y sale con `process.exit(1)` (`node_modules/next/dist/build/lockfile.js:79,166-211`). El harness no escucha la salida del proceso hijo (no hay ningun `dev.on` en `scripts/diagnostico.mjs`), y por eso espera los 90 s. Ver `plan.md`.
5. **Ruido de terceros en produccion.** En Vercel pueden salir peticiones con 4xx que en local no existen (analitica o scripts de la plataforma). Hoy contarian como errores de consola (`scripts/diagnostico.mjs:122-124`). SIN VERIFICAR hasta la primera ejecucion de CA1. Si salen, ¿se anaden a `IGNORE` (`scripts/diagnostico.mjs:107`) con un comentario, o se tratan como defecto?

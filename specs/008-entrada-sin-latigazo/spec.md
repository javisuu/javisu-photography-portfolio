# Spec 008 · Entrada sin latigazo

- **Estado:** Aprobada
- **Fecha:** 2026-10-19
- **Requiere decision de Javi:** Si (motivo: toca el ritmo de llegada al monton de `src/motion/LandingComposition.tsx`, parte de la entrada persistente del landing. Javi pidio explicitamente abrir esta spec el 2026-10-19, en la misma sesion que la midio, y el mismo dia aprobo el alcance: solo el candidato 1, ver "Fuera de alcance". `GLSurface.tsx` no se toca en esta iteracion.)

## Problema

Javi percibe un "latigazo" en la entrada del landing en produccion, incluso despues de que la spec 007 bajara la decodificacion de 382 a 28ms. Medido hoy contra produccion (`https://javisu-photography-portfolio.vercel.app`, 3 repeticiones, cache vacia):

1. **La fase de monton (fase A) nunca se ve construirse.** Las 7 fotos participantes se unen al monton en el mismo milisegundo en las 3 repeticiones: `817 817 817 817 817 817 817`, `904×7`, `868×7` (scratchpad de la sesion, `2026-10-19_diagnostico-entrada-produccion.txt`). El diseno de fase A es "cada foto se apila conforme su propio decode resuelve... la mas reciente encima" (`src/motion/LandingComposition.tsx:71-75`), pero con el decode a ~27ms (spec 007) las 7 resuelven juntas: la pila colapsa en un solo golpe en vez de construirse foto a foto.
2. **El frame donde arranca la entrada compite por el hilo principal con la inicializacion de WebGL y la decodificacion.** `scripts/perfil-arranque.mjs --url` contra produccion (3 repeticiones) descompone ese frame: 68-79% "ejecucion JS" (`setShaders`, `getExtension`, `setSize` — inicializacion de `GLSurface`, ver `src/motion/GLSurface.tsx`) + 17-27% "decodificacion" (`createImageBitmap`/`Decode Image`). Scratchpad de la sesion: `2026-10-19_perfil-arranque-produccion.txt`.
3. **Durante los ~1,5s siguientes (la ventana de la fase B, 750ms + hasta 60ms de stagger, `ENTRANCE_DURATION_MS`/`ENTRANCE_STAGGER_MS` en `src/motion/LandingComposition.tsx:86-87`) hay frames caidos:** 4-7 frames >50ms por repeticion (maximo 67ms) y 2-7 "long tasks" de 400 a 660ms en total (`2026-10-19_diagnostico-entrada-produccion.txt`).

Registrado como defecto **B7** en `docs/ESTADO.md` ("Defectos abiertos").

## Objetivo

Que en produccion la fase A (monton) del landing se perciba como una pila que se construye foto a foto, no un solo golpe simultaneo — medido con `scripts/diagnostico.mjs --url` contra produccion, mejorando los numeros de la linea base de hoy (2026-10-19). Esta primera iteracion solo ataca la causa 1 del "Problema" (las 7 llegan al monton en el mismo milisegundo); la causa 2 (GL init compitiendo por el frame con el decode) queda para una spec posterior si hace falta, ver "Fuera de alcance".

## Fuera de alcance

- **Candidato 2 (sacar la inicializacion de WebGL del frame de arranque).** Discutido y aparcado el 2026-10-19: toca `GLSurface.tsx`, zona sensible, y se reserva como segunda iteracion solo si, despues de este cambio, CA2 (frames >50 ms) no mejora lo suficiente. No se toca `GLSurface.tsx` en esta spec.
- **Candidato 3 (espaciar las llamadas a `createImageBitmap` de los 7 participantes).** Descartado el 2026-10-19 por redundante: si el candidato 1 ya escalona la entrada visible al monton, espaciar tambien la decodificacion real no anade nada observable y complica la carga sin necesidad.
- Cualquier cambio al aspecto final de la dispersion (direccion, jitter, duracion de 750ms) — solo se toca el reparto de trabajo en el tiempo, no la coreografia visual ya aprobada.
- El wordmark (`DecipherWordmark.tsx`) y su retraso de 600ms — no esta implicado en lo medido.
- La pagina de album (`AlbumPhotos.tsx`) y el carrusel — usan `GLSurface` con otros valores o no lo usan; esta spec no toca su comportamiento.
- El camino de `prefers-reduced-motion` (`src/motion/LandingComposition.tsx:612-640`) — ya es un fade simple por foto, sin pila ni dispersión, y no participa de ninguna de las dos causas medidas.
- Diagnosticar por que persisten los avisos de consola `GPU stall due to ReadPixels` en `/` (presentes desde 2026-10-11) — es una hipotesis alternativa descartada en la sesion de hoy como explicacion de B7, pero sigue sin investigarse por separado.

## Zonas afectadas

- [x] Landing (`src/motion/LandingComposition.tsx` y alrededores)
- [ ] Wordmark (`src/motion/DecipherWordmark.tsx`)
- [ ] Carrusel de albumes (`src/motion/AlbumsCarousel.tsx`)
- [ ] Pagina de album (`src/motion/AlbumPhotos.tsx`)
- [ ] Atlas (`src/app/atlas/`)
- [ ] Renderizador GL (`src/motion/GLSurface.tsx`) — fuera de alcance en esta iteracion, ver candidato 2
- [ ] Datos (`src/data/photos.ts`)
- [ ] Solo documentacion

## Choca con el spec

Nada directamente, pero el plan tiene que respetar dos invariantes ya existentes en el codigo, no en `design-spec-v2.md`, que no se deben romper al tocar el timing:
- "No scaling ever, anywhere" en la pila (`src/motion/LandingComposition.tsx:93-96`) — cualquier arreglo que toque el join a la pila sigue siendo solo traslacion.
- Transform/opacity-only (regla dura de `CLAUDE.md`) — ya se cumple hoy; un arreglo que difiera la inicializacion de GL no debe introducir ninguna otra propiedad animada.

## Criterios de aceptacion

| # | Comando | Resultado esperado |
|---|---|---|
| CA1 | `node scripts/diagnostico.mjs --skip-build` | 0 fallos de invariantes (29 de 29) |
| CA2 | `node scripts/diagnostico.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 5` | mediana de "frames >50 ms" menor que 4 (linea base de hoy, `2026-10-19_diagnostico-entrada-produccion.txt`) |
| CA3 | mismo comando que CA2, mirando las 5 lineas "al monton" | en cada repeticion, el rango (maximo − minimo) de las 7 marcas de tiempo es mayor que 0 — ya no llegan las 7 en el mismo milisegundo |
| CA4 | `node scripts/perfil-arranque.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 3` | sin regresion: el reparto del frame de arranque sigue sumando 100% con nombre (sin huecos nuevos en "otros"); como esta spec no toca `GLSurface.tsx`, no se espera que este numero cambie — sirve de control |

## Preguntas abiertas

- No hay forma de emular `prefers-reduced-motion` desde `scripts/diagnostico.mjs` ni `scripts/perfil-arranque.mjs` hoy — verificar que ese camino sigue intacto despues del cambio tendria que ser manual (DevTools → Rendering → Emulate CSS media). Si Javi quiere que quede automatizado, es otra spec.
- ¿Que umbral de "frames >50 ms" se considera aceptable a largo plazo (no solo "menor que hoy")? CA2 solo exige mejorar la linea base, no un numero absoluto. Como esta iteracion no toca la causa 2 (GL init en el mismo frame), es posible que CA2 no mejore gran cosa aunque CA3 si — en ese caso, abrir la spec del candidato 2 en vez de insistir aqui.

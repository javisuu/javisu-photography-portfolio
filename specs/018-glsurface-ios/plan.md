# Plan 018 · GLSurface en Safari de iOS

- **Spec:** `spec.md` (aprobada el 2026-11-04)

## Enfoque

**La red reutiliza un aviso que ya existe.** El landing y el album ya saben volver a sus `<img>` cuando `GLSurface` avisa `onAvailabilityChange(false)`:
- el landing pone `glStatus` a `false` y vuelve a `visibility: visible` (`src/motion/LandingComposition.tsx:913`);
- el album pone `glActive` a `false`, vuelve a `visible` y revela la primera fila (`src/motion/AlbumPhotos.tsx:84-89,145`).

Hoy ese aviso solo llega si el contexto no se crea (`src/motion/GLSurface.tsx:442-445`).

**`GLSurface` gana una salida unica, `fallar(motivo)`.** Se ejecuta una sola vez por instancia, y hace cuatro cosas:
1. para el bucle de pintado;
2. borra y oculta el canvas;
3. llama a `onAvailabilityChange(false)`;
4. apunta el motivo para el panel `?diag`.

Con eso, toda la pagina vuelve al DOM (decision 1) y se queda asi hasta recargar (decision 4): no hay camino de vuelta a GL.

**Disparan `fallar` cuatro cosas, y ninguna pasa en el camino normal:**
1. **El contexto se pierde.** `webglcontextlost` en el canvas, sin `preventDefault`, asi que el navegador no lo devuelve.
2. **Una decodificacion falla.** Rechaza `createImageBitmap` (`src/motion/GLSurface.tsx:291`).
3. **Una decodificacion no termina.** No resuelve en 1,5 s (decision 3). El reloj solo corre con la pestaña visible, para que una pestaña en segundo plano no lo dispare.
4. **Una subida da error.** Tras cada subida a la GPU, `texture.update()` explicito y `gl.getError()`; un error distinto de `NO_ERROR` (por ejemplo `OUT_OF_MEMORY`) dispara `fallar`. Solo ocurre una vez por textura, 30 veces en el landing.

**El reloj de 1,5 s solo mide la decodificacion, no la subida.** El landing sigue montado fuera de `/` con su bucle parado (`active`), asi que sus subidas esperan con razon. Si el reloj contara hasta la subida, el landing caeria al DOM en escritorio al entrar directamente en un album. Eso romperia la regla de Javi.

**El panel `?diag`:**
- **De donde lee:** cada instancia de `GLSurface` escribe su estado en un registro de modulo (`src/motion/glDiag.ts`): nombre, tipo de contexto, perdido, texturas subidas N de M, fallos de decodificacion, motivo de `fallar` y ultimo error.
- **Que lo pinta:** un componente cliente, `src/components/GLDiagPanel.tsx`, montado en el layout. Mira `location.search` en un efecto, nunca en el render del servidor, para no crear una diferencia de hidratacion. Si no hay `?diag`, devuelve `null`.
- **Donde se ve:** abajo a la izquierda, texto de 11 px, gris sobre blanco, encima de todo.
- **Copia para el diagnostico:** el registro tambien se expone como `window.__glDiag`.

**`sizes` del landing:** por debajo de 900 px pide `min(w·2,4, 85)vw`, calculado en JS como un numero por foto. Por encima sigue pidiendo `w vw`:

`sizes={`(max-width: 899px) ${Math.min(w * 2.4, 85)}vw, ${w}vw`}`

Por encima de 900 px el navegador elige el mismo `currentSrc` que hoy.

**Alternativas descartadas:**
- **Volver al DOM foto a foto:** lo descarto Javi (decision 1).
- **Reconstruir la escena al recuperar el contexto:** lo descarto Javi (decision 4).
- **Una cuenta por fotogramas en vez de tiempo:** no distingue una pestaña parada de un fallo. El tiempo con la pestaña visible si los distingue.

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `src/motion/GLSurface.tsx` | modificar | Prop `diagName`. `fallar(motivo)`. Escucha de `webglcontextlost`. Reloj de decodificacion. `getError` tras subir. Escritura en el registro. El camino sin fallos sigue igual: mismas llamadas, mismo orden de ocultado y pintado |
| `src/motion/glDiag.ts` | crear | Registro de estado por instancia y `window.__glDiag` |
| `src/components/GLDiagPanel.tsx` | crear | Panel visible solo con `?diag`. Se actualiza cada 500 ms |
| `src/app/layout.tsx` | modificar | Monta `<GLDiagPanel />` |
| `src/motion/LandingComposition.tsx` | modificar | `diagName="landing"` y `sizes` con media query |
| `src/motion/AlbumPhotos.tsx` | modificar | `diagName="album"` |
| `scripts/lib/capturas.mjs` | crear | Guarda y compara capturas PNG con `sharp`, que ya esta en `node_modules`. Cuenta los pixeles distintos |
| `scripts/diagnostico.mjs` | modificar | Secciones nuevas: "fallo de textura forzado", "contexto perdido forzado", "panel diag", "calidad del landing" (`currentSrc` frente a lo pintado) y "capturas de escritorio" (`--capturas-guardar <dir>` y `--capturas-comparar <dir>`). Ninguna sale sin flag de las secciones de hoy |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| En un movil lento real, la decodificacion pasa de 1,5 s y la pagina cae al DOM sin necesidad: fotos planas | Media | Bajo: se ven fotos planas y no un hueco | `?diag` dice el motivo. La pasada a CPU x4 (T6) lee `__glDiag` y dice si salta. El 1,5 s lo eligio Javi |
| `gl.getError()` fuerza una espera en la GPU | Baja: 30 llamadas en total | Bajo | CA8 mide la entrada en escritorio |
| El landing en DOM no hace la entrada igual que con GL | Baja: el camino CSS ya existe y es el de sin WebGL | Medio | CA3 y CA4 miden que se ven las fotos |
| El panel crea una diferencia de hidratacion | Baja | Medio: error de consola | Decide en un efecto y no en el render. Lo cubre la invariante "sin errores de consola" |
| Las capturas no son deterministas al pixel: la entrada o el atlas se mueven | Media | Bajo: CA10 tiene su clausula | `/` y el album en reposo, el atlas con `prefers-reduced-motion` para que no arranque la deriva. T1 hace dos pasadas sobre `main` para medir el ruido antes de comparar nada |
| La causa real no es ninguna de las cuatro y la red no la ve | Media | Alto: en iOS sigue en blanco | `?diag` sigue diciendo que pasa (CA6). Arreglarlo seria una enmienda (decision 6) |

## Vuelta atras

- **Rama:** `feat/018-glsurface-ios`
- **Como se revierte:** `git revert` de los commits de `src/`. Los del diagnostico pueden quedarse: miden, no cambian el sitio.
- **Que avisaria de que esto ha roto algo:**
  - "sin errores de consola" y "ninguna `.landing-photo` a `opacity: 0`";
  - "fotos del landing" (7, 7, 5, 6);
  - CA10, la captura identica a `main`;
  - en el panel o en `__glDiag`, un `fallar` disparado en escritorio.

## Verificacion

| Comprobacion | Criterios | Salida |
|---|---|---|
| Capturas y `currentSrc` de `main`, antes de tocar `src/` (T1) | CA10 y CA9, la parte de escritorio | `evidencia/2026-11-04_018-capturas-main/` y `evidencia/2026-11-04_018-main.txt` |
| Fallos forzados sobre `main`, que deben fallar: es el rojo (T2) | CA3, CA4 | `evidencia/2026-11-04_018-fallos-forzados-main.txt` |
| `node scripts/diagnostico.mjs --skip-build --capturas-comparar ...` tras cada tarea de `src/` | CA1, CA3, CA4, CA5, CA8, CA10 | `evidencia/AAAA-MM-DD_018-escritorio-tN.txt` |
| `--dispositivo iphone`, `ipad-mini` y en horizontal; `--cpu 4` leyendo `__glDiag` | CA2, CA9, riesgo 1 | `evidencia/AAAA-MM-DD_018-<dispositivo>.txt` |
| Preview de Vercel: Javi con `?diag`, y despues sin el | CA6, CA7 | `tasks.md` (testimonio) y capturas de Javi en `evidencia/` |
| Diagnostico completo con build, con el `npm run dev` de Javi parado | cierre | `evidencia/AAAA-MM-DD_diagnostico_cierre-018.txt` |

Las salidas las escribe el agente en su scratchpad y Javi las copia a `evidencia/`.

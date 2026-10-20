# Tareas 009 · Ocultar la barra de scroll

- **Plan:** `plan.md` (aprobado el 2026-10-20)

Pasos atomicos, en orden. Cada uno deja el sitio en un estado que carga sin errores y tiene su comprobacion.

- [x] **T1** · Anadir la seccion `barra de scroll` al diagnostico y medir la linea base
  - Resultado (2026-10-20, `--skip-build`, salida en el scratchpad `2026-10-20_009-linea-base.txt`): 41 de 43, y los 2 fallos son los esperados. `sin barra de scroll` falla con 15 px en `/` y en `/album/america`, y da 0 en `/albums`, `/about`, `/credits` y `/atlas`. `/about` y `/credits` tienen `scrollHeight` 900 = `innerHeight`, asi que no hacen scroll: confirmado lo que dijo Javi. Proporcion de las fotos: desvio max 0,0065 en `/` (30 fotos) y 0,0014 en el album (10). Canvas GL = 1440x900 en los dos. Rueda: 0 -> 599 en las dos rutas. Teclado: 0 -> 787, normal y con reduced motion. Las 29 invariantes de antes, en verde. Entrada: 7 participantes, 0 frames >50 ms, "al monton" escalonado (`496 529 546 613 696 763 830`)
  - Fichero(s): `scripts/diagnostico.mjs`
  - Comprobacion: `node scripts/diagnostico.mjs --skip-build`. Las 29 invariantes actuales siguen en verde. En la seccion nueva:
    - `sin barra de scroll` da **rojo** en `/` y en `/album/<slug>` (`innerWidth - clientWidth > 0`), y 0 en `/albums` y `/atlas`
    - `/about` y `/credits`: anotar si dan 0, es decir, que no hacen scroll como dice Javi
    - CA3, CA4 y CA5 en verde
    - Salida en el scratchpad: `2026-10-20_009-linea-base.txt`
    - Si `sin barra de scroll` no da rojo en ninguna ruta, se para: la invariante no detecta nada y hay que revisar el plan
- [x] **T2** · Ocultar la barra solo en el documento
  - Resultado (2026-10-20): `npx tsc --noEmit` ok. `npx eslint src --max-warnings=0` ok: es el mismo alcance que usa el diagnostico (`scripts/diagnostico.mjs:87`). `npm run lint`, en cambio, lintea todo el repo y da 2 avisos en `scripts/diagnostico.mjs:14`: `readFileSync` y `existsSync` importados sin usar. Ese import ya estaba igual en `main`, no lo introduce esta spec. La consola de `/` se comprueba en T3, con el diagnostico completo
  - Fichero(s): `src/app/globals.css`
  - Comprobacion: `npx tsc --noEmit` y `npm run lint` limpios. En `npm run dev`, `/` carga sin errores de consola
- [x] **T3** · Medir despues del cambio
  - Resultado (2026-10-20, diagnostico completo, salida en el scratchpad `2026-10-20_009-ocultar-barra-scroll.txt`, codigo de salida 0):
    - tsc, lint y build ok · 0 errores de consola en 6 rutas · 43 de 43 (CA1)
    - `sin barra de scroll` da 0 en las 6 rutas (CA2), cuando en T1 daba 15 en `/` y en el album
    - Rueda: 0 -> 599 en `/` y en el album (CA3)
    - Teclado: 0 -> 787, normal y con reduced motion (CA4)
    - Proporcion de las fotos: desvio max 0,0065 en `/` y 0,0014 en el album, identico a T1. Canvas GL = 1440x900 (CA5)
    - Entrada: 7 participantes, 0 frames >50 ms, "al monton" `551 585 601 685 751 818 885` (CA6)
    - `git diff main --stat -- src/` da solo `src/app/globals.css` (CA7)
  - Fichero(s): ninguno, solo se mide
  - Comprobacion:
    - `node scripts/diagnostico.mjs`: CA1 a CA6 en verde
    - `git diff main --stat -- src/`: solo `src/app/globals.css` (CA7)
    - Salida en el scratchpad: `2026-10-20_009-ocultar-barra-scroll.txt`
- [x] **T4** · Revision a mano de Javi (CA8)
  - Resultado (2026-10-20): Javi lo reviso en `npm run dev` y respondio "all works good". Es su testimonio, sin captura. Safari queda SIN VERIFICAR: Javi no lo tiene
  - Fichero(s): ninguno
  - Comprobacion: Javi abre `npm run dev` en `localhost:3000`, en Chrome y en Firefox, y recorre `/`, un album, `/about` y `/credits`. No hay barra, el scroll funciona con rueda, teclado y trackpad, y ninguna foto se ve estirada. Se anota aqui su respuesta

## Cierre

- [x] `node scripts/diagnostico.mjs` en verde (43 de 43, T3). Salida en el scratchpad de la sesion, pendiente de que Javi la copie a `evidencia/` (regla deny `.claude/settings.json:27`)
- [x] Criterios de aceptacion de la spec ejecutados: CA1 a CA7 en T3, CA8 en T4
- [x] `CLAUDE.md` actualizado: la seccion nueva del diagnostico va en el parrafo de invariantes. `docs/design-spec-v2.md` no menciona la barra de scroll, asi que no cambia
- [x] Estado de `spec.md` → Implementada

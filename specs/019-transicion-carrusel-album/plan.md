# Plan 019 · Transicion carrusel → album

- **Spec:** `spec.md` (aprobada el 2026-11-14)
- **Estado del plan:** Aprobado (Javi, 2026-11-14)

## Enfoque

**Una capa de vuelo persistente en el layout raiz, con clones de las laminas.** El carrusel no se queda montado. Al hacer clic, `AlbumsCarousel` toma una foto fija de su estado: para cada lamina en pantalla, su rect, su apertura, su lado de anclaje, la opacidad de su panel y su `src`. Tambien toma la del titulo y la descripcion. Se la entrega a `AlbumTransitionLayer`, montada en `src/app/layout.tsx` junto al landing (`src/app/layout.tsx:42`), y despues llama a `router.push` como hoy (`src/motion/AlbumsCarousel.tsx:917-918`).

La capa pinta las mismas laminas con el mismo marcado y las mismas funciones de geometria del carrusel: marco con `scaleX`, hijo con la escala inversa y panel de grano (`frameTransformFor`, `counterScaleFor`, `pinnedOriginFor` y `driftTransformFor`, `src/motion/AlbumsCarousel.tsx:265-276`; `PANEL_OPACITY` y el ancho de rendija `S`, `:17` y `:28`). Esas funciones se mueven tal cual a un modulo compartido, y asi "se reutilizan los componentes" (respuesta 1). Cuando la pagina del album se monta debajo, sus destinos (el `<h1>`, la linea "lugar — año" y el `<img>` de la foto 1) se registran en la capa. La capa los mide y anima con GSAP. Al terminar, cada clon da el relevo a su elemento real en el mismo commit de React y la capa se vacia.

**`GLSurface` sin tocar su codigo.** El relevo DOM → GL se hace desde `AlbumPhotos` con lo que `GLSurface` ya ofrece:
- `active={false}` durante el vuelo (`src/motion/GLSurface.tsx:134-143`).
- Al aterrizar, `active={true}`, con el canvas a `opacity-0` por `className` (`src/motion/GLSurface.tsx:685`) y las `<img>` visibles.
- `readyNodeCount={2}`. Cuando `onTexturesReady` llega, en un solo render se ocultan las `<img>` y el canvas pasa a `opacity-100`.

Las subidas de textura solo ocurren con el bucle activo (`src/motion/GLSurface.tsx:540-550`). Por eso GL se activa al aterrizar y no antes, y la decodificacion avanza mientras tanto, porque no depende de `active` (`src/motion/GLSurface.tsx:140-142`). Nunca hay fotograma con las `<img>` y el canvas visibles a la vez, y nunca un hueco: si GL tarda o falla, la pagina se queda en DOM, que es una pagina completa.

**Alternativa descartada: montar el carrusel entero en el layout, como el landing.** Conservaria el estado gratis (respuesta 6), pero obliga a tener un componente cerrado de 1011 lineas montado y pausado en todas las rutas, con su propio `active` como el landing (`CLAUDE.md`, "The landing is rendered persistently"). La capa toca el carrusel solo en el clic y en el indice inicial.

### Coreografia (1440x900, valores de partida; Javi los ajusta en CA17)

| t (ms) | Que pasa |
|---|---|
| 0 | `pointerup` sin arrastre. Foto fija del carrusel, la capa pinta los clones encima y el carrusel real se oculta. `router.push`. Lenis del album, parado al montar |
| 0–80 | america y sol: la rendija de la izquierda de la abierta cambia su `src` a la foto 1 bajo el panel (>= 0,9). norte y ny: nada |
| 0 → ~700 | Las laminas de la derecha bajan y salen por abajo, en cascada de izquierda a derecha (40 ms entre una y la siguiente, 600 ms cada una, `power2.in`). En america y sol, la abierta va en esa cascada. Las de la izquierda que no suben se van por arriba con el mismo escalonado, de derecha a izquierda. El contador `NN / 04` del carrusel baja con la ultima |
| montaje del album → 900 | La lamina que sube viaja al rect de la foto 1 (`power3.inOut`). En america y sol se despliega a la vez: el marco pasa de su apertura del momento a 1, y el panel sigue a la apertura hasta 0. En norte y ny, solo escala y traslacion |
| montaje → 850 / 900 | El titulo viaja al `<h1>` y la descripcion a su linea, cada uno con su curva y con 60 ms de desfase, nunca como bloque (respuesta 5). El relevo es al final: el clon a 0 y el real a 1 en el mismo fotograma |
| 650 → 950 | "ALBUM NN — N PHOTOS" y el control prev/next (`AlbumPhotoNav`) aparecen con un fundido de 300 ms |
| 900 | Aterrizaje. Relevo de la lamina al `<img>` real de la foto 1, que se muestra en el mismo commit. Lenis vuelve a funcionar. `GLSurface` pasa a `active` y espera a 2 texturas |
| ~950+ | 2 texturas: `<img>` ocultas y canvas visible, en el mismo render |

El "← Suquia" de las dos paginas esta en el mismo sitio y es el mismo (`src/app/albums/page.tsx:22-29`, `src/app/album/[slug]/page.tsx:35-40`), asi que no se anima. Si la pagina del album tarda en montar (RSC), las salidas ya han empezado y la lamina que sube y el titulo esperan en su sitio de origen. Hay un tope de 1500 ms: pasado ese tiempo, fundido.

**Vuelta (respuesta 6).** La capa guarda el album abierto y los rects de llegada. Al volver a `/albums`:
- **Si `scrollY` era 0** al salir (lo apunta `AlbumPhotos` en cada scroll), la capa repinta los clones en sus rects de llegada y el carrusel monta con ese album activo y oculto. Se reproduce la coreografia al reves: la lamina vuelve a la ranura y se pliega bajo su panel, y en america y sol recupera su portada original cuando el panel vuelve a >= 0,9. Lo que bajo vuelve desde abajo y lo que subio, desde arriba. Despues el carrusel real se muestra y la capa se vacia.
- **Si `scrollY` era mayor que 0**, el carrusel aparece con un fundido de 300 ms, y el titulo viaja desde donde estaba, aunque sea fuera de pantalla, a su sitio en el carrusel.

**`prefers-reduced-motion`:** sin clones. El carrusel se va y la pagina del album entra con un fundido de 300 ms, solo de opacidad. La vuelta es igual. El relevo DOM → GL es el mismo de arriba.

**Las otras llegadas no cambian** (NEXT ALBUM, carga directa, atras desde otra ruta): `AlbumPhotos` sigue con `readyNodeCount={1}` y la revelacion de la spec 013 (`src/motion/AlbumPhotos.tsx:35-47`, `:246-247`). El modo se fija al montar, porque `readyNodeCount` esta en las dependencias del efecto de `GLSurface` y cambiarlo despues reconstruiria la escena (`src/motion/GLSurface.tsx:683`).

## Ficheros

| Fichero | Accion | Que cambia |
|---|---|---|
| `package.json` | modificar | Añade `gsap` con version exacta (3.13.0, que incluye Flip). El stack ya lo decidio (`CLAUDE.md`, "Stack") |
| `src/motion/carouselGeometry.ts` | crear | `SLIDE_HEIGHT`, `GAP`, ancho de rendija, `naturalWidthFor`, `frameTransformFor`, `counterScaleFor`, `pinnedOriginFor` y la opacidad del panel, movidos sin cambiar una linea de logica |
| `src/motion/AlbumsCarousel.tsx` | modificar | Importa la geometria del modulo nuevo. En el `pointerup` de un clic, foto fija y `startAlbumOpen(snapshot)` antes de `router.push`. El indice inicial sale del album guardado en vez de 0 (`:563`). Oculta su tira mientras la capa vuela de vuelta, y expone los rects de reposo para la vuelta |
| `src/motion/albumTransition/store.ts` | crear | Estado de modulo, que sobrevive a la navegacion cliente: foto fija, fase, album guardado, rects de llegada, `scrollY` al salir. Incluye `window.__transicion`, la sonda de solo lectura para el diagnostico, como `window.__atlas` |
| `src/motion/albumTransition/AlbumTransitionLayer.tsx` | crear | La capa fija (`z-50`, `pointer-events: none`): pinta los clones y lleva la linea de tiempo de GSAP, ida y vuelta, mas el caso de movimiento reducido |
| `src/motion/albumTransition/TransitionTarget.tsx` | crear | Envoltorio de cliente: registra un destino (titulo, descripcion, etiqueta, control prev/next) y lo deja a `opacity: 0` desde su primer render cuando se llega por transicion |
| `src/app/layout.tsx` | modificar | Monta `<AlbumTransitionLayer />` |
| `src/app/album/[slug]/page.tsx` | modificar | Envuelve el `<h1>`, la linea "lugar — año", la etiqueta y `AlbumPhotoNav` en `TransitionTarget`. Sin cambios de maquetacion |
| `src/motion/AlbumPhotos.tsx` | modificar | Modo de llegada fijado al montar. En modo transicion: fotos 1 y 2 `eager`, Lenis parado durante el vuelo, `active` de `GLSurface` atado a la fase, canvas oculto y `readyNodeCount={2}`, y relevo en un solo render. Fuera de ese modo, sin cambios |
| `src/motion/GLSurface.tsx` | ninguna | Solo se usa su API publica. Si en T6 resultara que hace falta tocarlo, se para y se consulta a Javi |
| `scripts/diagnostico.mjs` | modificar | Seccion nueva `transicion`, con CA3 a CA13 sobre los cuatro albumes. Reutiliza el muestreo de color de `llegada al album` (`scripts/diagnostico.mjs:535`, `:756-791`) para CA10. Usa un `MutationObserver` para CA7, y `window.__transicion` y `window.__glDiag` para fases y fotogramas pintados |
| `docs/design-spec-v2.md` | modificar (al cierre) | §2 "Navigation", §3 "No hero" e inventario de motion #4 |
| `CLAUDE.md` | modificar (al cierre) | Build order (la transicion, hecha), "Stack" (GSAP instalado) y la arquitectura de la capa |

## Riesgos

| Riesgo | Probabilidad | Impacto | Mitigacion |
|---|---|---|---|
| Mover la geometria del carrusel altera su reposo o su fisica | Baja | Alto (carrusel cerrado) | Movimiento literal, sin tocar la logica. CA14 (`medir-carrusel.mjs --comparar`) antes y despues de T2, como tarea propia |
| La pagina del album tarda en montar (RSC sin prefetch) y la lamina se queda esperando | Media en dev, baja en prod | Medio | `Link` ya precarga la ruta de la lamina abierta. Espera visible en origen y tope de 1500 ms con fundido. Se mide en produccion, no solo en `next dev` |
| El rect de la foto 1 no es el definitivo al medir (fuentes, aspecto) | Baja | Medio | `next/image` lleva `width`/`height`, asi que la caja existe antes de cargar. Se mide tras `document.fonts.ready` y otra vez en el ultimo tramo del vuelo |
| La lamina escalada se ve blanda (el `src` del carrusel se pidio a `${naturalWidth}px`, `src/motion/AlbumsCarousel.tsx:410`) | Alta | Bajo, dura un instante | La foto 1 del album se pide en paralelo y el relevo final es al `<img>` real, nitido |
| Un relevo en el mismo commit no cae en el mismo fotograma | Media | Medio (un parpadeo) | Los relevos se escriben en el mismo callback de rAF, por estilo directo y no por estado de React, donde haga falta. CA3 y CA10 lo miden por fotograma |
| `readyNodeCount={2}` nunca llega (foto 2 rota o muy lenta) | Baja | Bajo | La pagina se queda en DOM, completa. `GLSurface` ya cae entero a DOM en cualquier fallo (spec 018) |
| Blend `mix-blend-mode: difference` | Muy baja | Alto | La capa es hermana del landing, nunca ancestro de su `<h1>`, y no lleva transform ni opacidad en ningun ancestro comun. Lo vigila la invariante de ancestros del diagnostico |
| "Un solo `<main>` visible" | Media | Medio | La capa no usa `<main>`; es un `<div>`. Durante el vuelo conviven el `<main>` del carrusel y el del album como mucho un instante, y la invariante se mide en reposo |
| Movil: el gesto de toque pasa por el mismo `pointerup` | Media | Bajo | CA15 en `iphone` e `ipad`. El diseño tactil es de `carrusel-tactil` |

## Vuelta atras

- **Rama:** `feat/019-transicion-carrusel-album` (la crea Javi; el agente no tiene permiso para `git switch`, `docs/ESTADO.md`, "Rama").
- **Como se revierte:** `git revert` de los commits de la rama. La capa es aditiva: quitar `<AlbumTransitionLayer />` del layout y la llamada a `startAlbumOpen` devuelve el comportamiento de hoy. El modo por defecto de `AlbumPhotos` es el actual.
- **Que invariante avisaria de que esto ha roto algo:** la geometria del carrusel (CA14), `llegada al album` (CA16), "un solo `<main>` visible", "sin barra de scroll" y la de ancestros del blend.

## Verificacion

- **Linea base:** antes de T1, `node scripts/diagnostico.mjs --skip-build`, `--dispositivo iphone` y `--dispositivo ipad`, y `scripts/medir-carrusel.mjs --geometria`. Va a `evidencia/2026-11-XX_019-linea-base.txt` (CA2, CA14 y CA15).
- **Tras T2 (geometria movida):** CA14 → `evidencia/2026-11-XX_019-geometria.txt`.
- **Cierre:**
  - CA1, CA2, CA3 a CA13 (seccion `transicion`, 10 repeticiones por album en CA10) y CA16 → `evidencia/2026-11-XX_019-cierre.txt`.
  - CA15 → `evidencia/2026-11-XX_019-dispositivo.txt`.
  - CA17: Javi, en `npm run dev` y en la preview de Vercel.
- **Produccion:** tras el merge, la seccion `transicion` contra el dominio publico → `evidencia/2026-11-XX_019-produccion.txt`.

Mientras siga sin decidirse como se guarda la evidencia (`docs/ESTADO.md`, "Esperando a"), las salidas van al scratchpad y Javi las copia.

---
description: Mide el estado real del sitio (tipos, lint, build, consola e invariantes) y guarda la evidencia
---

Ejecuta el diagnostico del sitio.

1. Lanza `node scripts/diagnostico.mjs`. Guarda su salida completa en `evidencia/AAAA-MM-DD_diagnostico.txt` usando la fecha de `date +%F`. Nunca edites ese fichero a mano.
2. Si falta Playwright, dilo y para: `npm i -D playwright && npx playwright install chromium`.
3. Responde exactamente con este formato y nada mas:

```
DIAGNOSTICO <fecha> · <rama> · <hash corto>

tsc          <ok | N errores>
lint         <ok | N errores, N avisos>
build        <ok | falla>
consola      <N errores> en <N rutas>
invariantes  <N de N>

FALLOS
- <ruta o invariante> · <mensaje literal, sin parafrasear>

EVIDENCIA: evidencia/<fecha>_diagnostico.txt
```

4. **Si hay fallos, no los interpretes como problemas de diseno.** Un `ReferenceError` en consola significa que la pagina no se esta ejecutando: cualquier juicio sobre animacion, posicion, ritmo o composicion es invalido hasta que el diagnostico este verde. Dilo explicitamente y no sigas a otra cosa.
5. No arregles nada en este comando. Solo mide e informa.

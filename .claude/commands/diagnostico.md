---
description: Mide el estado real del sitio (tipos, lint, build, consola e invariantes) y guarda la evidencia
---

Ejecuta el diagnostico del sitio.

1. Lanza `node scripts/diagnostico.mjs`. Guarda su salida completa en `evidencia/AAAA-MM-DD_diagnostico.txt` usando la fecha de `date +%F`. Nunca edites ese fichero a mano.
   - Para medir la web desplegada: `node scripts/diagnostico.mjs --url https://javisu-photography-portfolio.vercel.app --repeticiones 3`. No ejecuta tsc, lint ni build y no arranca `next dev`. Usa el dominio publico: las URLs de cada despliegue (`...-<hash>-javisuus-projects.vercel.app`) estan protegidas con login, y el harness sale con 2 si lo detecta. Guarda la salida en `evidencia/AAAA-MM-DD_diagnostico_produccion.txt`.
   - La seccion `entrada /` (tambien en local) es informativa y no una invariante: frame del arranque, fase B, reposo y frames de mas de 50 ms de la entrada del landing.
   - Para saber que ocupa ese frame del arranque, aparte y no en cada diagnostico: `node scripts/perfil-arranque.mjs --url <dominio publico> --repeticiones 3` o `--local-prod` (`next build --no-mangling` + `next start` en :3102, nombres legibles). Reparte el frame por categorias y da el top 10 de funciones (spec 006). El trace crudo va al temporal o a `--trace-dir`, nunca a `evidencia/`. Ojo: en local las fotos llegan como WebP pequenos y en produccion como el AVIF original, asi que local no da las cifras de produccion.
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

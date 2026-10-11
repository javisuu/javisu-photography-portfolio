---
description: Mide la geometria real de una ruta en el navegador y la contrasta con el spec
argument-hint: <ruta, p. ej. / o /atlas>
---

Mide la ruta `$ARGUMENTS`.

1. Si esta vacio, usa `/`.
2. Lanza `node scripts/diagnostico.mjs --medir $ARGUMENTS`. Guarda la salida en `evidencia/AAAA-MM-DD_medir-<ruta-con-guiones>.txt`.
3. Responde con:

```
RUTA: <ruta> · <ancho>x<alto> · dpr <n>

GEOMETRIA
<una linea por cifra medida>

CONTRA EL SPEC
<cifra> medida <valor> · spec dice <valor> · <coincide | DESVIA>

CONSOLA
<N errores, N avisos> (o "limpia")
```

4. Reglas de interpretacion, importantes:
   - Si la consola tiene errores, **la geometria no es valida**. Una pagina que lanza una excepcion deja estados a medio aplicar que parecen defectos de diseno y no lo son. Dilo y para.
   - Si el visor del navegador devuelve `innerWidth` 0 o la fuente resuelve al suelo del `clamp()`, la medida no vale. Dilo y para.
   - No propongas cambios en este comando. Solo mide e informa. El cambio sale de una spec.

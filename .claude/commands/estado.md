---
description: Resume fase, estado del build, bloqueos y siguiente paso. No escribe nada.
---

Lee `docs/ESTADO.md` y `docs/ROADMAP.md`. Ejecuta `date +%F`, `git branch --show-current`, `git status --short`, `git log --oneline -5` y `ls -t evidencia/*diagnostico* 2>/dev/null | head -1`.

No modifiques ningun fichero. Responde exactamente con este formato y nada mas:

```
FASE: <fase de ROADMAP.md> · falta: <que cierra la fase>
ACTUALIZADO: <fecha de ESTADO.md>

BUILD
<verde | ROTO: N errores> · ultimo diagnostico: <fecha> (hace N dias)
<una linea por defecto abierto de ESTADO.md, los que bloquean primero>

ROADMAP (<fase actual>)
Hecho <n>/<total> · Pendiente: <tareas separadas por " · ">

BLOQUEOS
- <bloqueo> (o "ninguno")

SIGUIENTE
<primer punto de "Proximos pasos" de ESTADO.md> — depende de: <dependencia o "nada">
<los dos siguientes, uno por linea, con [listo | bloqueado: motivo]>

ESPERANDO A
- <quien>: <que> (pedido el <fecha>, hace N dias)

REPO
<rama> · <limpio | N ficheros sin commit> · ultimo commit: <hash corto> <asunto>
```

Reglas:
- "SIGUIENTE" sale de la lista "Proximos pasos" de `ESTADO.md`, en su orden. No hay calendario ni horas: Javi no mide el tiempo de este proyecto.
- Un paso esta `bloqueado` si su dependencia aparece en "Esperando a".
- Marca con ⚠ lo que lleve mas de 7 dias en "Esperando a".
- Anade una linea `AVISO:` si `ESTADO.md` tiene mas de 7 dias, si el ultimo diagnostico tiene mas de 3 dias, si hay defectos abiertos marcados `bloquea` o si `ESTADO.md` contradice el `git log`.
- **Si BUILD esta ROTO, no propongas trabajo de diseno ni de animacion.** Di que el siguiente paso es arreglarlo y para ahi.

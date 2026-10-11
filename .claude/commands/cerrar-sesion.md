---
description: Ejecuta el diagnostico, actualiza docs/ESTADO.md y propone el commit
---

Cierra la sesion.

1. **Diagnostico primero.** Ejecuta `/diagnostico`. No sigas sin su salida: el estado que se escribe en `docs/` tiene que estar medido, no recordado. Si el diagnostico no se puede ejecutar (puerto ocupado, Playwright sin instalar), dilo y marca el cierre entero como `SIN VERIFICAR`.
2. **Resume** lo hecho en 3 a 6 lineas: hechos, no intenciones. Cada afirmacion con su evidencia (`ruta:linea` o `evidencia/...`).
3. **Actualiza `docs/ESTADO.md`**: fecha de ultima actualizacion, fase, tabla de entregables, seccion "Defectos abiertos" (con la salida del diagnostico, literal), bloqueos, proximos pasos y una fila nueva en "Registro de sesiones". No se registran horas ni hay calendario por dias: Javi no mide el tiempo de este proyecto.
4. **Proximos pasos.** Rehaz la lista ordenada de "Proximos pasos":
   - Cada paso es concreto: que fichero, que comando, que documento sale.
   - Un defecto que bloquea va antes que cualquier tarea de diseno.
   - Si un paso depende de material de Javi (fotos, textos, coordenadas, decision de diseno), esa dependencia va en "Esperando a", y el paso dice que se hace en su lugar si no llega.
5. **Actualiza `docs/ROADMAP.md`** si alguna tarea cambio de estado.
6. **Comprueba** que nada anadido a `docs/` en esta sesion carece de evidencia. Lo que carezca, marcalo `SIN VERIFICAR`.
7. **Muestra** `git status --short` y propon un mensaje de commit. Haz el commit solo si Javi lo confirma. **Nunca hagas push.**

Termina con este bloque:

```
BUILD: <verde | ROTO: resumen>

SIGUIENTE
<primer paso> — depende de: <dependencia o "nada">
<los dos siguientes, uno por linea, con [listo | bloqueado: motivo]>

ESPERANDO A
- <quien>: <que> (hace N dias)
```

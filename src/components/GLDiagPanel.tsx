"use client";

// Panel de diagnostico de GLSurface (spec 018, CA5). Solo existe con ?diag en
// la URL de la primera carga: sin el parametro devuelve null y no añade nada
// al DOM. Sirve para ver en un movil sin consola (Safari de iOS sin Mac) por
// que no se pintan las fotos.

import { useEffect, useState, useSyncExternalStore } from "react";
import { glDiagSnapshot, type GLDiagState } from "@/motion/glDiag";

const noSubscribe = () => () => {};
// Se decide una vez por carga: una navegacion blanda quita ?diag de la URL
// y el panel debe seguir.
let diagAlCargar: boolean | null = null;
function conDiag() {
  if (diagAlCargar === null) diagAlCargar = new URLSearchParams(window.location.search).has("diag");
  return diagAlCargar;
}

function linea(s: GLDiagState) {
  const tex = s.texturaMayor ? `${s.texturaMayor[0]}x${s.texturaMayor[1]}` : "—";
  return [
    `GL · ${s.nombre}`,
    `contexto ${s.contexto} · perdido ${s.perdido ? "si" : "no"} · programa ${s.programa === null ? "—" : s.programa ? "ok" : "FALLA"}`,
    `texturas ${s.subidas} de ${s.total} · mayor ${tex} · max GPU ${s.maxTextura ?? "—"}`,
    `fallos de decodificacion ${s.fallosDecodificacion} · caida al DOM: ${s.fallo ?? "no"}`,
    `ultimo error: ${s.ultimoError ?? "—"}`,
  ].join("\n");
}

export default function GLDiagPanel() {
  // false en el servidor y en la hidratacion; el valor real despues, sin
  // diferencia de hidratacion.
  const on = useSyncExternalStore(noSubscribe, conDiag, () => false);
  const [estado, setEstado] = useState<GLDiagState[]>([]);

  useEffect(() => {
    if (!on) return;
    const leer = () => setEstado(glDiagSnapshot().map((s) => ({ ...s })));
    const id = window.setInterval(leer, 500);
    const primero = window.setTimeout(leer, 0);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(primero);
    };
  }, [on]);

  if (!on) return null;
  const pantalla = `${window.innerWidth}x${window.innerHeight} · dpr ${window.devicePixelRatio}`;
  return (
    <div
      data-gl-diag
      className="pointer-events-none fixed bottom-2 left-2 z-[100] max-w-[calc(100vw-16px)] whitespace-pre-wrap bg-[#FAFAFA]/95 p-2 font-mono text-[11px] leading-[1.35] text-[#111111]"
    >
      {`diag · ${pantalla}\n`}
      {estado.length ? estado.map(linea).join("\n\n") : "GL · ninguna instancia todavia"}
    </div>
  );
}

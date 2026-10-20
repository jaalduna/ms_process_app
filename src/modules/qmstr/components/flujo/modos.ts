import type { Entrega, ModoTanda } from "../../types"

/** Modos de una tanda lanzada a mano (diálogo de lanzamiento y detalle de una base). */
export const MODOS: { modo: ModoTanda; titulo: string; texto: string }[] = [
  { modo: "completo", titulo: "Completo", texto: "Corre, valida el zip, lo envía a DQ con ticket (MTR como observador) y, cerrado el ticket, registra el hito 10 y avisa a MTR." },
  { modo: "solo_correr", titulo: "Solo correr", texto: "Solo la corrida en Databricks, para probar. Sin ticket, avisos ni hito 10." },
]

/** Los modos según cómo entrega el flujo: con PythonCac "completo" aplica en J, sin ticket ni hito 10. */
export function modosDe(entrega: Entrega): typeof MODOS {
  if (entrega !== "pythoncac") return MODOS
  return MODOS.map((m) =>
    m.modo === "completo"
      ? { ...m, texto: "Corre, valida y aplica los cambios en J. Las bases que no pasen la validación previa quedan fuera, con su motivo." }
      : { ...m, texto: "Solo la corrida en Databricks, para probar. No aplica nada en J." },
  )
}

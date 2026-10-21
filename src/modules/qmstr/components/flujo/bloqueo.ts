import type { Entrega, FlujoBase, ModoTanda } from "../../types"

/**
 * Por qué una base no se puede elegir (null = se puede). Una base aplicada solo se bloquea en modo completo con
 * ticket ("solo correr" no aplica nada en J). Con entrega directa volver a correrla es el caso común (p. ej. tras una
 * recalibración): no se bloquea, se avisa (`advertencia`).
 */
export function bloqueo(b: FlujoBase, modo: ModoTanda, entrega: Entrega = "ticket"): string | null {
  if (b.estado === "fuera_de_alcance") return "Fuera de alcance de QMS-TR"
  if (b.estado === "en_proceso") return `Ya está en la tanda ${b.tanda_numero}`
  if (b.estado === "aplicada" && modo === "completo" && entrega !== "pythoncac") return "Ya tiene QMS-TR aplicado: revírtela primero"
  return null
}

/** Lo que conviene saber antes de lanzar una base elegida (null = nada). Con entrega directa. */
export function advertencia(b: FlujoBase): string | null {
  if (b.estado === "aplicada") return "Ya tiene QMS-TR aplicado: esta corrida pisa sus resultados anteriores"
  if (!b.h3) return "Sin distribución de actos (hito 3) registrada: confirma que Calibración la firmó"
  if (b.estado === "bypass" && b.motivo_bypass) return `La corrida anterior la dejó sin ajustes: ${b.motivo_bypass}`
  return null
}

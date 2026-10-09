import type { FlujoBase, ModoTanda } from "../../types"

/** Por qué una base no se puede elegir (null = se puede). Una base aplicada solo se bloquea en modo completo: "solo correr" no aplica nada en J. */
export function bloqueo(b: FlujoBase, modo: ModoTanda): string | null {
  if (b.estado === "fuera_de_alcance") return "Fuera de alcance de QMS-TR"
  if (b.estado === "en_proceso") return `Ya está en la tanda ${b.tanda_numero}`
  if (b.estado === "aplicada" && modo === "completo") return "Ya tiene QMS-TR aplicado: revírtela primero"
  return null
}

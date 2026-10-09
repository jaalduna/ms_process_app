import type { FlujoBase } from "../../types"

/** Por qué una base no se puede elegir (null = se puede). */
export function bloqueo(b: FlujoBase): string | null {
  if (b.estado === "fuera_de_alcance") return "Fuera de alcance de QMS-TR"
  if (b.estado === "en_proceso") return `Ya está en la tanda ${b.tanda_numero}`
  if (b.estado === "aplicada") return "Ya tiene QMS-TR aplicado: revírtela primero"
  return null
}

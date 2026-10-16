import type { ModoTanda } from "../../types"

/** Modos de una tanda lanzada a mano (diálogo de lanzamiento y detalle de una base). */
export const MODOS: { modo: ModoTanda; titulo: string; texto: string }[] = [
  { modo: "completo", titulo: "Completo", texto: "Corre, valida el zip, lo envía a DQ con ticket (MTR como observador) y, cerrado el ticket, registra el hito 10 y avisa a MTR." },
  { modo: "solo_correr", titulo: "Solo correr", texto: "Solo la corrida en Databricks, para probar. Sin ticket, avisos ni hito 10." },
]

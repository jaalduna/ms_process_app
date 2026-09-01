import type { JVersion } from "@/types/api"

/** `14253458` -> `14.253.458` (separador de miles chileno). */
export function formatRows(n: number | null | undefined): string | null {
  if (n === null || n === undefined) return null
  return n.toLocaleString("es-CL")
}

/** `2026-08-06T13:47:06.000Z` -> `06-08-2026 13:47`. */
export function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Línea secundaria de una versión: lo que hace informada la elección.
 *
 * El rango de períodos no es decorativo. Dos versiones con nombre parecido
 * pueden cubrir rangos distintos — los respaldos `_V0`/`_V1` de bolivia en SQL
 * Server arrancan en 202201 mientras la tabla viva arranca en 202101 —, así que
 * sin mostrarlo alguien puede calibrar con un año menos de historia sin enterarse.
 */
export function versionSummary(v: JVersion): string {
  const parts = [formatTimestamp(v.delta_timestamp)]
  const rows = formatRows(v.row_count)
  if (rows) parts.push(`${rows} filas`)
  if (v.period_min && v.period_max) parts.push(`períodos ${v.period_min}–${v.period_max}`)
  parts.push(snapshotScope(v))
  return parts.join(" · ")
}

/**
 * Alcance del snapshot: cuántas tablas del input congela (JAA-1121).
 *
 * El tag fija todo el bronze que el pipeline lee — padrón, pesos, diccionarios —,
 * no solo J. Hay que mostrarlo porque los registros anteriores a JAA-1121 solo
 * fijan J: elegir uno de esos reproduce las compras pero NO el resto del input,
 * y sin decirlo alguien creería que la corrida es reproducible cuando no lo es.
 */
export function snapshotScope(v: JVersion): string {
  const n = v.tables?.length ?? 0
  const missing = v.missing_tables?.length ?? 0
  if (n <= 1) return "solo J fijada"
  return missing > 0 ? `${n} tablas fijadas (faltan ${missing})` : `${n} tablas fijadas`
}

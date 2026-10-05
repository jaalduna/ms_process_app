/**
 * El instante de QMS-TR se interpreta SIEMPRE en hora de Chile (America/Santiago): es la hora en que
 * trabajan el CDC de J (ciclos 06:00–19:00) y los analistas, no la del navegador de quien lo abre.
 */
export const TZ_CHILE = "America/Santiago"

function partes(date: Date): Record<string, number> {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ_CHILE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
  return Object.fromEntries(
    fmt.formatToParts(date).filter((p) => p.type !== "literal").map((p) => [p.type, Number(p.value)]),
  )
}

/** Offset de Chile (minutos respecto de UTC) vigente en `date`. */
function offsetChile(date: Date): number {
  const p = partes(date)
  const comoUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((comoUtc - date.getTime()) / 60_000)
}

/** "2026-09-29T15:45" (hora de Chile, valor de <input type="datetime-local">) -> ISO UTC. */
export function chileLocalToIso(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) throw new Error(`instante inválido: ${local}`)
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  // dos pasadas: el offset depende del instante, que depende del offset (cambio de horario)
  let utc = guess - offsetChile(new Date(guess)) * 60_000
  utc = guess - offsetChile(new Date(utc)) * 60_000
  return new Date(utc).toISOString()
}

/** ISO -> "2026-09-29T15:45" en hora de Chile (para el <input>). */
export function isoToChileLocal(iso: string): string {
  const p = partes(new Date(iso))
  const z = (n: number) => String(n).padStart(2, "0")
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`
}

/** "16:08 del 29-09" en hora de Chile. */
export function formatChile(iso: string): string {
  const p = partes(new Date(iso))
  const z = (n: number) => String(n).padStart(2, "0")
  return `${z(p.hour)}:${z(p.minute)} del ${z(p.day)}-${z(p.month)}`
}

/** Mes anterior al instante dado, AAAAMM (el mes que se procesa en QMS-TR). */
export function mesAnterior(now: Date): string {
  const p = partes(now)
  const y = p.month === 1 ? p.year - 1 : p.year
  const m = p.month === 1 ? 12 : p.month - 1
  return `${y}${String(m).padStart(2, "0")}`
}

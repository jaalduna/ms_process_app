import type { CSSProperties } from "react"
import type { Kpi, Nivel, ParamDef } from "./types"

const es = "es-CL"

export const num = (n: number) => n.toLocaleString(es, { maximumFractionDigits: 0 })

/** Fracción → porcentaje: 0.0612 → "6,1%". */
export const pct = (x: number, decimales = 1) =>
  `${(x * 100).toLocaleString(es, { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`

/** Error del IPF como fracción → porcentaje con 4 decimales (la meta es 0,0010%). */
export const err = (x: number) =>
  `${(x * 100).toLocaleString(es, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}%`

/** Diferencia en puntos porcentuales, con signo: 0.3 → "+0,3 pp". */
export const pp = (d: number) =>
  `${d >= 0 ? "+" : ""}${d.toLocaleString(es, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} pp`

export function valorKpi(k: Kpi): string {
  if (k.formato === "pct") return pct(k.valor)
  if (k.formato === "err") return err(k.valor)
  if (k.formato === "seg") return `${k.valor.toLocaleString(es, { maximumFractionDigits: 1 })} s`
  return num(k.valor)
}

export function valorParametro(d: ParamDef, v: number | boolean): string {
  if (typeof v === "boolean") return v ? "Sí" : "No"
  if (d.formato === "pct") return pct(v, 0)
  if (d.formato === "percentil") return `p${v} / p${100 - v}`
  return v.toLocaleString(es, { maximumFractionDigits: 2 })
}

/** Tono semántico de un nivel. Los estados no usan el verde ni el amarillo de marca. */
export const TONO: Record<Nivel | "neutro" | "pendiente", string> = {
  ok: "var(--success)",
  aviso: "var(--warning)",
  error: "var(--destructive)",
  neutro: "var(--muted-foreground)",
  pendiente: "var(--muted-foreground)",
}

/** Texto en un tono semántico, mezclado con el foreground para que pase contraste en ambos modos.
 * En oklab y no en oklch: en oklch el ámbar (70°) y el foreground azulado (240°) interpolan el tono
 * por el camino corto y el aviso salía verde. */
export const textoTono = (tono: string): CSSProperties => ({
  color: `color-mix(in oklab, ${tono} 62%, var(--foreground))`,
})

export function periodoLabel(p: string): string {
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
  return `${meses[parseInt(p.slice(4), 10) - 1]} ${p.slice(0, 4)}`
}

export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString(es, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

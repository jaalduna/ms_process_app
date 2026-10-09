import type { CSSProperties } from "react"
import { AxiosError } from "axios"
import type { EstadoBase, EstadoTanda, TipoTanda } from "../../types"

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
  "noviembre", "diciembre"]

/** "202609" -> "septiembre 2026". */
export function periodoLabel(periodo: string): string {
  const m = /^(\d{4})(\d{2})$/.exec(periodo)
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) throw new Error(`período inválido: ${periodo}`)
  return `${MESES[Number(m[2]) - 1]} ${m[1]}`
}

/** Variable CSS del tono de cada estado de base (definida en index.css bajo .qf). */
export const TONO_BASE: Record<EstadoBase, string> = {
  aplicada: "var(--qf-aplicada)",
  en_proceso: "var(--qf-en-proceso)",
  pendiente: "var(--qf-pendiente)",
  retenida: "var(--qf-retenida)",
  revertida: "var(--qf-revertida)",
  bypass: "var(--qf-bypass)",
  sin_hito4: "var(--qf-sin-hito4)",
  fuera_de_alcance: "var(--qf-fuera)",
}

export const TONO_TANDA: Record<EstadoTanda, string> = {
  detectada: "var(--qf-bypass)",
  corriendo: "var(--qf-en-proceso)",
  armando_reversion: "var(--qf-revertida)",
  enviando: "var(--qf-pendiente)",
  en_dq: "var(--qf-pendiente)",
  verificando: "var(--qf-pendiente)",
  hito10: "var(--qf-pendiente)",
  cerrada: "var(--qf-aplicada)",
  revision_manual: "var(--qf-error)",
  sin_bases: "var(--qf-bypass)",
}

export const TONO_TIPO: Record<TipoTanda, string> = {
  liberacion: "var(--primary)",
  manual: "var(--qf-retenida)",
  reversion: "var(--qf-revertida)",
}

/** Mensaje legible de un error de la API ({error, message}) o de red. */
export function mensajeError(e: unknown): string {
  if (e instanceof AxiosError) {
    // La API responde {detail: {error, message}} en los errores de negocio y {detail: [{msg, loc}]} en
    // los 422 de validación de FastAPI; el mock, {message}.
    const d = e.response?.data as
      | { message?: string; detail?: { message?: string } | { msg?: string }[] | string }
      | undefined
    const det = d?.detail
    const deFastApi = Array.isArray(det) ? det.map((x) => x.msg).filter(Boolean).join("; ") : undefined
    return d?.message ?? (typeof det === "string" ? det : Array.isArray(det) ? deFastApi : det?.message) ?? e.message
  }
  return (e as Error).message
}

/** "recién" / "hace 3 min" / "hace 2 h" respecto de `ahora` (para instantes pasados). */
export function relativo(iso: string, ahora: number): string {
  // `ahora` avanza a saltos (useNow cada 30 s): un instante pasado recién llegado de la API puede
  // quedar "adelante" del reloj de la vista. Es pasado, así que no se dice "en 17 s".
  const s = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000))
  if (s < 10) return "recién"
  const txt = s < 60 ? `${s} s` : s < 3600 ? `${Math.round(s / 60)} min` : s < 86_400
    ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86_400)} d`
  return `hace ${txt}`
}

/** "1 base", "3 bases". */
export const nBases = (n: number) => `${n} ${n === 1 ? "base" : "bases"}`

/** Estilo inline que fija el tono (`--tone`) que usan .qf-tone y las clases bg-[var(--tone)]. */
export const tono = (t: string) => ({ "--tone": t }) as CSSProperties

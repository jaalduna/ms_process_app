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
    const d = e.response?.data as { message?: string; detail?: { message?: string } } | undefined
    return d?.message ?? d?.detail?.message ?? e.message
  }
  return (e as Error).message
}

/** "hace 3 min" / "hace 2 h" / "en 4 min" respecto de `ahora`. */
export function relativo(iso: string, ahora: number): string {
  const s = Math.round((ahora - new Date(iso).getTime()) / 1000)
  const abs = Math.abs(s)
  const txt = abs < 60 ? `${abs} s` : abs < 3600 ? `${Math.round(abs / 60)} min` : abs < 86_400
    ? `${Math.round(abs / 3600)} h` : `${Math.round(abs / 86_400)} d`
  return s >= 0 ? `hace ${txt}` : `en ${txt}`
}

/** Estilo inline que fija el tono (`--tone`) que usan .qf-tone y las clases bg-[var(--tone)]. */
export const tono = (t: string) => ({ "--tone": t }) as CSSProperties

import type { CSSProperties } from "react"
import { AxiosError } from "axios"
import type { BloqueoReversion, EstadoBase, EstadoTanda, Tanda, TandaProgreso, TipoTanda } from "../../types"

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
  esperando_liberacion: "var(--qf-espera)",
  revertida: "var(--qf-revertida)",
  bypass: "var(--qf-bypass)",
  sin_hito4: "var(--qf-sin-hito4)",
  fuera_de_alcance: "var(--qf-fuera)",
}

export const TONO_TANDA: Record<EstadoTanda, string> = {
  detectada: "var(--qf-bypass)",
  corriendo: "var(--qf-en-proceso)",
  armando_reversion: "var(--qf-revertida)",
  validando: "var(--qf-en-proceso)",
  en_revision: "var(--qf-retenida)",
  enviando: "var(--qf-pendiente)",
  aplicando: "var(--qf-en-proceso)",
  en_dq: "var(--qf-pendiente)",
  hito10: "var(--qf-pendiente)",
  cerrada: "var(--qf-aplicada)",
  revision_manual: "var(--qf-error)",
  sin_bases: "var(--qf-bypass)",
  cancelada: "var(--qf-bypass)",
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

/** El loop no responde: la última vuelta es más vieja que 3 intervalos. */
export function loopSinResponder(ultimaVuelta: string | null, intervaloSegundos: number, ahora: number): boolean {
  if (!ultimaVuelta) return false
  return ahora - new Date(ultimaVuelta).getTime() > 3 * intervaloSegundos * 1000
}

/** "1 base", "3 bases". */
export const nBases = (n: number) => `${n} ${n === 1 ? "base" : "bases"}`

/** Estilo inline que fija el tono (`--tone`) que usan .qf-tone y las clases bg-[var(--tone)]. */
export const tono = (t: string) => ({ "--tone": t }) as CSSProperties

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** Aviso de una base bloqueada: cuántos actos, por qué motivos, quiénes y cuándo. */
export function avisoBloqueo(b: BloqueoReversion): string {
  const motivos = Object.entries(b.motivos)
    .map(([m, n]) => `motivo ${m} (${n})`)
    .join(", ")
  const quienes = b.usuarios.map((u) => u.replace(/^WP\\/i, "")).join(", ")
  const cuando = b.desde && b.hasta ? (diaMes(b.desde) === diaMes(b.hasta) ? diaMes(b.desde) : `${diaMes(b.desde)}–${diaMes(b.hasta)}`) : ""
  return [`${b.actos} ${b.actos === 1 ? "acto cambiado" : "actos cambiados"} en J después de QMS-TR`, motivos, quienes && `por ${quienes}`, cuando]
    .filter(Boolean)
    .join(" · ")
}

/** Minutos que se suman a la corrida real para la validación y la aplicación en J (aproximado). */
export const MIN_TRAS_CORRIDA = 5

/**
 * Hora aproximada en que la tanda termina, para organizarse (no es exacta). En demo, con la duración fija de cada
 * paso; en una corrida real, extrapolando el avance de Databricks (productos listos sobre el total) más unos minutos
 * de validación y aplicación. null si todavía no hay con qué estimar o la tanda no está avanzando.
 */
export function finEstimado(
  t: Pick<Tanda, "estado" | "tipo" | "pausada" | "updated_at">,
  camino: EstadoTanda[],
  duraciones: Partial<Record<EstadoTanda, number>> | null | undefined,
  progreso: TandaProgreso | null | undefined,
  ahora: number = Date.now(),
): Date | null {
  if (t.pausada || t.estado === "cerrada" || t.estado === "cancelada" || !camino.includes(t.estado)) return null
  if (duraciones) {
    const resto = camino.slice(camino.indexOf(t.estado) + 1).filter((e) => e !== "cerrada")
    const enEste = Math.max(0, (duraciones[t.estado] ?? 0) - (ahora - Date.parse(t.updated_at)) / 1000)
    // cada paso espera además la vuelta siguiente del aplicativo (cada minuto): medio minuto en promedio
    const seg = enEste + resto.reduce((n, e) => n + (duraciones[e] ?? 0) + 30, 30)
    return new Date(ahora + seg * 1000)
  }
  if (t.estado !== "corriendo" || !progreso?.inicio) return null
  const hechos = progreso.productos_listos + progreso.productos_fallidos
  if (hechos === 0 || progreso.productos_total === 0) return null
  const inicio = Date.parse(progreso.inicio)
  const fin = inicio + ((ahora - inicio) * progreso.productos_total) / hechos
  return new Date(fin + MIN_TRAS_CORRIDA * 60_000)
}

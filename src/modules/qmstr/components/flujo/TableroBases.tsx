import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { formatChile } from "../../time"
import { ESTADOS_BASE, ETAPA_BASE_LABEL, estadosBase, labelEstadoBase, type Entrega, type EstadoBase, type EstadoTanda, type FlujoBase } from "../../types"
import { TONO_BASE, periodoLabel, tono } from "./formato"

const ORDEN = ESTADOS_BASE.map((e) => e.estado)

/** Etapas del camino de una base hasta quedar aplicada (la barra por etapa). */
const ETAPAS: { clave: string; label: string; tone: string; incluye: (b: FlujoBase) => boolean }[] = [
  { clave: "liberada", label: "Listas para QMS-TR", tone: "var(--qf-pendiente)", incluye: (b) => b.estado === "pendiente" },
  { clave: "corriendo", label: "En corrida", tone: "var(--qf-en-proceso)", incluye: (b) => en(b, ["detectada", "corriendo", "armando_reversion", "validando"]) },
  { clave: "revision", label: "En revisión", tone: "var(--qf-retenida)", incluye: (b) => en(b, ["en_revision", "revision_manual"]) },
  { clave: "dq", label: "Ticket en DQ", tone: "color-mix(in oklch, var(--qf-en-proceso) 55%, var(--qf-pendiente))", incluye: (b) => en(b, ["enviando", "en_dq"]) },
  { clave: "hito10", label: "Liberación QMS-TR (hito 10)", tone: "color-mix(in oklch, var(--qf-en-proceso) 40%, var(--qf-aplicada))", incluye: (b) => en(b, ["hito10"]) },
  { clave: "cerrada", label: "Terminadas", tone: "var(--qf-aplicada)", incluye: (b) => ["aplicada", "bypass", "revertida"].includes(b.estado) },
]

/** Con entrega PythonCac no hay ticket ni hito 10: una sola etapa de aplicación en J. */
const ETAPAS_PYTHONCAC = [
  ...ETAPAS.filter((e) => !["dq", "hito10"].includes(e.clave)).slice(0, 3),
  { clave: "aplicando", label: "Aplicando en J", tone: "color-mix(in oklch, var(--qf-en-proceso) 55%, var(--qf-pendiente))", incluye: (b: FlujoBase) => en(b, ["aplicando"]) },
  ETAPAS[ETAPAS.length - 1],
]

function en(b: FlujoBase, estados: EstadoTanda[]) {
  return b.estado === "en_proceso" && !!b.tanda_estado && estados.includes(b.tanda_estado)
}

interface TableroBasesProps {
  pais: string
  periodo: string
  bases: FlujoBase[]
  filtro: EstadoBase | null
  onFiltro: (e: EstadoBase | null) => void
  /** Abre el detalle de la base (estado, hitos, historial y lanzamiento). */
  onSeleccionar: (b: FlujoBase) => void
  entrega?: Entrega
}

/**
 * La isla deep teal: el país y el período en grande, una celda por base coloreada por estado (toda la
 * liberación de un vistazo), los KPIs y la barra por etapa. La leyenda filtra la tabla de bases; cada celda abre el
 * detalle de su base. Las celdas de bases en QMS-TR laten mientras su tanda avanza.
 */
export function TableroBases({ pais, periodo, bases, filtro, onFiltro, onSeleccionar, entrega = "ticket" }: TableroBasesProps) {
  const directo = entrega === "pythoncac"
  const pasos = directo ? ETAPAS_PYTHONCAC : ETAPAS
  const leyenda = estadosBase(entrega)
  // cada base tiene un lugar fijo (por código): al cambiar de estado cambia de color, no de lugar
  const ordenadas = useMemo(() => [...bases].sort((a, b) => a.producto - b.producto), [bases])
  const cuenta = useMemo(() => {
    const c = Object.fromEntries(ORDEN.map((e) => [e, 0])) as Record<EstadoBase, number>
    for (const b of bases) c[b.estado] += 1
    return c
  }, [bases])
  const conH4 = bases.filter((b) => b.h4 && !b.h4_anulado).length
  // con PythonCac la referencia es la distribución de actos (hito 3; el sign-off de calibración es un correo que no
  // queda en J) y QMS-TR va antes de la liberación: no hay retenidas por hito 4; lo que falta son bases sin distribución
  const kpis = [
    directo
      ? { label: "con distribución de actos (hito 3)", valor: bases.filter((b) => b.h3).length, de: bases.length, testid: "qf-kpi-h3" }
      : { label: "liberadas por DC (hito 4)", valor: conH4, de: bases.length, testid: "qf-kpi-h4" },
    { label: "en QMS-TR", valor: cuenta.en_proceso, testid: "qf-kpi-en-proceso", estado: "en_proceso" as const },
    { label: "QMS-TR aplicado", valor: cuenta.aplicada, testid: "qf-kpi-aplicadas", estado: "aplicada" as const },
    { label: "QMS-TR revertido", valor: cuenta.revertida, testid: "qf-kpi-revertidas", estado: "revertida" as const },
    directo
      ? { label: "sin distribución de actos", valor: cuenta.sin_hito4, testid: "qf-kpi-sin-distribucion", estado: "sin_hito4" as const }
      : cuenta.retenida > 0 || cuenta.esperando_liberacion === 0
      ? { label: "retenidas por DC", valor: cuenta.retenida, testid: "qf-kpi-retenidas", estado: "retenida" as const }
      : { label: "esperando liberación de DC", valor: cuenta.esperando_liberacion, testid: "qf-kpi-esperando-liberacion", estado: "esperando_liberacion" as const },
  ]
  const etapas = pasos.map((e) => ({ ...e, n: bases.filter(e.incluye).length }))
  const totalEtapas = etapas.reduce((s, e) => s + e.n, 0)

  return (
    <section
      aria-label={`Bases de ${pais} ${periodoLabel(periodo)}`}
      data-testid="qf-tablero"
      className="qf-island relative overflow-hidden rounded-2xl px-5 py-6 shadow-[0_18px_40px_-24px_rgb(0_74_82/0.65)] sm:px-8 sm:py-7"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-display text-4xl leading-none font-bold tracking-tight sm:text-5xl">{pais}</h2>
          <p className="mt-2 font-display text-xl font-normal text-white/75 first-letter:uppercase sm:text-2xl">
            {periodoLabel(periodo)}
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-5 sm:gap-x-6">
          {kpis.map((k) => (
            <div key={k.label} className="min-w-0" data-testid={k.testid}>
              <dt className="flex items-start gap-1.5 text-xs leading-tight text-white/70">
                {k.estado && <span aria-hidden style={tono(TONO_BASE[k.estado])} className="mt-0.5 size-2 shrink-0 rounded-full bg-[var(--tone)]" />}
                {k.label}
              </dt>
              <dd className="font-display text-2xl font-semibold whitespace-nowrap tabular-nums sm:text-3xl">
                {k.valor}
                {k.de !== undefined && <span className="ml-1 text-sm font-normal text-white/55 sm:text-base">/ {k.de}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* una celda por base */}
      <ul className="mt-7 flex flex-wrap gap-[3px]" aria-label="Bases por estado" data-testid="qf-celdas">
        {ordenadas.map((b) => {
          const apagada = filtro !== null && filtro !== b.estado
          const etapa = b.estado === "en_proceso" && b.tanda_estado ? ETAPA_BASE_LABEL[b.tanda_estado] : undefined
          const label = `${b.producto} ${b.nombre}: ${etapa ?? labelEstadoBase(b.estado, entrega)}`
          const hito = directo ? (b.h3 ? ` (distribución de actos, hito 3: ${formatChile(b.h3)})` : "") : b.h4 ? ` (liberación metodológica, hito 4: ${formatChile(b.h4)})` : ""
          return (
            <li key={b.producto} className="flex">
              <button
                type="button"
                onClick={() => onSeleccionar(b)}
                title={`${label}${hito}. Clic para ver el detalle`}
                aria-label={`${label}. Ver detalle`}
                data-estado={b.estado}
                data-testid={`qf-celda-${b.producto}`}
                style={tono(TONO_BASE[b.estado])}
                className={cn(
                  "size-3.5 cursor-pointer rounded-[3px] transition-[opacity,transform] duration-300 hover:scale-125 sm:size-4",
                  "focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none",
                  b.estado === "fuera_de_alcance" ? "qf-hatch ring-1 ring-white/15 ring-inset" : "bg-[var(--tone)]",
                  b.estado === "sin_hito4" && "bg-transparent ring-1 ring-white/30 ring-inset",
                  b.estado === "en_proceso" && !apagada && "qf-latido",
                  apagada && "opacity-20",
                )}
              />
            </li>
          )
        })}
      </ul>

      {/* leyenda = filtro */}
      <div className="mt-4 flex flex-wrap gap-1.5" data-testid="qf-leyenda">
        {leyenda.filter((e) => cuenta[e.estado] > 0).map((e) => {
          const activo = filtro === e.estado
          return (
            <button
              key={e.estado}
              type="button"
              title={e.ayuda}
              aria-pressed={activo}
              onClick={() => onFiltro(activo ? null : e.estado)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none",
                activo ? "bg-white text-[#004A52]" : "bg-white/8 text-white/85 hover:bg-white/15",
              )}
            >
              <span aria-hidden style={tono(TONO_BASE[e.estado])} className="size-2.5 rounded-[3px] bg-[var(--tone)]" />
              {e.label}
              <span className="tabular-nums opacity-70">{cuenta[e.estado]}</span>
            </button>
          )
        })}
      </div>

      {/* barra por etapa */}
      {totalEtapas > 0 && (
        <div className="mt-7" data-testid="qf-etapas">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
            {etapas.filter((e) => e.n > 0).map((e) => (
              <span
                key={e.clave}
                style={{ ...tono(e.tone), width: `${(e.n / totalEtapas) * 100}%` }}
                className={cn("h-full bg-[var(--tone)] transition-[width] duration-700", e.clave === "corriendo" && "qf-bar-live")}
              />
            ))}
          </div>
          <ol className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-white/75 sm:grid-cols-3 lg:grid-cols-6">
            {etapas.map((e) => (
              <li key={e.clave} className="flex items-center gap-1.5">
                <span aria-hidden style={tono(e.tone)} className="size-2 rounded-full bg-[var(--tone)]" />
                {e.label}
                <span className="font-semibold text-white tabular-nums">{e.n}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

import { useState } from "react"
import { toast } from "sonner"
import {
  Check, CheckCheck, ChevronDown, Download, ExternalLink, Eye, FlaskConical, Hourglass, Loader2, Pause, Play, Quote, RotateCcw, RotateCw, Ticket,
  Undo2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { downloadTandaZip, type AccionTanda } from "../../api"
import { useTandaProgreso } from "../../hooks/useQmsTrFlujo"
import { formatChile } from "../../time"
import {
  ESTADO_TANDA_LABEL, TANDA_ACTIVOS, TAREA_LABELS, caminoDe, type EstadoTanda, type FlujoModo, type ProgresoTarea, type Tanda,
} from "../../types"
import { TONO_TANDA, mensajeError, nBases, tono } from "./formato"
import { Chip, ChipTanda, ChipTipo } from "./piezas"

/** Bloqueo por GRANT pendiente (JAA-1442), distinto de una falla. */
const SIN_PERMISO = /^sin permiso (SELECT|INSERT|UPDATE) sobre /

const PASO_LABEL: Partial<Record<EstadoTanda, string>> = {
  detectada: "Detectada",
  corriendo: "Corrida",
  armando_reversion: "Zip inverso",
  enviando: "Ticket a DQ",
  en_dq: "DQ",
  verificando: "Verificación",
  hito10: "Hito 10",
  cerrada: "Cerrada",
}

/** Una tanda completa cierra avisando a MTR en el ticket de Jira; "solo correr" no tiene ticket. */
const pasoLabel = (paso: EstadoTanda, t: Pick<Tanda, "modo">) =>
  paso === "cerrada" && t.modo === "completo" ? "Aviso a MTR en Jira" : (PASO_LABEL[paso] ?? ESTADO_TANDA_LABEL[paso])

/** Stepper del camino de la tanda; en revisión manual marca en rojo el paso donde se detuvo. */
export function Stepper({ tanda }: { tanda: Tanda }) {
  const camino = caminoDe(tanda)
  const enRevision = tanda.estado === "revision_manual"
  const actual = enRevision ? camino.indexOf(tanda.estado_previo ?? "detectada") : camino.indexOf(tanda.estado)
  const cerrada = tanda.estado === "cerrada"
  return (
    <ol className="flex min-w-max items-start" data-testid="qf-stepper" aria-label="Avance de la tanda">
      {camino.map((paso, i) => {
        const hecho = i < actual || cerrada
        const esActual = i === actual && !cerrada
        const error = esActual && enRevision
        return (
          <li
            key={paso}
            className="flex flex-col items-center"
            data-paso={paso}
            data-estado={error ? "error" : hecho ? "hecho" : esActual ? "actual" : "pendiente"}
            aria-current={esActual ? "step" : undefined}
          >
            <div className="flex items-center">
              <span className={cn("h-0.5 w-6 sm:w-10", i === 0 ? "invisible" : hecho || esActual ? "bg-primary" : "bg-border")} />
              <span
                style={tono(error ? "var(--destructive)" : TONO_TANDA[paso])}
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border-2 text-[11px] font-semibold transition-colors",
                  hecho && "border-primary bg-primary text-primary-foreground",
                  esActual && !error && "border-[var(--tone)] bg-card text-foreground",
                  esActual && !error && !tanda.pausada && "qf-ring",
                  error && "border-destructive bg-destructive text-white",
                  !hecho && !esActual && "border-border bg-card text-muted-foreground",
                )}
              >
                {error ? <X className="size-3.5" /> : hecho ? <Check className="size-3.5" /> : esActual
                  ? tanda.pausada ? <Pause className="size-3" /> : <span className="size-2 rounded-full bg-[var(--tone)] qf-pulse" />
                  : i + 1}
              </span>
              <span className={cn("h-0.5 w-6 sm:w-10", i === camino.length - 1 ? "invisible" : hecho ? "bg-primary" : "bg-border")} />
            </div>
            <span className={cn("mt-1.5 text-[11px] whitespace-nowrap", esActual ? "font-semibold text-foreground" : "text-muted-foreground")}>
              {pasoLabel(paso, tanda)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function IconoTarea({ estado }: { estado: string }) {
  if (estado === "SUCCESS") return <Check className="size-3.5 text-[var(--qf-aplicada)]" />
  if (estado === "RUNNING") return <Loader2 className="size-3.5 animate-spin text-[var(--qf-en-proceso)]" />
  if (estado === "FAILED") return <X className="size-3.5 text-destructive" />
  return <span className="size-2 rounded-full border border-muted-foreground/50" />
}

function TareaForEach({ t }: { t: ProgresoTarea }) {
  const fe = t.for_each!
  const pct = fe.total ? (fe.completadas / fe.total) * 100 : 100
  return (
    <div className="space-y-1.5" data-tarea={t.clave}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium"><IconoTarea estado={t.estado} />{TAREA_LABELS[t.clave] ?? t.clave}</span>
        <span className="text-muted-foreground tabular-nums">
          {fe.completadas}/{fe.total}
          {fe.activas > 0 && <span className="ml-2 text-[color-mix(in_oklch,var(--qf-en-proceso)_60%,var(--foreground))]">{fe.activas} activas</span>}
          {fe.fallidas > 0 && <span className="ml-2 text-destructive">{fe.fallidas} fallidas</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-[var(--qf-en-proceso)] transition-[width] duration-700", t.estado === "RUNNING" && "qf-bar-live")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Progreso del run de Databricks; se refresca cada 10 s mientras la tanda está corriendo. */
function ProgresoCorrida({ tanda, verRun }: { tanda: Tanda; verRun: boolean }) {
  const { data, isLoading, error } = useTandaProgreso(tanda)
  // la corrida terminó: el backend ya trae el progreso final en la tanda
  const p = tanda.progreso ?? data
  const corriendo = tanda.estado === "corriendo"
  if (isLoading && !p) return <Skeleton className="h-24 w-full rounded-xl" />
  if (error && !p) return <p className="text-sm text-destructive" role="alert">No se pudo leer el progreso de la corrida: {mensajeError(error)}</p>
  if (!p) return null
  const simples = p.tareas.filter((t) => !t.for_each && !t.clave.startsWith("hay_"))
  const foreach = p.tareas.filter((t) => t.for_each)
  if (p.estado === "WAITING_SNAPSHOT") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-muted/30 p-4" data-testid="qf-progreso-espera" role="status">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-[var(--qf-en-proceso)]" />
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">Esperando el snapshot de J</p>
          <p className="text-muted-foreground">
            La corrida de {nBases(p.productos_total)} parte sola con el primer ciclo del CDC de J posterior al hito 4
            (cada hora, de 06:00 a 19:00 de Chile).
          </p>
        </div>
      </div>
    )
  }
  const link = verRun && p.run_page_url && (
    <a href={p.run_page_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
      Abrir el run en Databricks <ExternalLink className="size-3" />
    </a>
  )
  if (!corriendo) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid="qf-progreso-fin">
        <span className="inline-flex items-center gap-1.5"><CheckCheck className="size-3.5 text-[var(--qf-aplicada)]" />
          Corrida terminada: {p.productos_listos} de {p.productos_total} productos</span>
        {p.productos_fallidos > 0 && (
          <span className="font-medium text-warning" data-testid="qf-progreso-fallidos">
            · {p.productos_fallidos} con error (quedan en bypass)
          </span>
        )}
        {p.fin && <span>a las {formatChile(p.fin)}</span>}
        {link}
      </div>
    )
  }
  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4" data-testid="qf-progreso" data-porcentaje={p.porcentaje}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-4xl font-semibold tabular-nums" data-testid="qf-progreso-pct">{p.porcentaje}%</span>
          <span className="text-sm text-muted-foreground">
            {p.productos_listos} de {p.productos_total} productos listos
          </span>
          {p.productos_fallidos > 0 && (
            <span className="text-sm font-medium text-warning" data-testid="qf-progreso-fallidos">
              · {p.productos_fallidos} con error (quedan en bypass)
            </span>
          )}
        </div>
        {link}
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-[color-mix(in_oklch,var(--qf-en-proceso)_18%,transparent)]"
        role="progressbar" aria-valuenow={p.porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la corrida"
      >
        <div className="qf-bar-live h-full rounded-full bg-[var(--qf-en-proceso)] transition-[width] duration-1000 ease-out" style={{ width: `${p.porcentaje}%` }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {simples.map((t) => (
          <span key={t.clave} className="inline-flex items-center gap-1.5 text-xs" data-tarea={t.clave} data-estado={t.estado}>
            <IconoTarea estado={t.estado} />
            <span className={t.estado === "PENDING" ? "text-muted-foreground" : ""}>{TAREA_LABELS[t.clave] ?? t.clave}</span>
          </span>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {foreach.map((t) => <TareaForEach key={t.clave} t={t} />)}
      </div>
    </div>
  )
}

/** Avisos que el flujo dejó en el ticket de Jira: MTR como observador y la mención al validar o revertir. */
function AvisosJira({ tanda: t }: { tanda: Tanda }) {
  if (!t.envio.observadores && !t.envio.aviso_mtr) return null
  return (
    <ul className="flex flex-wrap items-center gap-1.5" data-testid="qf-avisos-jira" aria-label="Avisos en Jira">
      {t.envio.observadores && (
        <li><Chip tone="var(--qf-en-proceso)" data-testid="qf-aviso-observadores"><Eye className="size-3" />MTR observa {t.jira_key}</Chip></li>
      )}
      {t.envio.aviso_mtr && (
        <li>
          <Chip tone="var(--qf-aplicada)" data-testid="qf-aviso-mtr-publicado">
            <Check className="size-3" />{t.tipo === "reversion" ? "Reversión avisada a MTR en Jira" : "Aviso a MTR en Jira"}
          </Chip>
        </li>
      )}
    </ul>
  )
}

function Bitacora({ tanda }: { tanda: Tanda }) {
  const [todo, setTodo] = useState(false)
  const eventos = [...tanda.eventos].reverse()
  const visibles = todo ? eventos : eventos.slice(0, 3)
  return (
    <div data-testid="qf-bitacora">
      <ol className="relative space-y-3 border-l border-border pl-5">
        {visibles.map((e, i) => (
          <li key={`${e.at}-${i}`} className="relative">
            <span
              aria-hidden
              style={tono(TONO_TANDA[e.estado])}
              className={cn("absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card bg-[var(--tone)]")}
            />
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-semibold">{ESTADO_TANDA_LABEL[e.estado]}</span>
              <time className="text-muted-foreground tabular-nums" dateTime={e.at}>{formatChile(e.at)}</time>
            </div>
            {e.detalle && <p className="mt-0.5 text-sm text-muted-foreground">{e.detalle}</p>}
          </li>
        ))}
      </ol>
      {eventos.length > 3 && (
        <button type="button" onClick={() => setTodo(!todo)} className="mt-2 inline-flex items-center gap-1 pl-5 text-xs font-medium text-primary hover:underline">
          <ChevronDown className={cn("size-3.5 transition-transform", todo && "rotate-180")} />
          {todo ? "Ver menos" : `Ver toda la bitácora (${eventos.length})`}
        </button>
      )}
    </div>
  )
}

interface TandaCardProps {
  tanda: Tanda
  nombres: Map<number, string>
  modo: FlujoModo
  esAdmin: boolean
  /** Link al run de Databricks (solo admins, como en el resto de la app). */
  verRun: boolean
  origen?: Tanda
  ocupado: AccionTanda | null
  onAccion: (accion: AccionTanda) => void
  onRevertir: () => void
}

export function TandaCard({ tanda: t, nombres, modo, esAdmin, verRun, origen, ocupado, onAccion, onRevertir }: TandaCardProps) {
  const [verBases, setVerBases] = useState(false)
  const [bajando, setBajando] = useState(false)
  const activa = TANDA_ACTIVOS.includes(t.estado)
  const zipListo = !["detectada", "corriendo", "armando_reversion", "sin_bases"].includes(t.estado)
  // Una tanda sólo avanza (y se revierte) en el modo del flujo en que se creó.
  const deOtroModo = t.ejecucion !== modo
  // Sólo una tanda cerrada: mientras verifica o registra el hito 10 sus bases siguen en curso y la API
  // responde 409 (el hito 10 se escribiría después de anularlo). Solo correr no envía nada a DQ: no
  // hay cambios en J que revertir.
  const revertible = t.tipo !== "reversion" && t.modo !== "solo_correr" && t.estado === "cerrada" && !deOtroModo
  const v = t.validacion

  async function bajar() {
    setBajando(true)
    try {
      await downloadTandaZip(t.id)
    } catch (e) {
      toast.error(`No se pudo descargar el zip: ${mensajeError(e)}`)
    } finally {
      setBajando(false)
    }
  }

  const accion = (a: AccionTanda, label: string, Icon: typeof Pause, variant: "outline" | "default" = "outline") => (
    <Button variant={variant} size="sm" onClick={() => onAccion(a)} disabled={ocupado !== null} data-testid={`qf-accion-${a}`}>
      {ocupado === a ? <Loader2 className="animate-spin" /> : <Icon />}
      {label}
    </Button>
  )

  return (
    <article
      data-testid={`qf-tanda-${t.numero}`}
      data-estado={t.estado}
      data-tipo={t.tipo}
      style={tono(TONO_TANDA[t.estado])}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card text-card-foreground",
        activa && "shadow-[0_10px_30px_-18px_color-mix(in_oklch,var(--tone)_80%,transparent)]",
      )}
    >
      {activa && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-[var(--tone)]" />}
      <header className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 pt-5">
        <div className="flex items-baseline gap-2">
          <h3 className="font-display text-xl font-semibold">Tanda {t.numero}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <ChipTipo tipo={t.tipo} />
          <ChipTanda estado={t.estado} pausada={t.pausada} />
          {t.pausada && <Chip tone="var(--qf-retenida)" dot="solid">Pausada</Chip>}
          {t.modo === "solo_correr" && <Chip tone="var(--qf-bypass)">Solo correr</Chip>}
          {deOtroModo && (
            <Chip tone="var(--qf-retenida)" data-testid="qf-tanda-ejecucion"
              title={`Se creó con el flujo en modo ${t.ejecucion === "simulacion" ? "simulación" : "real"}: no avanza en este modo`}>
              <FlaskConical className="size-3" />{t.ejecucion === "simulacion" ? "Simulada" : "Real"}
            </Chip>
          )}
          {t.jira_key && (
            <Chip tone="var(--qf-pendiente)" className="font-semibold"><Ticket className="size-3" />{t.jira_key}</Chip>
          )}
        </div>
        <p className="w-full text-xs text-muted-foreground">
          {t.tipo === "reversion" && origen ? <>Revierte {nBases(t.productos.length)} de la tanda {origen.numero}. </> : null}
          {t.h4_desde === t.h4_hasta
            ? <>Hito 4 a las {formatChile(t.h4_hasta)}.</>
            : <>Hito 4 entre las {formatChile(t.h4_desde)} y las {formatChile(t.h4_hasta)}.</>}
          {t.creada_por && t.creada_por !== "qmstr_flujo" ? <> Lanzada por {t.creada_por}.</> : <> Detectada por el flujo.</>}
        </p>
        {t.nota && (
          <p className="flex w-full items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm" data-testid="qf-tanda-nota">
            <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span><span className="font-medium">{t.tipo === "reversion" ? "Motivo" : "Nota"}:</span> {t.nota}</span>
          </p>
        )}
      </header>

      <div className="space-y-5 px-5 py-4">
        <div className="-mx-5 overflow-x-auto px-5 pb-1"><Stepper tanda={t} /></div>

        {t.error && SIN_PERMISO.test(t.error) && (
          <div role="status" data-testid="qf-bloqueo-permiso"
            className="rounded-lg border border-[var(--qf-retenida)] bg-[color-mix(in_oklch,var(--qf-retenida)_10%,transparent)] px-3 py-2 text-sm">
            <p className="font-medium">Esperando un permiso de datos</p>
            <p>{t.error}</p>
            <p className="mt-1 text-xs text-muted-foreground">No es una falla: la tanda sigue sola cuando llegue el GRANT.</p>
          </div>
        )}
        {t.error && !SIN_PERMISO.test(t.error) && (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
            {t.error}
          </div>
        )}

        {t.snapshot_desde && (
          <p className="text-sm text-muted-foreground" data-testid="qf-snapshot-desde">
            Snapshot de J desde {formatChile(t.snapshot_desde)}
            <span className="block text-xs">Se toma después de lo aplicado o revertido.</span>
          </p>
        )}

        <AvisosJira tanda={t} />

        {t.tipo !== "reversion" && t.qms_run_id && <ProgresoCorrida tanda={t} verRun={verRun} />}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <button type="button" onClick={() => setVerBases(!verBases)} aria-expanded={verBases}
            className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary">
            <ChevronDown className={cn("size-4 transition-transform", verBases && "rotate-180")} />
            {nBases(t.productos.length)}
          </button>
          {t.bypass.length > 0 && <span className="text-muted-foreground">{t.bypass.length} sin ajustes</span>}
          {t.revisar.length > 0 && (
            <Chip tone="var(--qf-retenida)" data-testid="qf-tanda-revisar"
              title={t.revisar.map((r) => `${r.producto}: ${r.motivo}`).join("\n")}>
              {t.revisar.length === 1 ? "1 base a revisar" : `${t.revisar.length} bases a revisar`} antes del ticket
            </Chip>
          )}
          {v.status && (
            <span className="text-muted-foreground">
              Verificación en J: {v.applied ?? 0} de {v.checked ?? 0} aplicados
              {modo === "simulacion" && v.status === "no_aplicado" && " (esperable en simulación)"}
            </span>
          )}
        </div>
        {verBases && (
          <ul className="flex flex-wrap gap-1.5" data-testid="qf-tanda-bases">
            {t.productos.map((p) => (
              <li key={p}
                title={t.bypass_motivos[String(p)] ?? t.revisar.find((r) => r.producto === p)?.motivo}
                className={cn("rounded-md border px-2 py-0.5 text-xs",
                  t.bypass.includes(p) && "border-dashed text-muted-foreground",
                  t.revisar.some((r) => r.producto === p) && "border-[var(--qf-retenida)]")}>
                <span className="text-muted-foreground tabular-nums">{p}</span> {nombres.get(p) ?? ""}
              </li>
            ))}
          </ul>
        )}

        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground hover:text-foreground">
            <span className="inline-flex items-center gap-1">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /> Bitácora
              <span className="font-normal">({t.eventos.length})</span>
            </span>
          </summary>
          <div className="mt-3"><Bitacora tanda={t} /></div>
        </details>
      </div>

      <footer className="flex flex-wrap items-center justify-end gap-2 border-t bg-muted/25 px-5 py-3">
        {zipListo && (
          <Button variant="ghost" size="sm" onClick={bajar} disabled={bajando} data-testid="qf-accion-zip">
            {bajando ? <Loader2 className="animate-spin" /> : <Download />}
            Descargar zip
          </Button>
        )}
        {esAdmin && (
          <>
            {activa && !t.pausada && accion("pausar", "Pausar", Pause)}
            {t.pausada && accion("reanudar", "Reanudar", Play)}
            {t.estado === "revision_manual" && accion("reintentar", "Reintentar", RotateCw, "default")}
            {modo === "simulacion" && t.ejecucion === "simulacion" && t.estado === "en_dq" && !t.pausada && accion("simular_cierre_ticket", "Simular cierre del ticket", CheckCheck, "default")}
            {revertible && (
              <Button variant="outline" size="sm" onClick={onRevertir} disabled={ocupado !== null} data-testid="qf-accion-revertir">
                <Undo2 /> Revertir bases
              </Button>
            )}
          </>
        )}
        {!zipListo && !esAdmin && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><RotateCcw className="size-3.5" />Se actualiza sola</span>
        )}
      </footer>
    </article>
  )
}

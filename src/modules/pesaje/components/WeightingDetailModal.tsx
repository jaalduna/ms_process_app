import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Loader2,
  Play,
  RefreshCcw,
  RotateCcw,
  XCircle,
} from "lucide-react"
import { WeightingProgress } from "./WeightingProgress"
import { JSourceSelector } from "@/components/snapshot/JSourceSelector"
import { downloadWeightingCSV, getProcessSnapshots } from "@/lib/api"
import { J_SOURCE_SYNC } from "@/types/api"
import {
  useWeightingRun,
  useCancelWeighting,
} from "../hooks/useWeighting"
import { WEIGHTING_STEP_ORDER, WEIGHTING_STEP_LABELS, WEIGHTING_ACTIVE_STATUSES, WEIGHTING_STATUS_CONFIG, fmtSummaryFloat, fmtSummaryInt } from "../types"
import type { WeightingRun, WeightingStep } from "../types"
import { DEFAULT_WEIGHTING_PARAMS, EXECUTION_PARAM_KEYS, WEIGHTING_PARAM_FIELD_BY_KEY, type WeightingFieldDescriptor } from "../weightingParams"
import { COUNTRY_NAME_TO_CODE } from "../params/types"
import { useExecutionParams, usePublishWeightingParams } from "../params/hooks"
import { diffHyperparams, validateHyperparams } from "../params/validation"
import { COUNTRY_LABELS } from "@/lib/countries"
import { LiveDuration, parseUTC } from "@/lib/duration"

interface WeightingDetailModalProps {
  run: WeightingRun | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Launch/relaunch the pipeline with the currently published "De ejecución" params
   * (read-only here — edit them from the Parametros tab). When provided, the dialog
   * renders a run button ("Ejecutar" the first time, "Re-ejecutar" after a
   * completed/failed run). When omitted (process closed, or the read-only history
   * view) no run button is shown.
   *
   * `jSource` (JAA-1179/JAA-1183) es `J_SOURCE_SYNC` o el tag de una versión
   * bronze registrada, elegido con el `JSourceSelector` de este mismo diálogo.
   */
  onRun?: (params: Record<string, unknown>, jSource: string) => void
  /** Country/period for the first-run (no prior run) header; falls back to the run's own values. */
  countryCode?: string
  period?: string | number
}

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
    case "running":
      return <Loader2 className="h-4 w-4 text-info animate-spin shrink-0" />
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive shrink-0" />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
  }
}

interface StepRowProps {
  step: WeightingStep
  expanded: boolean
  onToggle: () => void
  hasDetails: boolean
  children?: React.ReactNode
}

function StepRow({ step, expanded, onToggle, hasDetails, children }: StepRowProps) {
  const label = WEIGHTING_STEP_LABELS[step.name as keyof typeof WEIGHTING_STEP_LABELS] ?? step.name

  return (
    <div>
      <button
        type="button"
        onClick={hasDetails ? onToggle : undefined}
        className={`flex items-center justify-between rounded px-2 py-1.5 text-xs w-full text-left ${
          hasDetails ? "cursor-pointer hover:ring-1 hover:ring-ring/30" : "cursor-default"
        } ${
          step.status === "failed"
            ? "bg-destructive/10"
            : step.status === "running"
              ? "bg-info/10"
              : "bg-muted/50"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <StepIcon status={step.status} />
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {step.status !== "pending" && (
            <span className="text-muted-foreground">
              <LiveDuration start={step.started_at} end={step.completed_at} />
            </span>
          )}
          <Badge
            variant={
              step.status === "completed"
                ? "default"
                : step.status === "failed"
                  ? "destructive"
                  : step.status === "running"
                    ? "secondary"
                    : "outline"
            }
            className="text-[10px] px-1.5 py-0"
          >
            {step.status}
          </Badge>
        </div>
      </button>
      {expanded && children}
    </div>
  )
}

/** Reduce a full params dict to the launch-editable subset ("De ejecución"). */
const pickExecutionParams = (params: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(EXECUTION_PARAM_KEYS.map((k) => [k, params[k]]))

/** One editable "De ejecución" param row inside the launch dialog — same field
 *  descriptors as the Parametros tab's editor, compact for the dialog's width.
 *  Iterate-and-relaunch (JAA feedback: switching to Parametros and back was
 *  "engorroso") happens here now instead of a second screen. */
function ExecParamEditRow({
  descriptor,
  value,
  changed,
  error,
  onChange,
}: {
  descriptor: WeightingFieldDescriptor
  value: unknown
  changed: boolean
  error?: string
  onChange: (next: unknown) => void
}) {
  const key = descriptor.key
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-xs font-medium">
          {key}
          {changed && <span className="ml-1.5 text-info" title="Modificado respecto al publicado">●</span>}
        </span>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
      {descriptor.control === "switch" ? (
        <Switch aria-label={key} checked={Boolean(value)} onCheckedChange={onChange} />
      ) : descriptor.control === "select" ? (
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger aria-label={key} className="h-7 w-32 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {descriptor.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type="number"
          aria-label={key}
          step={descriptor.step ?? "any"}
          min={descriptor.min}
          max={descriptor.max}
          placeholder={descriptor.nullable ? "—" : undefined}
          className="h-7 w-24 text-right font-mono text-xs"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value
            onChange(raw === "" ? (descriptor.nullable ? null : 0) : parseFloat(raw))
          }}
        />
      )}
    </div>
  )
}

export function WeightingDetailModal({ run: initialRun, open, onOpenChange, onRun, countryCode, period }: WeightingDetailModalProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: liveRun } = useWeightingRun(open && initialRun ? initialRun.run_id : null)
  const run = liveRun ?? initialRun

  const cancel = useCancelWeighting()

  // Published per-country defaults (Parametros tab owns the persistent version +
  // the Insumos/Avanzados publish flow). The 4 "De ejecución" params are now also
  // editable right here (JAA feedback: switching to Parametros and back to
  // relaunch was "engorroso") — Ejecutar publishes the edit (same endpoint the
  // Parametros tab uses, only when it actually changed) then creates the run, so
  // the pipeline genuinely runs with what's on screen instead of a stale default.
  const paisCode = COUNTRY_NAME_TO_CODE[run?.country ?? countryCode ?? ""] ?? null
  const { data: publishedParams } = useExecutionParams(open ? paisCode : null)
  const publishExecParams = usePublishWeightingParams(paisCode ?? "", "idpeso-config")
  const fullPublishedParams = { ...DEFAULT_WEIGHTING_PARAMS, ...publishedParams?.params }
  const launchParams = pickExecutionParams(fullPublishedParams)

  const isProcessing = run ? WEIGHTING_ACTIVE_STATUSES.includes(run.status) : false
  const isPending = run?.status === "pending"
  const isCompleted = run?.status === "completed"
  const isFailed = run?.status === "failed"

  // The "ajustar y volver a correr" iterate step: launch/relaunch with edited params.
  // Available whenever the parent passes onRun (process open) and nothing is in flight.
  const canRun = !!onRun && !isProcessing && !isPending
  // First execution reads "Ejecutar"; after a completed/failed run it's "Re-ejecutar".
  const runLabel = isCompleted || isFailed ? "Re-ejecutar" : "Ejecutar"
  const canCancel = isProcessing || isPending

  const countryLabel = COUNTRY_LABELS[run?.country ?? countryCode ?? ""] ?? run?.country ?? countryCode ?? ""
  const periodDisplay = run?.period ?? period ?? ""

  const statusConfig = run ? WEIGHTING_STATUS_CONFIG[run.status] : null
  const steps = run?.steps ?? []

  const hasStoredParams = !!run?.parameters_json && Object.keys(run.parameters_json).length > 0
  const showParams = canRun || hasStoredParams

  // Re-run seeds from the SAME run's own stored params (JAA feedback: "iterar
  // cambiando parámetros" — the value that actually ran, not whatever happens
  // to be published now); a brand-new launch (no prior run) seeds from the
  // published default. Re-seeded whenever the run/country changes while open —
  // set-state-during-render guarded by a signature, same idiom as the
  // Parametros tab's useHyperparamsDraft.
  const seedParams = hasStoredParams ? pickExecutionParams(run!.parameters_json!) : launchParams
  const seedKey = open ? `${run?.run_id ?? countryCode ?? ""}:${JSON.stringify(seedParams)}` : null
  const [paramDraft, setParamDraft] = useState<Record<string, unknown>>(seedParams)
  const [seededFor, setSeededFor] = useState<string | null>(null)
  if (canRun && seedKey !== null && seedKey !== seededFor) {
    setSeededFor(seedKey)
    setParamDraft(seedParams)
  }

  const paramIssues = useMemo(() => validateHyperparams(paramDraft), [paramDraft])
  const paramErrors = paramIssues.filter((i) => i.severity === "error")
  const paramErrorByKey = Object.fromEntries(paramErrors.map((i) => [i.location, i.message]))
  const diffVsPublished = useMemo(() => diffHyperparams(launchParams, paramDraft), [launchParams, paramDraft])
  const isParamsDirty = diffVsPublished.length > 0

  // JAA-1179/JAA-1183: fuente de datos bronze — sincronizar o una versión ya
  // registrada. Mismo patrón que calibración: se resetea a "sync" cada vez que
  // cambia el país, para no arrastrar por error el tag de otro país.
  //
  // `country` (el nombre completo, "bolivia") — no `paisCode` (el código corto
  // "BO" que usa el editor de hyperparámetros) — porque /snapshots/{process}
  // usa el mismo vocabulario de país que /calibration/j-versions.
  const country = run?.country ?? countryCode ?? ""
  const { data: snapshots, isLoading: snapshotsLoading } = useQuery({
    queryKey: ["snapshots", "pesaje", country],
    queryFn: () => getProcessSnapshots("pesaje", { country }),
    enabled: open && canRun && !!country,
  })
  const [jSource, setJSource] = useState<string>(J_SOURCE_SYNC)
  const [jSourceCountry, setJSourceCountry] = useState<string | null>(null)
  const effectiveJSource = country && jSourceCountry === country ? jSource : J_SOURCE_SYNC
  function handleJSourceChange(next: string) {
    setJSource(next)
    setJSourceCountry(country)
  }

  function toggleStep(stepName: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepName)) next.delete(stepName)
      else next.add(stepName)
      return next
    })
  }

  const handleCancel = () => {
    if (!run) return
    cancel.mutate(run.run_id, {
      onSuccess: () => toast.info("Ejecucion cancelada"),
      onError: () => toast.error("Error al cancelar"),
    })
  }

  const handleDownload = async () => {
    if (!run) return
    setIsDownloading(true)
    try {
      await downloadWeightingCSV(run.run_id)
      toast.success("CSV descargado")
    } catch {
      toast.error("Error al descargar CSV")
    } finally {
      setIsDownloading(false)
    }
  }

  const handleResetParams = () => setParamDraft({ ...launchParams })

  // Publish the edited "De ejecución" values (merged over whatever else is
  // currently published, so Insumos/Avanzados stay untouched) only when they
  // actually changed, THEN create+execute — so the pipeline that launches
  // reads the params on screen, not a stale published default. Publish failure
  // aborts the launch instead of running with an inconsistent params state.
  const handleRunClick = async () => {
    if (paramErrors.length > 0) return
    if (isParamsDirty) {
      if (!paisCode) {
        toast.error("Pais desconocido — no se pudo publicar el cambio de parametros")
        return
      }
      try {
        await publishExecParams.mutateAsync({ params: { ...fullPublishedParams, ...paramDraft } })
        toast.success(`Parametros de ejecucion actualizados para ${countryLabel}`)
      } catch {
        toast.error("No se pudo publicar el cambio de parametros — la corrida no se lanzo")
        return
      }
    }
    onRun!(paramDraft, effectiveJSource)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {run ? "Detalle Pesaje" : "Configurar Pesaje"}
            {statusConfig && (
              <Badge variant={statusConfig.variant} className={statusConfig.className}>
                {statusConfig.label}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {run
              ? "Detalle del proceso de pesaje, progreso y resultados."
              : "Ajusta los parametros de ejecucion si hace falta y ejecuta el pipeline de pesaje."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Pais</span>
              <p className="font-medium">{countryLabel}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Periodo</span>
              <p className="font-medium font-mono text-xs">{periodDisplay}</p>
            </div>
            {run && (
              <>
                <div>
                  <span className="text-muted-foreground">Inicio</span>
                  <p className="font-medium">
                    {run.started_at ? new Date(parseUTC(run.started_at)).toLocaleString() : "-"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Duracion</span>
                  <p className="font-medium">
                    <LiveDuration start={run.started_at} end={run.completed_at} />
                  </p>
                </div>
              </>
            )}
            {run?.snapshot_tag && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Snapshot del input</span>
                <p className="font-medium font-mono text-xs break-all">{run.snapshot_tag}</p>
              </div>
            )}
          </div>

          {/* Fuente de datos (JAA-1179/JAA-1183): sincronizar o una versión bronze
              ya registrada — solo tiene sentido antes de lanzar. */}
          {canRun && (
            <>
              <Separator />
              <div className="rounded-lg border p-3">
                <JSourceSelector
                  versions={snapshots?.items ?? []}
                  value={effectiveJSource}
                  onChange={handleJSourceChange}
                  loading={snapshotsLoading}
                />
              </div>
            </>
          )}

          {/* Parameters */}
          {showParams && (
            <>
              <Separator />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Parametros de ejecucion
                    {canRun && hasStoredParams && (
                      <span className="ml-1.5 font-normal text-[11px] italic">(de la ultima corrida)</span>
                    )}
                  </span>
                  {canRun && isParamsDirty && (
                    <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={handleResetParams}>
                      <RotateCcw className="h-3 w-3" />
                      Restaurar publicados
                    </Button>
                  )}
                </div>
                {canRun ? (
                  <div className="mt-1.5 divide-y">
                    {EXECUTION_PARAM_KEYS.map((key) => (
                      <ExecParamEditRow
                        key={key}
                        descriptor={WEIGHTING_PARAM_FIELD_BY_KEY[key]}
                        value={paramDraft[key]}
                        changed={JSON.stringify(paramDraft[key] ?? null) !== JSON.stringify(launchParams[key] ?? null)}
                        error={paramErrorByKey[key]}
                        onChange={(v) => setParamDraft((d) => ({ ...d, [key]: v }))}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(run!.parameters_json!).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-xs gap-2">
                        <span className="text-muted-foreground font-mono truncate">{key}</span>
                        <span className="font-medium font-mono">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Pipeline steps */}
          {steps.length > 0 && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Pipeline</span>
                <div className="mt-2">
                  <WeightingProgress steps={steps} currentStep={run!.current_step} />
                </div>
                <div className="mt-3 space-y-1">
                  {WEIGHTING_STEP_ORDER.map((stepName) => {
                    const step = steps.find((s) => s.name === stepName)
                    if (!step) return null
                    const isExpanded = expandedSteps.has(stepName)
                    const hasDetails = step.started_at != null

                    return (
                      <StepRow
                        key={stepName}
                        step={step}
                        expanded={isExpanded}
                        onToggle={() => toggleStep(stepName)}
                        hasDetails={hasDetails}
                      >
                        {step.started_at && (
                          <div className="ml-6 mt-1 border-l-2 border-muted pl-2 pb-1">
                            <div className="text-[11px] text-muted-foreground px-2 py-0.5">
                              <span>Inicio: {new Date(parseUTC(step.started_at)).toLocaleTimeString()}</span>
                              {step.completed_at && (
                                <span className="ml-3">
                                  Fin: {new Date(parseUTC(step.completed_at)).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </StepRow>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {/* Summary statistics */}
          {isCompleted && run!.summary_stats && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Estadisticas de Pesos</span>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total hogares</span>
                    <span className="font-medium font-mono">{fmtSummaryInt(run!.summary_stats.total_households)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Hogares pesados</span>
                    <span className="font-medium font-mono">{fmtSummaryInt(run!.summary_stats.weighted_households)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso min</span>
                    <span className="font-medium font-mono">{fmtSummaryFloat(run!.summary_stats.min_weight)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso max</span>
                    <span className="font-medium font-mono">{fmtSummaryFloat(run!.summary_stats.max_weight)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso medio</span>
                    <span className="font-medium font-mono">{fmtSummaryFloat(run!.summary_stats.mean_weight)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso mediana</span>
                    <span className="font-medium font-mono">{fmtSummaryFloat(run!.summary_stats.median_weight)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Std dev</span>
                    <span className="font-medium font-mono">{fmtSummaryFloat(run!.summary_stats.std_dev)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* No stats available */}
          {isCompleted && !run!.summary_stats && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Estadisticas de Pesos</span>
                <p className="mt-1 text-xs text-muted-foreground italic">No hay estadisticas disponibles para esta ejecucion.</p>
              </div>
            </>
          )}

          {/* Error */}
          {run?.error_message && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Error</span>
                <p className="mt-1 rounded bg-destructive/10 p-2 text-xs text-destructive font-mono">
                  {run.error_message}
                </p>
              </div>
            </>
          )}

          {/* Closed process, no runs: nothing to configure */}
          {!run && !canRun && (
            <p className="text-xs text-muted-foreground italic">
              Proceso cerrado. Reabralo desde la tarjeta para configurar y ejecutar.
            </p>
          )}
        </div>

        {/* Action buttons */}
        <DialogFooter className="gap-2 sm:gap-0">
          {/* Ejecutar / Re-ejecutar: when the process is open and nothing is in flight */}
          {canRun && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={paramErrors.length > 0}>
                  {publishExecParams.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : runLabel === "Re-ejecutar" ? (
                    <RefreshCcw className="mr-2 h-4 w-4" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  {runLabel}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{runLabel} pipeline</AlertDialogTitle>
                  <AlertDialogDescription>
                    {runLabel === "Re-ejecutar"
                      ? <>Crear una nueva ejecucion para <strong>{countryLabel}</strong> periodo <strong>{periodDisplay}</strong>?</>
                      : <>Iniciar pipeline de pesaje para <strong>{countryLabel}</strong> periodo <strong>{periodDisplay}</strong>?</>}
                    {isParamsDirty && (
                      <>
                        {" "}Se publicara el cambio de <strong>{diffVsPublished.length}</strong>{" "}
                        {diffVsPublished.length === 1 ? "parametro" : "parametros"} de ejecucion como nuevo default para{" "}
                        <strong>{countryLabel}</strong> antes de lanzar.
                      </>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRunClick}>
                    {runLabel}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Download CSV: when completed */}
          {isCompleted && (
            <Button variant="outline" disabled={isDownloading} onClick={handleDownload}>
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Descargar CSV
            </Button>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando...
            </Button>
          )}

          {/* Cancel: any active state */}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={cancel.isPending}>
                  {cancel.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancelar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancelar proceso</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cancelar el proceso de pesaje para{" "}
                    <strong>{countryLabel}</strong> periodo <strong>{periodDisplay}</strong>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Volver</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleCancel}
                  >
                    Cancelar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

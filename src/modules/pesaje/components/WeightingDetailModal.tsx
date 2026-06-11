import { useEffect, useState } from "react"
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
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Loader2,
  RefreshCcw,
  XCircle,
} from "lucide-react"
import { WeightingProgress } from "./WeightingProgress"
import { downloadWeightingCSV } from "@/lib/api"
import {
  useWeightingRun,
  useCancelWeighting,
} from "../hooks/useWeighting"
import { WEIGHTING_STEP_ORDER, WEIGHTING_STEP_LABELS, WEIGHTING_ACTIVE_STATUSES, WEIGHTING_STATUS_CONFIG } from "../types"
import type { WeightingRun, WeightingStep } from "../types"

const COUNTRY_LABELS: Record<string, string> = {
  argentina: "Argentina",
  bolivia: "Bolivia",
  brasil: "Brasil",
  brazil: "Brasil",
  cam: "CAM",
  chile: "Chile",
  colombia: "Colombia",
  ecuador: "Ecuador",
  mexico: "Mexico",
  peru: "Peru",
}

interface WeightingDetailModalProps {
  run: WeightingRun | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onRerun?: (params: Record<string, unknown>) => void
}

function parseUTC(ts: string): number {
  return new Date(ts).getTime()
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) return "-"
  const s = parseUTC(start)
  const e = end ? parseUTC(end) : Date.now()
  const totalSeconds = Math.max(0, Math.round((e - s) / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60)
    const sec = totalSeconds % 60
    return `${m}m ${sec}s`
  }
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const sec = totalSeconds % 60
  return `${h}h ${m}m ${sec}s`
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
  const duration = formatDuration(step.started_at, step.completed_at)

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
            <span className="text-muted-foreground">{duration}</span>
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

export function WeightingDetailModal({ run: initialRun, open, onOpenChange, onRerun }: WeightingDetailModalProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [editableParams, setEditableParams] = useState<Record<string, unknown>>({})
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: liveRun } = useWeightingRun(open && initialRun ? initialRun.run_id : null)
  const run = liveRun ?? initialRun

  const cancel = useCancelWeighting()

  // Initialize editable params from run's parameters when modal opens or run changes
  useEffect(() => {
    if (run?.parameters_json && Object.keys(run.parameters_json).length > 0) {
      setEditableParams({ ...run.parameters_json })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pre-existing, preserving behavior
  }, [run?.run_id, open])

  if (!run) return null

  const canRerun = run.status === "failed" && !!onRerun

  const steps = run.steps ?? []
  const statusConfig = WEIGHTING_STATUS_CONFIG[run.status]
  const countryLabel = COUNTRY_LABELS[run.country] ?? run.country

  const isProcessing = WEIGHTING_ACTIVE_STATUSES.includes(run.status)
  const canCancel = isProcessing || run.status === "pending"

  function toggleStep(stepName: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepName)) next.delete(stepName)
      else next.add(stepName)
      return next
    })
  }

  const handleCancel = () => {
    cancel.mutate(run.run_id, {
      onSuccess: () => toast.info("Ejecucion cancelada"),
      onError: () => toast.error("Error al cancelar"),
    })
  }

  const handleDownload = async () => {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Detalle Pesaje
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Detalle del proceso de pesaje, progreso y resultados.
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
              <p className="font-medium font-mono text-xs">{run.period}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Inicio</span>
              <p className="font-medium">
                {run.started_at ? new Date(parseUTC(run.started_at)).toLocaleString() : "-"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Duracion</span>
              <p className="font-medium">
                {formatDuration(run.started_at, run.completed_at)}
              </p>
            </div>
          </div>

          {/* Parameters */}
          {run.parameters_json && Object.keys(run.parameters_json).length > 0 && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground flex items-center gap-1.5">
                  Parametros
                  {canRerun && (
                    <span className="text-[10px] text-warning font-normal">(editables para re-ejecucion)</span>
                  )}
                </span>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(canRerun ? editableParams : run.parameters_json).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-muted-foreground font-mono truncate">{key}</span>
                      {canRerun ? (
                        <Input
                          type="number"
                          step="any"
                          className="h-6 w-20 text-xs font-mono text-right px-1.5"
                          value={String(value ?? "")}
                          onChange={(e) =>
                            setEditableParams((prev) => ({
                              ...prev,
                              [key]: e.target.value ? parseFloat(e.target.value) : 0,
                            }))
                          }
                        />
                      ) : (
                        <span className="font-medium font-mono">{String(value)}</span>
                      )}
                    </div>
                  ))}
                </div>
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
                  <WeightingProgress steps={steps} currentStep={run.current_step} />
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
          {run.status === "completed" && run.summary_stats && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Estadisticas de Pesos</span>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Total hogares</span>
                    <span className="font-medium font-mono">{run.summary_stats.total_households.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Hogares pesados</span>
                    <span className="font-medium font-mono">{run.summary_stats.weighted_households.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso min</span>
                    <span className="font-medium font-mono">{run.summary_stats.min_weight.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso max</span>
                    <span className="font-medium font-mono">{run.summary_stats.max_weight.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso medio</span>
                    <span className="font-medium font-mono">{run.summary_stats.mean_weight.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Peso mediana</span>
                    <span className="font-medium font-mono">{run.summary_stats.median_weight.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Std dev</span>
                    <span className="font-medium font-mono">{run.summary_stats.std_dev.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* No stats available */}
          {run.status === "completed" && !run.summary_stats && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Estadisticas de Pesos</span>
                <p className="mt-1 text-xs text-muted-foreground italic">No hay estadisticas disponibles para esta ejecucion.</p>
              </div>
            </>
          )}

          {/* Error */}
          {run.error_message && (
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
        </div>

        {/* Action buttons */}
        <DialogFooter className="gap-2 sm:gap-0">
          {/* Re-run: when failed and user wants different params */}
          {canRerun && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Re-ejecutar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Re-ejecutar pipeline</AlertDialogTitle>
                  <AlertDialogDescription>
                    Crear una nueva ejecucion para{" "}
                    <strong>{countryLabel}</strong> periodo <strong>{run.period}</strong> con los parametros modificados?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      onRerun!(editableParams)
                      onOpenChange(false)
                    }}
                  >
                    Re-ejecutar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Download CSV: when completed */}
          {run.status === "completed" && (
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
                    <strong>{countryLabel}</strong> periodo <strong>{run.period}</strong>?
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

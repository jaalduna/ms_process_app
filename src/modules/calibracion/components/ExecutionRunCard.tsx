import { useState } from "react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/useAuth"
import { useNow } from "@/hooks/useNow"
import { downloadCalibrationReport } from "@/lib/api"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Download, ExternalLink, Loader2, RotateCcw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { getPermissions } from "@/lib/permissions"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { stepLabel } from "../types"
import { formatDuration } from "../format"
import type { EventSummary, JobStatus } from "@/types/api"

interface ExecutionRunCardProps {
  run: EventSummary
  onCancel: (jobId: string) => void
  onRetry: (run: EventSummary) => void
  cancelling: boolean
  retrying: boolean
}

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "En cola", className: "bg-muted text-muted-foreground" },
  running: { label: "Ejecutando", className: "bg-blue-500/15 text-blue-500" },
  completed: { label: "Completado", className: "bg-emerald-500/15 text-emerald-500" },
  failed: { label: "Error", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
}

function StepIcon({ status }: { status: JobStatus }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-500" />
  if (status === "running") return <Loader2 className="size-4 animate-spin text-blue-500" />
  if (status === "failed") return <XCircle className="size-4 text-destructive" />
  return <Circle className="size-4 text-muted-foreground/50" />
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleTimeString("es-CL", { hour12: false })
}

/** Step pipeline row rendered inside the run card. Exported for reuse in
 * HistoryRunDetailModal so the history table's modal shows the same pipeline
 * without duplicating markup. */
export function StepPipeline({ steps }: { steps: NonNullable<EventSummary["steps"]> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {steps.map((step) => (
        <span
          key={step.name}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs",
            step.status === "completed" && "text-emerald-600 dark:text-emerald-400",
            step.status === "running" && "text-blue-600 dark:text-blue-400",
            step.status === "failed" && "text-destructive",
            (step.status === "pending" || !step.status) && "text-muted-foreground",
          )}
        >
          <StepIcon status={step.status} />
          {stepLabel(step.name)}
        </span>
      ))}
    </div>
  )
}

/** Step log with timestamps, rendered inside the run card. Exported for reuse
 * in HistoryRunDetailModal (see StepPipeline above). */
export function StepLog({ steps }: { steps: NonNullable<EventSummary["steps"]> }) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        Log del run
      </summary>
      <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {steps.map((step) => (
          <div key={step.name}>
            [{fmtTime(step.started_at)}] {stepLabel(step.name)} — {step.status}
            {step.completed_at ? ` (fin ${fmtTime(step.completed_at)})` : ""}
            {step.error ? ` — ${step.error}` : ""}
          </div>
        ))}
      </div>
    </details>
  )
}

/** One country's run in the execution board: status, step pipeline, progress,
 * timestamped step log and contextual actions (cancel / retry). Rendered
 * entirely from the run summary — steps are backend-driven (JAA-648). */
export function ExecutionRunCard({ run, onCancel, onRetry, cancelling, retrying }: ExecutionRunCardProps) {
  // Los usuarios finales NO tienen acceso al workspace de Databricks: el link
  // al run es una herramienta de diagnóstico solo para admins/soporte.
  const { roles } = useAuth()
  const { canViewDatabricksRun } = getPermissions(roles)
  const [isDownloading, setIsDownloading] = useState(false)

  async function handleDownload() {
    setIsDownloading(true)
    try {
      await downloadCalibrationReport(run.tag, run.country)
    } catch {
      toast.error("Error al descargar los resultados")
    } finally {
      setIsDownloading(false)
    }
  }
  const steps = run.steps ?? []
  const total = steps.length
  const completed = steps.filter((s) => s.status === "completed").length
  const percent = run.status === "completed" ? 100 : total > 0 ? Math.round((completed / total) * 100) : 0
  const meta = STATUS_META[run.status] ?? STATUS_META.pending
  const isActive = run.status === "pending" || run.status === "running"
  // Tick de 1 s mientras la corrida está activa: sin esto el cronómetro se
  // congela (React Query no re-renderiza si el payload del poll no cambió).
  const now = useNow(isActive)
  const flag = COUNTRY_FLAGS[run.country] ?? ""
  const countryLabel = COUNTRY_LABELS[run.country] ?? run.country
  const runPageUrl = run.run_page_url

  return (
    <Card data-testid={`execution-run-${run.country}`}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg">{flag}</span>
          <span className="text-base font-semibold">{countryLabel}</span>
          <Badge className={cn("border-transparent", meta.className)}>{meta.label}</Badge>
          <span className="text-xs text-muted-foreground font-mono">{run.tag}</span>
          <div className="ml-auto flex items-center gap-2">
            {canViewDatabricksRun && runPageUrl && (
              <a
                href={runPageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Ver en Databricks <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {total > 0 && <StepPipeline steps={steps} />}

        <div className="space-y-2.5">
          <Progress value={percent} className="h-2" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="font-mono">{percent}%</span>
            <span>
              ⏱ {formatDuration(
                run.created_at,
                run.completed_at ?? (isActive ? new Date(now).toISOString() : null),
              )}
            </span>
            <span>por {run.triggered_by}</span>
            <div className="ml-auto flex gap-2">
              {isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={cancelling}
                  onClick={() => onCancel(run.job_id)}
                >
                  Cancelar
                </Button>
              )}
              {run.status === "failed" && (
                <Button size="sm" disabled={retrying} onClick={() => onRetry(run)}>
                  <RotateCcw className="size-3.5" /> Reintentar
                </Button>
              )}
              {run.status === "completed" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isDownloading}
                  onClick={handleDownload}
                  aria-label={`Descargar resultados de ${countryLabel}`}
                >
                  {isDownloading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  Descargar resultados
                </Button>
              )}
            </div>
          </div>
        </div>

        {run.error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ⚠ {run.error}
          </div>
        )}

        {total > 0 && <StepLog steps={steps} />}
      </CardContent>
    </Card>
  )
}

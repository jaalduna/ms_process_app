import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, ExternalLink, Loader2 } from "lucide-react"
import { useAuth } from "@/hooks/useAuth"
import { getPermissions } from "@/lib/permissions"
import { cn } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { StepPipeline, StepLog } from "./ExecutionRunCard"
import { formatDuration } from "../format"
import type { EventSummary } from "@/types/api"

// Same status → label/className mapping as ExecutionRunCard's STATUS_META and
// CalibrationRunPage's HIST_STATUS (kept local — see react-refresh/only-export
// -components on ExecutionRunCard, which only allows component exports there).
const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "En cola", className: "bg-muted text-muted-foreground" },
  running: { label: "Ejecutando", className: "bg-blue-500/15 text-blue-500" },
  completed: { label: "Completado", className: "bg-emerald-500/15 text-emerald-500" },
  failed: { label: "Error", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
}

interface HistoryRunDetailModalProps {
  /** Resolved from board.runs by the caller on every render, so a fresh poll
   * updates the modal in place instead of freezing on the click-time snapshot. */
  run: EventSummary | undefined
  open: boolean
  onClose: () => void
  onDownload: (run: EventSummary) => void
  downloading: boolean
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("es-CL", { hour12: false })
}

/** Detail view for one history table row: reuses ExecutionRunCard's step
 * pipeline/log so the run's progress reads identically in both places. */
export function HistoryRunDetailModal({ run, open, onClose, onDownload, downloading }: HistoryRunDetailModalProps) {
  const { roles } = useAuth()
  const { canViewDatabricksRun } = getPermissions(roles)

  if (!run) return null

  const meta = STATUS_META[run.status] ?? STATUS_META.pending
  const flag = COUNTRY_FLAGS[run.country] ?? ""
  const countryLabel = COUNTRY_LABELS[run.country] ?? run.country
  const steps = run.steps ?? []
  const runPageUrl = run.run_page_url

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="text-lg">{flag}</span>
            {countryLabel}
            <Badge className={cn("border-transparent", meta.className)}>{meta.label}</Badge>
            <span className="font-mono text-xs font-normal text-muted-foreground">{run.tag}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-muted-foreground">Período</span>
              <p className="font-medium">{run.period ?? "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Lanzado por</span>
              <p className="font-medium">{run.triggered_by}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Creada</span>
              <p className="font-medium">{fmtDateTime(run.created_at)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Inicio</span>
              <p className="font-medium">{fmtDateTime(run.started_at)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Fin</span>
              <p className="font-medium">{fmtDateTime(run.completed_at)}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Duración</span>
              <p className="font-mono font-medium">
                {formatDuration(
                  run.created_at,
                  run.completed_at ??
                    (run.status === "pending" || run.status === "running" ? new Date().toISOString() : null),
                )}
              </p>
            </div>
          </div>

          {steps.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              <StepPipeline steps={steps} />
              <StepLog steps={steps} />
            </div>
          )}

          {run.error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              ⚠ {run.error}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t pt-3">
            {canViewDatabricksRun && runPageUrl ? (
              <a
                href={runPageUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Ver en Databricks <ExternalLink className="size-3" />
              </a>
            ) : (
              <span />
            )}

            {run.status === "completed" && (
              <Button
                size="sm"
                variant="outline"
                disabled={downloading}
                onClick={() => onDownload(run)}
              >
                {downloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                Descargar resultados
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

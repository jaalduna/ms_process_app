import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Circle, Clock, Download, ExternalLink, Loader2, MinusCircle, ShieldCheck, XCircle } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { downloadQmsTrZip } from "../api"
import { formatChile } from "../time"
import { STATUS_META, qmsTrStepLabel, type QmsTrRun, type QmsTrStep } from "../types"
import { QmsTrValidationPanel } from "./QmsTrValidationPanel"

function StepIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
  if (status === "running") return <Loader2 className="size-4 animate-spin text-primary" />
  if (status === "failed") return <XCircle className="size-4 text-destructive" />
  if (status === "cancelled") return <MinusCircle className="size-4 text-muted-foreground" />
  return <Circle className="size-4 text-muted-foreground/50" />
}

function fmtHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("es-CL", { hour12: false }) : "—"
}

function Pasos({ steps }: { steps: QmsTrStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" data-testid="qmstr-steps">
      {steps.map((s) => (
        <span key={s.name} className="inline-flex items-center gap-1.5 text-xs" data-step={s.name} data-status={s.status}>
          <StepIcon status={s.status} />
          {qmsTrStepLabel(s.name)}
          {s.status === "cancelled" && <span className="text-muted-foreground">(omitido)</span>}
        </span>
      ))}
    </div>
  )
}

interface QmsTrRunCardProps {
  run: QmsTrRun
  canTrigger: boolean
  canViewDatabricksRun: boolean
  onCancel: (runId: string) => void
  onValidate: (runId: string) => void
  cancelling: boolean
  validating: boolean
}

/** Una corrida: estado, snapshot fijado, pasos con log, y acciones (cancelar / descargar / validar). */
export function QmsTrRunCard({ run, canTrigger, canViewDatabricksRun, onCancel, onValidate, cancelling, validating }: QmsTrRunCardProps) {
  const [descargando, setDescargando] = useState(false)
  const meta = STATUS_META[run.status] ?? STATUS_META.pending
  const activa = run.status === "waiting_snapshot" || run.status === "pending" || run.status === "running"
  const hechos = run.steps.filter((s) => s.status === "completed" || s.status === "cancelled").length
  const pct = run.status === "completed" ? 100 : run.steps.length ? Math.round((hechos / run.steps.length) * 100) : 0

  async function descargar() {
    setDescargando(true)
    try {
      await downloadQmsTrZip(run.run_id)
    } catch (e) {
      toast.error(`No se pudo descargar el zip: ${(e as Error).message}`)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <Card data-testid={`qmstr-run-${run.run_id}`} data-status={run.status}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg">{COUNTRY_FLAGS[run.country] ?? ""}</span>
          <span className="text-base font-semibold">{COUNTRY_LABELS[run.country] ?? run.country}</span>
          <span className="text-sm text-muted-foreground">mes {run.mes_procesamiento}</span>
          <Badge className={cn("border-transparent", meta.className)} data-testid="qmstr-run-status">{meta.label}</Badge>
          <div className="ml-auto flex items-center gap-3">
            {canViewDatabricksRun && run.run_page_url && (
              <a href={run.run_page_url} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                Ver en Databricks <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Instante {formatChile(run.at)}
          {run.snapshot?.j && ` · J de las ${formatChile(run.snapshot.j.timestamp)} (v${run.snapshot.j.version})`}
          {run.created_by && ` · ${run.created_by}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {run.status === "waiting_snapshot" && run.snapshot?.expected_j_at && (
          <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Clock className="size-4" /> Esperando el snapshot de J de las {formatChile(run.snapshot.expected_j_at)}; parte sola cuando exista.
          </p>
        )}
        {run.status !== "waiting_snapshot" && (
          <>
            <Pasos steps={run.steps} />
            {activa && <Progress value={pct} aria-label="Avance" />}
            <details>
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">Log de la corrida</summary>
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {run.steps.map((s) => (
                  <div key={s.name}>
                    [{fmtHora(s.started_at)}] {qmsTrStepLabel(s.name)} — {s.status}
                    {s.completed_at ? ` (fin ${fmtHora(s.completed_at)})` : ""}
                    {s.error ? ` — ${s.error}` : ""}
                  </div>
                ))}
              </div>
            </details>
          </>
        )}
        {run.status === "failed" && run.error_message && (
          <p className="text-sm text-destructive" role="alert">{run.error_message}</p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {activa && canTrigger && (
            <Button variant="outline" size="sm" onClick={() => onCancel(run.run_id)} disabled={cancelling}>
              {cancelling && <Loader2 className="size-4 animate-spin" />} Cancelar
            </Button>
          )}
          {run.status === "completed" && (
            <>
              <Button variant="outline" size="sm" onClick={descargar} disabled={descargando} data-testid="qmstr-download">
                {descargando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                Descargar resultados
              </Button>
              {canTrigger && (
                <Button size="sm" onClick={() => onValidate(run.run_id)} disabled={validating} data-testid="qmstr-validate">
                  {validating ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                  Validar aplicación en J
                </Button>
              )}
            </>
          )}
        </div>
        {run.validacion && <QmsTrValidationPanel validacion={run.validacion} />}
      </CardContent>
    </Card>
  )
}

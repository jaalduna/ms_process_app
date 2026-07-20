import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
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
import { Download, Eye, Loader2, RefreshCcw } from "lucide-react"
import { toast } from "sonner"
import { QmsTrProgress } from "./QmsTrProgress"
import { QmsTrDetailModal } from "./QmsTrDetailModal"
import { QmsTrHistoryModal } from "./QmsTrHistoryModal"
import { useQmsTrRuns, useCreateQmsTrRun, useExecuteQmsTrRun } from "../hooks/useQmsTr"
import { QMSTR_ACTIVE_STATUSES, QMSTR_STATUS_CONFIG } from "../types"
import { downloadQmsTrTag } from "@/lib/api"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"

/** Ano base defaults to last year -- the reference pipeline extracts data
 * `WHERE Ano >= {year}`, so the most recently closed year is the sane default. */
function defaultAnoBase(): number {
  return new Date().getFullYear() - 1
}

interface QmsTrCountryCardProps {
  countryCode: string
}

export function QmsTrCountryCard({ countryCode }: QmsTrCountryCardProps) {
  const [anoBase, setAnoBase] = useState(defaultAnoBase)
  const [detailJobId, setDetailJobId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: runs, isLoading } = useQmsTrRuns(countryCode)
  const createRun = useCreateQmsTrRun()
  const executeRun = useExecuteQmsTrRun()

  const latestRun = runs?.[0] ?? null
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const flag = COUNTRY_FLAGS[countryCode] ?? ""

  const isProcessing = latestRun ? QMSTR_ACTIVE_STATUSES.includes(latestRun.status) : false
  const isPending = latestRun?.status === "pending"
  const isCompleted = latestRun?.status === "completed"
  const isFailed = latestRun?.status === "failed"
  const canExecute =
    !isProcessing && !isPending && !createRun.isPending && !executeRun.isPending &&
    Number.isInteger(anoBase) && anoBase > 0
  const canDownload = isCompleted && !!latestRun?.tag

  const statusConfig = latestRun ? QMSTR_STATUS_CONFIG[latestRun.status] : null

  const handleExecute = () => {
    createRun.mutate(
      { country: countryCode, ano_base: anoBase },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.job_id, {
            onSuccess: () => toast.success(`QMS-TR iniciado para ${countryLabel}`),
            onError: () => toast.error(`No se pudo iniciar QMS-TR para ${countryLabel}`),
          })
        },
        onError: () => toast.error(`No se pudo iniciar QMS-TR para ${countryLabel}`),
      },
    )
  }

  const handleRetry = () => {
    if (!latestRun) return
    createRun.mutate(
      { country: countryCode, ano_base: latestRun.ano_base },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.job_id, {
            onSuccess: () => toast.success(`Reintento iniciado para ${countryLabel}`),
            onError: () => toast.error(`No se pudo reintentar QMS-TR para ${countryLabel}`),
          })
        },
        onError: () => toast.error(`No se pudo reintentar QMS-TR para ${countryLabel}`),
      },
    )
  }

  const handleDownload = async () => {
    if (!latestRun?.tag) return
    setIsDownloading(true)
    try {
      await downloadQmsTrTag(latestRun.tag, latestRun.country)
      toast.success("Descarga iniciada")
    } catch {
      toast.error("Error al descargar")
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      role="button"
      tabIndex={0}
      aria-label={`Ver historial de QMS-TR para ${countryLabel}`}
      onClick={() => setShowHistory(true)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowHistory(true) } }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {flag && <span className="mr-1.5">{flag}</span>}
            {countryLabel}
          </CardTitle>
          {isLoading && <div className="h-5 w-16 animate-pulse rounded bg-muted" />}
          {!isLoading && statusConfig && (
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress steps */}
        {latestRun?.steps && latestRun.steps.length > 0 && (isProcessing || isPending || isCompleted || isFailed) && (
          <QmsTrProgress steps={latestRun.steps} />
        )}

        {/* Error message */}
        {isFailed && latestRun?.error_message && (
          <p className="text-xs text-destructive truncate" title={latestRun.error_message}>
            {latestRun.error_message}
          </p>
        )}

        {/* Ano base input, editable while nothing is running */}
        <div onClick={(e) => e.stopPropagation()}>
          <label className="block space-y-1">
            <span className="text-xs text-muted-foreground">Año base</span>
            <Input
              type="number"
              step={1}
              min={2000}
              max={2100}
              value={anoBase}
              disabled={isProcessing || isPending}
              onChange={(e) => setAnoBase(e.target.value ? parseInt(e.target.value, 10) : 0)}
              className="h-8 text-sm font-mono"
              aria-label="Año base"
            />
          </label>
        </div>

        {/* Actions */}
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2">
            {/* Processing state */}
            {(isProcessing || isPending) && (
              <Button size="sm" disabled className="flex-1">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isPending ? "Iniciando..." : "Ejecutando..."}
              </Button>
            )}

            {/* Trigger: when no active process */}
            {!isProcessing && !isPending && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!canExecute} className="flex-1">
                    {createRun.isPending || executeRun.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Iniciando...
                      </>
                    ) : (
                      "Ejecutar"
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar QMS-TR</AlertDialogTitle>
                    <AlertDialogDescription>
                      Iniciar la corrida de QMS-TR para <strong>{countryLabel}</strong>, año base{" "}
                      <strong>{anoBase}</strong>?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExecute}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Retry on failure */}
            {isFailed && (
              <Button
                size="sm"
                variant="outline"
                disabled={createRun.isPending || executeRun.isPending}
                onClick={handleRetry}
                aria-label={`Reintentar QMS-TR para ${countryLabel}`}
              >
                {createRun.isPending || executeRun.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Download result */}
            {canDownload && (
              <Button
                size="sm"
                variant="outline"
                disabled={isDownloading}
                onClick={handleDownload}
                aria-label={`Descargar resultado de QMS-TR para ${countryLabel}`}
              >
                {isDownloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* View detail / logs */}
            {latestRun && latestRun.status !== "pending" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDetailJobId(latestRun.job_id)
                  setDetailOpen(true)
                }}
                aria-label={isFailed ? `Ver logs completos de QMS-TR para ${countryLabel}` : `Ver detalle de QMS-TR para ${countryLabel}`}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <QmsTrDetailModal
        jobId={detailJobId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      <QmsTrHistoryModal
        country={countryCode}
        countryLabel={countryLabel}
        countryFlag={flag}
        open={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </Card>
  )
}

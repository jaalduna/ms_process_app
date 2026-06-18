import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { Eye, History, Loader2, Square } from "lucide-react"
import { toast } from "sonner"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { useWeightingRuns, useCreateWeightingRun, useExecuteWeighting, useCancelWeighting } from "../hooks/useWeighting"
import { WeightingProgress } from "./WeightingProgress"
import { WeightingDetailModal } from "./WeightingDetailModal"
import { WeightingHistoryModal } from "./WeightingHistoryModal"
import { WEIGHTING_ACTIVE_STATUSES, WEIGHTING_STATUS_CONFIG } from "../types"
import type { WeightingParams } from "./WeightingConfigDialog"

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const COUNTRY_FLAGS: Record<string, string> = {
  argentina: "\u{1F1E6}\u{1F1F7}",
  bolivia: "\u{1F1E7}\u{1F1F4}",
  brasil: "\u{1F1E7}\u{1F1F7}",
  brazil: "\u{1F1E7}\u{1F1F7}",
  cam: "\u{1F30E}",
  chile: "\u{1F1E8}\u{1F1F1}",
  colombia: "\u{1F1E8}\u{1F1F4}",
  ecuador: "\u{1F1EA}\u{1F1E8}",
  mexico: "\u{1F1F2}\u{1F1FD}",
  peru: "\u{1F1F5}\u{1F1EA}",
}

// eslint-disable-next-line react-refresh/only-export-components -- intentional shadcn/context pattern: co-exports constant with component
export const COUNTRY_LABELS: Record<string, string> = {
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

interface WeightingCountryCardProps {
  countryCode: string
  period: string
  weightingParams: WeightingParams
  lastFinalizedDate: string | null
}

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

export function WeightingCountryCard({ countryCode, period, weightingParams, lastFinalizedDate }: WeightingCountryCardProps) {
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)

  const { data: runs, isLoading } = useWeightingRuns(countryCode, periodStringToNumber(period))
  const createRun = useCreateWeightingRun()
  const executeRun = useExecuteWeighting()
  const cancelRun = useCancelWeighting()

  const latestRun = runs?.[0] ?? null
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const flag = COUNTRY_FLAGS[countryCode] ?? ""

  const { isClosed } = useProcessEntry("pesaje", countryCode)
  const isProcessing = latestRun ? WEIGHTING_ACTIVE_STATUSES.includes(latestRun.status) : false
  const isCompleted = latestRun?.status === "completed"
  const isFailed = latestRun?.status === "failed"
  const runStateAllowsExecute = !isProcessing && !createRun.isPending && !executeRun.isPending
    && (!latestRun || ["completed", "failed", "cancelled"].includes(latestRun.status))
  const canExecute = runStateAllowsExecute && !isClosed
  const showDetailButton = latestRun != null && latestRun.status !== "pending"
  const hasAnyRuns = runs && runs.length > 0

  const statusConfig = latestRun ? WEIGHTING_STATUS_CONFIG[latestRun.status] : null

  const handleExecutar = () => {
    createRun.mutate(
      { country: countryCode, period: periodStringToNumber(period), parameters: { ...weightingParams } as Record<string, unknown> },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.run_id, {
            onSuccess: () => toast.success(`Pipeline iniciado para ${countryLabel}`),
            onError: () => toast.error(`Error al ejecutar pipeline para ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Error al crear ejecucion para ${countryLabel}`),
      },
    )
  }

  const handleRerun = (params: Record<string, unknown>) => {
    createRun.mutate(
      { country: countryCode, period: periodStringToNumber(period), parameters: params },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.run_id, {
            onSuccess: () => toast.success(`Re-ejecucion iniciada para ${countryLabel}`),
            onError: () => toast.error(`Error al re-ejecutar pipeline para ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Error al crear re-ejecucion para ${countryLabel}`),
      },
    )
  }

  const handleCancel = () => {
    if (!latestRun) return
    cancelRun.mutate(latestRun.run_id, {
      onSuccess: () => toast.info(`Ejecucion detenida para ${countryLabel}`),
      onError: () => toast.error(`Error al detener ejecucion para ${countryLabel}`),
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {flag && <span className="mr-1.5">{flag}</span>}
              {countryLabel}
            </CardTitle>
            <Badge variant="outline" className="text-xs" title={lastFinalizedDate ? `Last: ${lastFinalizedDate.replace("T", " ").slice(0, 16)}` : undefined}>
              {lastFinalizedDate
                ? formatRelativeTime(lastFinalizedDate)
                : "never"}
            </Badge>
          </div>
          <div className="mt-2">
            <ProcessStatusBadge stage="pesaje" country={countryCode} countryLabel={countryLabel} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Latest run status */}
          {isLoading && (
            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
          )}
          {!isLoading && statusConfig && (
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          )}

          {/* Progress steps */}
          {latestRun?.steps && latestRun.steps.length > 0 && latestRun.status !== "pending" && (
            <WeightingProgress steps={latestRun.steps} currentStep={latestRun.current_step} />
          )}

          {/* Error message */}
          {latestRun?.error_message && (
            <p className="text-xs text-destructive truncate" title={latestRun.error_message}>
              {latestRun.error_message}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {/* Processing: spinner + Detener */}
            {isProcessing && (
              <>
                <Button size="sm" disabled className="flex-1">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Procesando...
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={cancelRun.isPending}>
                      <Square className="mr-2 h-3.5 w-3.5" />
                      Detener
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Detener ejecucion</AlertDialogTitle>
                      <AlertDialogDescription>
                        Detener el proceso para <strong>{countryLabel}</strong> periodo <strong>{period}</strong>?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Volver</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleCancel}>
                        Detener
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}

            {/* Ejecutar: when run state allows (disabled if process closed) */}
            {!isProcessing && runStateAllowsExecute && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!canExecute} className="flex-1" title={isClosed ? "Proceso cerrado" : undefined}>
                    {(createRun.isPending || executeRun.isPending) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Iniciando...
                      </>
                    ) : (
                      isFailed ? "Re-ejecutar" : isCompleted ? "Re-ejecutar" : "Ejecutar"
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar ejecucion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Iniciar pipeline de pesaje para <strong>{countryLabel}</strong> periodo <strong>{period}</strong>?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExecutar}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Ver detalle button */}
            {showDetailButton && (
              <Button size="sm" variant="outline" onClick={() => setDetailModalOpen(true)}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                Ver detalle
              </Button>
            )}

            {/* History button */}
            {hasAnyRuns && (
              <Button size="sm" variant="ghost" onClick={() => setHistoryModalOpen(true)} title="Historial">
                <History className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <WeightingDetailModal
        run={latestRun}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onRerun={handleRerun}
      />

      <WeightingHistoryModal
        countryCode={countryCode}
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
      />
    </>
  )
}

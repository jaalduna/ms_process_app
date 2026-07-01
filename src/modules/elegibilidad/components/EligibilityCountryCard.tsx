import { memo, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
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
import { CheckCircle2, ClipboardCheck, Eye, History, Loader2, RefreshCcw, Square } from "lucide-react"
import { toast } from "sonner"
import { DependencyIndicator } from "@/components/DependencyIndicator"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { usePipelineDeps } from "@/hooks/usePipelineDeps"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { useEligibilityRuns, useCreateEligibilityRun, useExecuteEligibility, useCancelEligibility } from "../hooks/useEligibility"
import { EligibilityProgress } from "./EligibilityProgress"
import { EligibilityDetailModal } from "./EligibilityDetailModal"
import { EligibilityHistoryModal } from "./EligibilityHistoryModal"
import { ACTIVE_STATUSES, STATUS_CONFIG } from "../types"
import type { EligibilityParams } from "./EligibilityConfigDialog"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { formatRelativeTime } from "@/lib/utils"

interface EligibilityCountryCardProps {
  countryCode: string
  period: string
  eligibilityParams: EligibilityParams
  lastFinalizedDate: string | null
}

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

export const EligibilityCountryCard = memo(function EligibilityCountryCard({ countryCode, period, eligibilityParams, lastFinalizedDate }: EligibilityCountryCardProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const { dependencies, allMet } = usePipelineDeps("elegibilidad", countryCode)
  const { isClosed } = useProcessEntry("elegibilidad", countryCode)
  const { data: runs, isLoading } = useEligibilityRuns(countryCode, periodStringToNumber(period))
  const createRun = useCreateEligibilityRun()
  const executeRun = useExecuteEligibility()
  const cancelRun = useCancelEligibility()
  const queryClient = useQueryClient()

  const latestRun = runs?.[0] ?? null
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const flag = COUNTRY_FLAGS[countryCode] ?? ""

  const isProcessing = latestRun ? ACTIVE_STATUSES.includes(latestRun.status) : false
  const isReady = latestRun?.status === "ready"

  // The final "→ ready" transition lands via the runs poll (a backend timer),
  // not via a mutation — so refresh the "last completed" badge the moment a run
  // becomes ready, instead of waiting for staleTime/reload (JAA-392). Fires only
  // on the transition into ready, never on every poll.
  const prevStatusRef = useRef(latestRun?.status)
  useEffect(() => {
    const status = latestRun?.status
    if (status === "ready" && prevStatusRef.current !== "ready") {
      queryClient.invalidateQueries({ queryKey: ["last-elegibilidad"] })
    }
    prevStatusRef.current = status
  }, [latestRun?.status, queryClient])
  const isResultsReady = latestRun?.status === "results_ready"
  const hasActiveProcess = latestRun != null && !["failed", "cancelled", "ready"].includes(latestRun.status) && latestRun.status !== "pending"
  const canExecute = !isProcessing && !createRun.isPending && !executeRun.isPending
  const showDetailButton = latestRun != null && latestRun.status !== "pending"

  const statusConfig = latestRun ? STATUS_CONFIG[latestRun.status] : null

  const handleExecutar = () => {
    createRun.mutate(
      { country: countryCode, period: periodStringToNumber(period), parameters: { ...eligibilityParams } as Record<string, unknown> },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.run_id, {
            onSuccess: () => toast.success(`Pipeline iniciado para ${countryLabel}`),
            onError: () => toast.error(`Error al ejecutar pipeline para ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Error al crear ejecución para ${countryLabel}`),
      },
    )
  }

  const handleRerun = (params: Record<string, unknown>) => {
    createRun.mutate(
      { country: countryCode, period: periodStringToNumber(period), parameters: params },
      {
        onSuccess: (run) => {
          executeRun.mutate(run.run_id, {
            onSuccess: () => toast.success(`Re-ejecución iniciada para ${countryLabel}`),
            onError: () => toast.error(`Error al re-ejecutar pipeline para ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Error al crear re-ejecución para ${countryLabel}`),
      },
    )
  }

  const handleCancel = () => {
    if (!latestRun) return
    cancelRun.mutate(latestRun.run_id, {
      onSuccess: () => toast.info(`Ejecución detenida para ${countryLabel}`),
      onError: () => toast.error(`Error al detener ejecución para ${countryLabel}`),
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
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs" title={lastFinalizedDate ? `Last: ${lastFinalizedDate.replace("T", " ").slice(0, 16)}` : undefined}>
                {lastFinalizedDate
                  ? formatRelativeTime(lastFinalizedDate)
                  : "never"}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => setHistoryOpen(true)}
                title="Historial"
                aria-label="Ver historial de elegibilidad"
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <DependencyIndicator dependencies={dependencies} />
          <ProcessStatusBadge stage="elegibilidad" country={countryCode} countryLabel={countryLabel} />
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
            <EligibilityProgress steps={latestRun.steps} currentStep={latestRun.current_step} />
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
                      <AlertDialogTitle>Detener ejecución</AlertDialogTitle>
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

            {/* Ejecutar: when no active process and not ready */}
            {!isProcessing && !hasActiveProcess && !isReady && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!canExecute || isClosed} className="flex-1" title={isClosed ? "Proceso cerrado" : !allMet ? "Upstream dependencies not met" : undefined}>
                    {(createRun.isPending || executeRun.isPending) ? (
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
                    <AlertDialogTitle>Confirmar ejecución</AlertDialogTitle>
                    <AlertDialogDescription>
                      Iniciar pipeline de elegibilidad para <strong>{countryLabel}</strong> periodo <strong>{period}</strong>?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExecutar}>Confirmar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            {/* Results ready: phase-1 results need human review/approval before the
                remaining steps run. Surface an explicit call-to-action so the card
                doesn't read as "finished" with no path forward (JAA-387). */}
            {isResultsReady && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={createRun.isPending || executeRun.isPending || isClosed}
                  title={isClosed ? "Proceso cerrado" : undefined}
                  onClick={() => handleRerun({ ...eligibilityParams } as Record<string, unknown>)}
                >
                  {(createRun.isPending || executeRun.isPending) ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCcw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Re-ejecutar
                </Button>
                <Button
                  size="sm"
                  className="flex-1 bg-amber-500 text-white hover:bg-amber-500/80"
                  onClick={() => setModalOpen(true)}
                >
                  <ClipboardCheck className="mr-2 h-3.5 w-3.5" />
                  Revisar y aprobar
                </Button>
              </>
            )}

            {/* Ready: green checkmark */}
            {isReady && (
              <div className="flex items-center gap-1.5 text-success text-sm font-medium flex-1">
                <CheckCircle2 className="h-4 w-4" />
                Listo
              </div>
            )}

            {/* Waiting for user action (mordom_ready, mordom_uploaded) */}
            {latestRun && ["mordom_ready", "mordom_uploaded"].includes(latestRun.status) && (
              <div className="flex items-center gap-1.5 text-warning text-sm font-medium flex-1">
                Acción requerida
              </div>
            )}

            {/* Ver detalle button. In results_ready the "Revisar y aprobar" CTA
                above already opens this same modal, so don't duplicate it. */}
            {showDetailButton && !isResultsReady && (
              <Button size="sm" variant="outline" onClick={() => setModalOpen(true)}>
                <Eye className="mr-2 h-3.5 w-3.5" />
                Ver detalle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <EligibilityDetailModal
        run={latestRun}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onRerun={handleRerun}
      />
      <EligibilityHistoryModal
        countryCode={countryCode}
        countryLabel={countryLabel}
        countryFlag={flag}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </>
  )
})

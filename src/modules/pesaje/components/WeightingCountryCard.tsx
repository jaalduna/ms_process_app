import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { History } from "lucide-react"
import { toast } from "sonner"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { useWeightingRuns, useCreateWeightingRun, useExecuteWeighting, useCancelWeighting } from "../hooks/useWeighting"
import { WeightingProgress } from "./WeightingProgress"
import { WeightingDetailModal } from "./WeightingDetailModal"
import { WeightingHistoryModal } from "./WeightingHistoryModal"
import { WeightingRunButton } from "./WeightingRunButton"
import { StopWeightingButton } from "./StopWeightingButton"
import { WEIGHTING_ACTIVE_STATUSES, WEIGHTING_STATUS_CONFIG } from "../types"
import { DEFAULT_WEIGHTING_PARAMS } from "../weightingParams"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { formatRelativeTime } from "@/lib/utils"

interface WeightingCountryCardProps {
  countryCode: string
  period: string
  lastFinalizedDate: string | null
}

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

export function WeightingCountryCard({ countryCode, period, lastFinalizedDate }: WeightingCountryCardProps) {
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
  const hasAnyRuns = runs != null && runs.length > 0
  const statusConfig = latestRun ? WEIGHTING_STATUS_CONFIG[latestRun.status] : null

  // Configure + run all happen inside the detail dialog now. The card just launches
  // whatever the dialog's editor produced; create then execute (the "iterate" loop).
  const handleRun = (params: Record<string, unknown>) => {
    createRun.mutate(
      { country: countryCode, period: periodStringToNumber(period), parameters: params },
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

  const handleCancel = () => {
    if (!latestRun) return
    cancelRun.mutate(latestRun.run_id, {
      onSuccess: () => toast.info(`Ejecucion detenida para ${countryLabel}`),
      onError: () => toast.error(`Error al detener ejecucion para ${countryLabel}`),
    })
  }

  const openDetail = () => setDetailModalOpen(true)

  const isStarting = createRun.isPending || executeRun.isPending

  return (
    <>
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Abrir detalle de Pesaje para ${countryLabel}`}
        onClick={openDetail}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            openDetail()
          }
        }}
        className="cursor-pointer transition-colors hover:border-ring/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
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

          {/* Hint: no runs yet — the card opens the config+run dialog */}
          {!isLoading && !latestRun && !isClosed && (
            <p className="text-xs text-muted-foreground">
              Sin ejecuciones. Clic para configurar y ejecutar.
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {/* Play/Stop toggle (clicks must not bubble to the card open handler) */}
            {isProcessing ? (
              <StopWeightingButton
                countryLabel={countryLabel}
                period={period}
                disabled={cancelRun.isPending}
                onConfirm={handleCancel}
              />
            ) : (
              !isClosed && (
                <WeightingRunButton
                  countryLabel={countryLabel}
                  period={period}
                  disabled={isStarting}
                  isStarting={isStarting}
                  onConfirm={() => handleRun({ ...DEFAULT_WEIGHTING_PARAMS })}
                />
              )
            )}

            {/* History button */}
            {hasAnyRuns && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setHistoryModalOpen(true)
                }}
                title="Historial"
              >
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
        onRun={isClosed ? undefined : handleRun}
        countryCode={countryCode}
        period={period}
      />

      <WeightingHistoryModal
        countryCode={countryCode}
        open={historyModalOpen}
        onOpenChange={setHistoryModalOpen}
      />
    </>
  )
}

import { useState } from "react"
import { TableCell, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { History } from "lucide-react"
import { toast } from "sonner"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { useWeightingRuns, useCreateWeightingRun, useExecuteWeighting, useCancelWeighting } from "../hooks/useWeighting"
import { WeightingDetailModal } from "./WeightingDetailModal"
import { WeightingHistoryModal } from "./WeightingHistoryModal"
import { WeightingRunButton } from "./WeightingRunButton"
import { StopWeightingButton } from "./StopWeightingButton"
import { WEIGHTING_ACTIVE_STATUSES, WEIGHTING_STATUS_CONFIG } from "../types"
import { DEFAULT_WEIGHTING_PARAMS } from "../weightingParams"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { formatRelativeTime } from "@/lib/utils"

interface WeightingCountryListRowProps {
  countryCode: string
  period: string
  lastFinalizedDate: string | null
}

function periodStringToNumber(period: string): number {
  return parseInt(period, 10)
}

/** List/table row rendering of WeightingCountryCard's same data + actions (JAA-763). */
export function WeightingCountryListRow({ countryCode, period, lastFinalizedDate }: WeightingCountryListRowProps) {
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const { data: runs } = useWeightingRuns(countryCode, periodStringToNumber(period))
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
      <TableRow
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
        className="cursor-pointer"
      >
        <TableCell className="font-medium">
          {flag && <span className="mr-1.5">{flag}</span>}
          {countryLabel}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs" title={lastFinalizedDate ? `Last: ${lastFinalizedDate.replace("T", " ").slice(0, 16)}` : undefined}>
            {lastFinalizedDate ? formatRelativeTime(lastFinalizedDate) : "never"}
          </Badge>
        </TableCell>
        <TableCell>
          <ProcessStatusBadge stage="pesaje" country={countryCode} countryLabel={countryLabel} showAttribution={false} />
        </TableCell>
        <TableCell>
          {statusConfig && (
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          )}
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2">
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
        </TableCell>
      </TableRow>

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

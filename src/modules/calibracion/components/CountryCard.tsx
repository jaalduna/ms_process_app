import { memo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { History } from "lucide-react"
import { toast } from "sonner"
import { cn, formatRelativeTime } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { DataAvailabilityBadge } from "./DataAvailabilityBadge"
import { CalibrationProgress } from "./CalibrationProgress"
import { CalibrationDetailModal } from "./CalibrationDetailModal"
import { CalibrationHistoryModal } from "./CalibrationHistoryModal"
import { CountryGroupByDialog } from "./CountryGroupByDialog"
import { CalibrateButton } from "./CalibrateButton"
import { StopCalibrationButton } from "./StopCalibrationButton"
import { useCalibration } from "../hooks/useCalibration"
import {
  useCountryGroupBy,
  useSaveCountryGroupBy,
  resolveGroupBy,
} from "../hooks/useCalibrationConfig"
import type { CountryInfo } from "@/types/api"
import type { DataAvailability, CalibrationConfig } from "../types"

interface CountryCardProps {
  country: CountryInfo
  period: string
  availability: DataAvailability
  availabilityLoading: boolean
  calibrationConfig: CalibrationConfig
  lastSyncDate: string | null
  lastCalibrationDate: string | null
}

export const CountryCard = memo(function CountryCard({ country, period, availability, availabilityLoading, calibrationConfig, lastSyncDate, lastCalibrationDate }: CountryCardProps) {
  const [showDetail, setShowDetail] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const { job, isPending, isCancelling, startCalibration, cancelCalibration } = useCalibration(country.code, "calibracion", period)

  const isRunning = job?.status === "running" || job?.status === "pending"
  const isCompleted = job?.status === "completed"
  const isFailed = job?.status === "failed"
  const isCancelled = job?.status === "cancelled"
  const { isClosed } = useProcessEntry("calibracion", country.code)
  // Unknown elegibilidad (null — not determinable a priori yet) must NOT block
  // triggering; only an explicit `false` does. The "?" badge signals the gap.
  const canTrigger = availability.elegibilidad !== false && !isRunning && !isPending && !isClosed

  // Per-country shared group_by (JAA-667): persisted under scope=country code,
  // falling back to the built-in DEFAULT_GROUP_BY when no row exists yet.
  const { data: groupByConfig } = useCountryGroupBy(country.code)
  const saveGroupBy = useSaveCountryGroupBy(country.code)
  const groupBy = resolveGroupBy(groupByConfig?.config, country.code)
  const groupByEditable = groupByConfig?.editable ?? false

  const countryLabel = COUNTRY_LABELS[country.code] ?? country.code
  const flag = COUNTRY_FLAGS[country.code] ?? ""

  return (
    <>
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
        role="button"
        tabIndex={0}
        aria-label={`View calibration details for ${countryLabel}`}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDetail(true) } }}
      >
        <CardHeader className="pb-2">
          <div className="space-y-1.5">
            <CardTitle className="text-lg whitespace-nowrap">
              {flag && <span className="mr-2">{flag}</span>}
              {countryLabel}
            </CardTitle>
            <div className="flex gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  lastSyncDate ? "text-muted-foreground" : "text-warning border-warning/30 bg-warning/15",
                )}
                title={lastSyncDate ? `Sync: ${lastSyncDate.replace("T", " ").slice(0, 16)}` : undefined}
              >
                Sync: {lastSyncDate ? formatRelativeTime(lastSyncDate) : "never"}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  lastCalibrationDate ? "text-muted-foreground" : "text-warning border-warning/30 bg-warning/15",
                )}
                title={lastCalibrationDate ? `Cal: ${lastCalibrationDate.replace("T", " ").slice(0, 16)}` : undefined}
              >
                Cal: {lastCalibrationDate ? formatRelativeTime(lastCalibrationDate) : "never"}
              </Badge>
            </div>
            <ProcessStatusBadge stage="calibracion" country={country.code} countryLabel={countryLabel} />
            {/* DependencyIndicator removed — sync is skipped, data already in Databricks */}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* Data availability */}
          <div className="flex gap-4">
            <DataAvailabilityBadge label="Elegibilidad" available={availability.elegibilidad} loading={availabilityLoading} />
            <DataAvailabilityBadge label="Pesaje" available={availability.pesaje} loading={availabilityLoading} />
          </div>

          {/* Progress bar with step indicators */}
          {job && (isRunning || isCompleted || isFailed || isCancelled) && (
            <CalibrationProgress job={job} />
          )}

          {/* Status badges */}
          {isCompleted && (
            <Badge variant="default" className="bg-success">
              Completed
            </Badge>
          )}
          {isFailed && <Badge variant="destructive">Failed</Badge>}
          {isCancelled && <Badge variant="secondary">Cancelled</Badge>}

          {/* Actions */}
          <div onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-2 min-w-0">
              <CalibrateButton
                countryLabel={countryLabel}
                period={period}
                calibrationConfig={calibrationConfig}
                groupBy={groupBy}
                canTrigger={canTrigger}
                isClosed={isClosed}
                isPending={isPending}
                isRunning={isRunning}
                startCalibration={startCalibration}
                className="flex-1"
              />

              {isRunning && (
                <StopCalibrationButton
                  countryLabel={countryLabel}
                  isCancelling={isCancelling}
                  cancelCalibration={cancelCalibration}
                />
              )}

              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowHistory(true)
                }}
                title="Historial"
              >
                <History className="h-3.5 w-3.5" />
              </Button>

              {/* Admin-only per-country group_by editor (JAA-667). */}
              {groupByEditable && (
                <CountryGroupByDialog
                  countryLabel={countryLabel}
                  value={groupBy}
                  saving={saveGroupBy.isPending}
                  onSave={async (gb) => {
                    try {
                      await saveGroupBy.mutateAsync(gb)
                      toast.success(`Group by guardado para ${countryLabel}`)
                    } catch (err) {
                      toast.error(
                        `No se pudo guardar group by: ${(err as Error).message ?? "error"}`,
                      )
                      throw err
                    }
                  }}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <CalibrationDetailModal
        job={job}
        open={showDetail}
        onClose={() => setShowDetail(false)}
      />
      <CalibrationHistoryModal
        country={country.code}
        countryLabel={countryLabel}
        countryFlag={flag}
        open={showHistory}
        onClose={() => setShowHistory(false)}
      />
    </>
  )
})

import { memo, useState } from "react"
import { TableCell, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye } from "lucide-react"
import { cn, formatRelativeTime } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { ProcessStatusBadge } from "@/components/ProcessStatusBadge"
import { useProcessEntry } from "@/hooks/useProcessStatus"
import { DataAvailabilityBadge } from "./DataAvailabilityBadge"
import { RunStatusBadge } from "./RunStatusBadge"
import { CalibrationDetailModal } from "./CalibrationDetailModal"
import { CalibrationHistoryModal } from "./CalibrationHistoryModal"
import { CalibrateButton } from "./CalibrateButton"
import { StopCalibrationButton } from "./StopCalibrationButton"
import { useCalibration } from "../hooks/useCalibration"
import type { CountryInfo } from "@/types/api"
import type { DataAvailability, CalibrationConfig } from "../types"

interface CountryListRowProps {
  country: CountryInfo
  period: string
  availability: DataAvailability
  availabilityLoading: boolean
  calibrationConfig: CalibrationConfig
  lastSyncDate: string | null
  lastCalibrationDate: string | null
  /** Permiso de rol para ejecutar; lo calcula la página. Default true. */
  canTriggerByRole?: boolean
}

/** List/table row rendering of CountryCard's same data + actions (JAA-763). */
export const CountryListRow = memo(function CountryListRow({
  country,
  period,
  availability,
  availabilityLoading,
  calibrationConfig,
  lastSyncDate,
  lastCalibrationDate,
  canTriggerByRole = true,
}: CountryListRowProps) {
  const [showDetail, setShowDetail] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const { job, isPending, isCancelling, startCalibration, cancelCalibration } = useCalibration(country.code, "calibracion", period)

  const isRunning = job?.status === "running" || job?.status === "pending"
  const { isClosed } = useProcessEntry("calibracion", country.code)
  const canTrigger = availability.elegibilidad !== false && !isRunning && !isPending && !isClosed

  const countryLabel = COUNTRY_LABELS[country.code] ?? country.code
  const flag = COUNTRY_FLAGS[country.code] ?? ""

  return (
    <>
      <TableRow
        className="cursor-pointer"
        role="button"
        tabIndex={0}
        aria-label={`View calibration history for ${countryLabel}`}
        onClick={() => setShowHistory(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowHistory(true) } }}
      >
        <TableCell className="font-medium">
          {flag && <span className="mr-2">{flag}</span>}
          {countryLabel}
        </TableCell>
        <TableCell>
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
        </TableCell>
        <TableCell>
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
        </TableCell>
        <TableCell>
          <ProcessStatusBadge stage="calibracion" country={country.code} countryLabel={countryLabel} showAttribution={false} />
        </TableCell>
        <TableCell>
          <div className="flex gap-3">
            <DataAvailabilityBadge label="Elegibilidad" available={availability.elegibilidad} loading={availabilityLoading} />
            <DataAvailabilityBadge label="Pesaje" available={availability.pesaje} loading={availabilityLoading} />
          </div>
        </TableCell>
        <TableCell>
          <RunStatusBadge status={job?.status} />
        </TableCell>
        <TableCell onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-wrap gap-2 min-w-0">
            {isRunning ? (
              <StopCalibrationButton
                countryLabel={countryLabel}
                isCancelling={isCancelling}
                cancelCalibration={cancelCalibration}
              />
            ) : (
              <CalibrateButton
                country={country.code}
                countryLabel={countryLabel}
                lastSyncLabel={lastSyncDate}
                period={period}
                calibrationConfig={calibrationConfig}
                canTrigger={canTrigger}
                canTriggerByRole={canTriggerByRole}
                isClosed={isClosed}
                isPending={isPending}
                isRunning={isRunning}
                startCalibration={startCalibration}
              />
            )}

            {job && (
              <Button
                size="sm"
                variant="outline"
                aria-label="View calibration details"
                onClick={() => setShowDetail(true)}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>

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

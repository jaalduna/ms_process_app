import { useEffect, useState } from "react"
import { toast } from "sonner"
import { PeriodSelector } from "@/components/PeriodSelector"
import { ViewToggle } from "@/components/ViewToggle"
import { CalibrationConfigDialog } from "../components/CalibrationConfigDialog"
import { CountryCard } from "../components/CountryCard"
import { CountryListRow } from "../components/CountryListRow"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCountries } from "@/hooks/useCountries"
import { useViewMode } from "@/hooks/useViewMode"
// useDataAvailability intentionally not used for now — see UNKNOWN_AVAILABILITY (JAA-570).
import { useLastSync } from "@/hooks/useLastSync"
import { useLastCalibration } from "../hooks/useLastCalibration"
import {
  useCalibrationConfig,
  useSaveCalibrationConfig,
  mergeCalibrationConfig,
} from "../hooks/useCalibrationConfig"
import type { DataAvailability, CalibrationConfig } from "../types"

function currentPeriod(): string {
  // Default to the previous month: January is calibrated in February, etc.
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

// Unknown availability: the elegibilidad/pesaje checks can't be determined a
// priori yet (the dev cloud env has no on-prem SQL connectivity, so the backend
// returns meaningless `false`s). Until the real check is implemented, force every
// card to "?" and keep triggering enabled (JAA-570). To re-enable the real
// signal: restore `useDataAvailability(period)` and pass
// `availability?.[c.code] ?? UNKNOWN_AVAILABILITY`.
const UNKNOWN_AVAILABILITY: DataAvailability = { elegibilidad: null, pesaje: null }

export function CalibrationPage() {
  const [period, setPeriod] = useState(currentPeriod)
  const [viewMode, setViewMode] = useViewMode("calibracion")

  useEffect(() => {
    // Legacy per-browser key that tracked in-flight calibration job-ids. Run state
    // is now server-authoritative (JAA-648), so any stale value is ignored and
    // removed one time on mount — the backend is the source of truth.
    try {
      localStorage.removeItem("bridge:calibration-job-ids")
    } catch {
      // ignore storage access errors
    }
  }, [])
  const { data, isLoading, error } = useCountries()
  const { data: lastSync } = useLastSync("pesaje")
  const { data: lastCalibration } = useLastCalibration()

  // Shared calibration defaults from the backend (JAA-645). Fall back to the
  // built-in DEFAULT_CALIBRATION_CONFIG for any key the backend hasn't set yet.
  const { data: configData } = useCalibrationConfig()
  const saveCalibrationConfig = useSaveCalibrationConfig()
  const calibrationConfig: CalibrationConfig = mergeCalibrationConfig(configData?.config)
  const editable = configData?.editable ?? false

  async function handleSave(config: CalibrationConfig) {
    try {
      await saveCalibrationConfig.mutateAsync(config)
      toast.success("Calibration settings saved")
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to save calibration settings")
      throw err
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calibración</h1>
          <p className="text-sm text-muted-foreground">
            Dispara y monitorea jobs de calibración por país
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          <PeriodSelector value={period} onChange={setPeriod} />
          <CalibrationConfigDialog
            config={calibrationConfig}
            editable={editable}
            onSave={handleSave}
            saving={saveCalibrationConfig.isPending}
          />
        </div>
      </div>

      {/* Country grid */}
      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load countries: {(error as Error).message}
        </div>
      )}

      {data && viewMode === "cards" && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.countries.filter((c) => c.type === "country").map((c) => (
            <CountryCard
              key={c.code}
              country={c}
              period={period}
              availability={UNKNOWN_AVAILABILITY}
              availabilityLoading={false}
              calibrationConfig={calibrationConfig}
              lastSyncDate={lastSync?.[c.code]?.completed_at ?? null}
              lastCalibrationDate={lastCalibration?.[c.code]?.completed_at ?? null}
            />
          ))}
        </div>
      )}

      {data && viewMode === "list" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>País</TableHead>
              <TableHead>Sync</TableHead>
              <TableHead>Cal</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Disponibilidad</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.countries.filter((c) => c.type === "country").map((c) => (
              <CountryListRow
                key={c.code}
                country={c}
                period={period}
                availability={UNKNOWN_AVAILABILITY}
                availabilityLoading={false}
                calibrationConfig={calibrationConfig}
                lastSyncDate={lastSync?.[c.code]?.completed_at ?? null}
                lastCalibrationDate={lastCalibration?.[c.code]?.completed_at ?? null}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  getCountries,
  getLastCalibration,
  getLastElegibilidad,
  getLastPrices,
  getLastWeighting,
  getLastMtr,
} from "@/lib/api"
import { Lock, LockOpen } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { PeriodSelector } from "@/components/PeriodSelector"
import { useProcessStatus } from "@/hooks/useProcessStatus"
import { cn } from "@/lib/utils"
import type { ProcessStage } from "@/types/api"

const STAGES = [
  { key: "precios", label: "Precios" },
  { key: "elegibilidad", label: "Elegibilidad" },
  { key: "pesaje", label: "Pesaje" },
  { key: "calibracion", label: "Calibración" },
  { key: "mtr", label: "MTR" },
] as const

type StageKey = (typeof STAGES)[number]["key"]
type StageEntry = { completed_at?: string; period?: number | string } | undefined
type StageCountries = Record<string, StageEntry> | undefined

const QUERY_CONFIG = { staleTime: 60_000 }

function dateCellClass(completedAt: string | undefined): string {
  if (!completedAt) return "bg-muted text-muted-foreground/60"
  const age = Date.now() - new Date(completedAt).getTime()
  const days = age / (1000 * 60 * 60 * 24)
  if (days <= 30) return "bg-success/15 text-success"
  if (days <= 90) return "bg-warning/15 text-warning"
  return "bg-destructive/10 text-destructive"
}

function formatDate(completedAt: string): string {
  return new Date(completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function formatPeriodLabel(period: string): string {
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
  const m = parseInt(period.slice(4), 10) - 1
  return `${months[m] ?? period.slice(4)} ${period.slice(0, 4)}`
}

/** Distinct periods present across the latest run of every stage × country, newest first. */
function discoverPeriods(...countryMaps: StageCountries[]): string[] {
  const set = new Set<string>()
  for (const map of countryMaps) {
    for (const entry of Object.values(map ?? {})) {
      if (entry?.period != null) set.add(String(entry.period))
    }
  }
  return Array.from(set).sort((a, b) => b.localeCompare(a))
}

export default function OverviewPage() {
  const { data: countriesData, isLoading: countriesLoading } = useQuery({
    queryKey: ["countries"],
    queryFn: getCountries,
    ...QUERY_CONFIG,
  })

  // --- Discovery: unfiltered last-* (latest run per stage×country) → available periods.
  // Shares the cache key the stage cards already use, so it is effectively free.
  const discPrecios = useQuery({ queryKey: ["last-prices"], queryFn: () => getLastPrices(), ...QUERY_CONFIG })
  const discEleg = useQuery({ queryKey: ["last-elegibilidad"], queryFn: () => getLastElegibilidad(), ...QUERY_CONFIG })
  const discPesaje = useQuery({ queryKey: ["last-weighting"], queryFn: () => getLastWeighting(), ...QUERY_CONFIG })
  const discCalib = useQuery({ queryKey: ["last-calibration"], queryFn: () => getLastCalibration(), ...QUERY_CONFIG })
  const discMtr = useQuery({ queryKey: ["last-mtr"], queryFn: () => getLastMtr(), ...QUERY_CONFIG })

  const availablePeriods = useMemo(
    () => discoverPeriods(
      discPrecios.data?.countries,
      discEleg.data?.countries,
      discPesaje.data?.countries,
      discCalib.data?.countries,
      discMtr.data?.countries,
    ),
    [discPrecios.data, discEleg.data, discPesaje.data, discCalib.data, discMtr.data],
  )

  // Default to the most recent period that has data: hold only the explicit user
  // pick in state and derive the effective period, so no effect-driven setState.
  const [pickedPeriod, setPickedPeriod] = useState<string | null>(null)
  const selectedPeriod = pickedPeriod ?? availablePeriods[0] ?? null
  const setSelectedPeriod = setPickedPeriod

  // --- Display: period-keyed last-* (latest run per country within the period) ---
  const period = selectedPeriod != null ? Number(selectedPeriod) : undefined
  const enabled = selectedPeriod != null
  const preciosQ = useQuery({ queryKey: ["last-prices", selectedPeriod], queryFn: () => getLastPrices(period), enabled, ...QUERY_CONFIG })
  const elegQ = useQuery({ queryKey: ["last-elegibilidad", selectedPeriod], queryFn: () => getLastElegibilidad(period), enabled, ...QUERY_CONFIG })
  const pesajeQ = useQuery({ queryKey: ["last-weighting", selectedPeriod], queryFn: () => getLastWeighting(period), enabled, ...QUERY_CONFIG })
  const calibQ = useQuery({ queryKey: ["last-calibration", selectedPeriod], queryFn: () => getLastCalibration(period), enabled, ...QUERY_CONFIG })
  const mtrQ = useQuery({ queryKey: ["last-mtr", selectedPeriod], queryFn: () => getLastMtr(period), enabled, ...QUERY_CONFIG })

  const { data: processData } = useProcessStatus()

  const dataLoading =
    selectedPeriod == null ||
    preciosQ.isLoading || elegQ.isLoading || pesajeQ.isLoading || calibQ.isLoading || mtrQ.isLoading

  const countries = countriesData?.countries.filter((c) => c.type === "country") ?? []

  const stageDataMap = useMemo<Record<StageKey, StageCountries>>(() => ({
    precios: preciosQ.data?.countries,
    elegibilidad: elegQ.data?.countries,
    pesaje: pesajeQ.data?.countries,
    calibracion: calibQ.data?.countries,
    mtr: mtrQ.data?.countries,
  }), [preciosQ.data, elegQ.data, pesajeQ.data, calibQ.data, mtrQ.data])

  function getEntry(stageKey: StageKey, countryCode: string): StageEntry {
    return stageDataMap[stageKey]?.[countryCode]
  }

  function getProcessEntry(stageKey: ProcessStage, countryCode: string) {
    return processData?.countries[countryCode]?.[stageKey]
  }

  // Keep the active selection in the dropdown even if discovery didn't surface it.
  const periodOptions = selectedPeriod && !availablePeriods.includes(selectedPeriod)
    ? [selectedPeriod, ...availablePeriods]
    : availablePeriods

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Country Pipeline Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedPeriod
              ? `Estado por etapa — periodo ${formatPeriodLabel(selectedPeriod)}`
              : "Estado por etapa y país"}
          </p>
        </div>
        {periodOptions.length > 0 && selectedPeriod && (
          <PeriodSelector value={selectedPeriod} onChange={setSelectedPeriod} periods={periodOptions} />
        )}
      </div>

      {countriesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground w-24">
                  Country
                </th>
                {STAGES.map((s) => (
                  <th key={s.key} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countries.map((country, idx) => (
                <tr
                  key={country.code}
                  className={cn(
                    "border-b transition-colors last:border-0 hover:bg-accent/40",
                    idx % 2 === 1 && "bg-muted/20",
                  )}
                >
                  <td className="px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wide">
                    {country.code}
                  </td>
                  {STAGES.map((stage) => {
                    if (dataLoading) {
                      return (
                        <td key={stage.key} className="px-4 py-2">
                          <Skeleton className="h-6 w-20 rounded" />
                        </td>
                      )
                    }
                    const entry = getEntry(stage.key, country.code)
                    const completedAt = entry?.completed_at
                    const proc = getProcessEntry(stage.key, country.code)
                    const procLabel = proc
                      ? `Proceso ${proc.status === "open" ? "abierto" : "cerrado"}${proc.changed_by ? ` por ${proc.changed_by}` : ""}`
                      : null
                    return (
                      <td key={stage.key} className="px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            title={completedAt ? new Date(completedAt).toLocaleString() : undefined}
                            className={cn(
                              "inline-flex flex-col rounded px-2 py-1 text-xs leading-tight",
                              dateCellClass(completedAt),
                            )}
                          >
                            {completedAt ? <span>{formatDate(completedAt)}</span> : <span>—</span>}
                          </span>
                          {proc && procLabel && (
                            proc.status === "open" ? (
                              <LockOpen role="img" aria-label={procLabel} className="h-3.5 w-3.5 shrink-0 text-success/70" />
                            ) : (
                              <Lock role="img" aria-label={procLabel} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            )
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

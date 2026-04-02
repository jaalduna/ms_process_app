import { useState } from "react"
import { PeriodSelector } from "@/components/PeriodSelector"
import { WeightingConfigDialog, DEFAULT_WEIGHTING_PARAMS } from "../components/WeightingConfigDialog"
import type { WeightingParams } from "../components/WeightingConfigDialog"
import { WeightingCountryCard } from "../components/WeightingCountryCard"
import { Skeleton } from "@/components/ui/skeleton"
import { useCountries } from "@/hooks/useCountries"
import { useLastWeighting } from "../hooks/useLastWeighting"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

export function PesajePage() {
  const [period, setPeriod] = useState(currentPeriod)
  const [weightingParams, setWeightingParams] = useState<WeightingParams>(DEFAULT_WEIGHTING_PARAMS)
  const { data, isLoading, error } = useCountries()
  const { data: lastWeighting } = useLastWeighting()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pesaje</h1>
          <p className="text-sm text-muted-foreground">
            Ejecuta y monitorea procesos de pesaje por pais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <WeightingConfigDialog params={weightingParams} onChange={setWeightingParams} />
        </div>
      </div>

      {/* Country grid */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar paises: {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.countries.filter((c) => c.type === "country").map((c) => (
            <WeightingCountryCard
              key={c.code}
              countryCode={c.code}
              period={period}
              weightingParams={weightingParams}
              lastFinalizedDate={lastWeighting?.[c.code]?.completed_at ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}

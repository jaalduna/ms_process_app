import { useState } from "react"
import { PeriodSelector } from "@/components/PeriodSelector"
import { MtrConfigDialog } from "../components/MtrConfigDialog"
import { MtrCountryCard } from "../components/MtrCountryCard"
import { Skeleton } from "@/components/ui/skeleton"
import { useCountries } from "@/hooks/useCountries"
import { useLastMtr } from "../hooks/useLastMtr"
import type { MtrParams } from "../types"
import { DEFAULT_MTR_PARAMS } from "../types"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

export function QmsTrPage() {
  const [period, setPeriod] = useState(currentPeriod)
  const [mtrParams, setMtrParams] = useState<MtrParams>(DEFAULT_MTR_PARAMS)
  const { data, isLoading, error } = useCountries()
  const { data: lastMtr } = useLastMtr()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">QMS-TR</h1>
          <p className="text-sm text-muted-foreground">
            Deeper calibration targets and imputations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <MtrConfigDialog params={mtrParams} onChange={setMtrParams} />
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
          Error loading countries: {(error as Error).message}
        </div>
      )}

      {data && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.countries.filter((c) => c.type === "country").map((c) => (
            <MtrCountryCard
              key={c.code}
              countryCode={c.code}
              period={period}
              mtrParams={mtrParams}
              lastMtrDate={lastMtr?.[c.code]?.completed_at ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}

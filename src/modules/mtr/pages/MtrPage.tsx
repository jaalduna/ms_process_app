import { useState } from "react"
import { toast } from "sonner"
import { PeriodSelector } from "@/components/PeriodSelector"
import { MtrConfigDialog } from "../components/MtrConfigDialog"
import { MtrCountryCard } from "../components/MtrCountryCard"
import { Skeleton } from "@/components/ui/skeleton"
import { useCountries } from "@/hooks/useCountries"
import { useLastMtr } from "../hooks/useLastMtr"
import { useMtrConfig, useSaveMtrConfig, mergeMtrParams } from "../hooks/useMtrConfig"
import type { MtrParams } from "../types"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

export function MtrPage() {
  const [period, setPeriod] = useState(currentPeriod)
  const { data, isLoading, error } = useCountries()
  const { data: lastMtr } = useLastMtr()

  // Shared MTR defaults from the backend (JAA-644). Fall back to the built-in
  // DEFAULT_MTR_PARAMS for any key the backend hasn't set yet.
  const { data: mtrConfig } = useMtrConfig()
  const saveMtrConfig = useSaveMtrConfig()
  const mtrParams: MtrParams = mergeMtrParams(mtrConfig?.config)
  const editable = mtrConfig?.editable ?? false

  async function handleSave(params: MtrParams) {
    try {
      await saveMtrConfig.mutateAsync(params)
      toast.success("MTR parameters saved")
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to save MTR parameters")
      throw err
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MTR</h1>
          <p className="text-sm text-muted-foreground">
            Deeper calibration targets and imputations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <MtrConfigDialog
            params={mtrParams}
            editable={editable}
            onSave={handleSave}
            saving={saveMtrConfig.isPending}
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

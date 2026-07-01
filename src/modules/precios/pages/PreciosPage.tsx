import { useState } from "react"
import { toast } from "sonner"
import { PeriodSelector } from "@/components/PeriodSelector"
import { PricesConfigDialog } from "../components/PricesConfigDialog"
import { PricesCountryCard } from "../components/PricesCountryCard"
import { Skeleton } from "@/components/ui/skeleton"
import { useCountries } from "@/hooks/useCountries"
import { useLastPrices } from "../hooks/useLastPrices"
import {
  usePricesConfig,
  useSavePricesConfig,
  mergePricesConfig,
} from "../hooks/usePricesConfig"
import type { PricesConfig } from "../types"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

export function PreciosPage() {
  const [period, setPeriod] = useState(currentPeriod)
  const { data, isLoading, error } = useCountries()
  const { data: lastPrices } = useLastPrices()

  // Shared prices defaults from the backend (JAA-646). Fall back to the built-in
  // (dummy) DEFAULT_PRICES_CONFIG for any key the backend hasn't set yet.
  const { data: configData } = usePricesConfig()
  const savePricesConfig = useSavePricesConfig()
  const pricesConfig: PricesConfig = mergePricesConfig(configData?.config)
  const editable = configData?.editable ?? false

  async function handleSave(config: PricesConfig) {
    try {
      await savePricesConfig.mutateAsync(config)
      toast.success("Prices settings saved")
    } catch (err) {
      toast.error((err as Error).message ?? "Failed to save prices settings")
      throw err
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Precios</h1>
          <p className="text-sm text-muted-foreground">
            Valida precios por pais y periodo
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <PricesConfigDialog
            config={pricesConfig}
            editable={editable}
            onSave={handleSave}
            saving={savePricesConfig.isPending}
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

      {data && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.countries.filter((c) => c.type === "country").map((c) => (
            <PricesCountryCard
              key={c.code}
              country={c}
              period={period}
              lastValidationDate={lastPrices?.[c.code]?.completed_at ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}

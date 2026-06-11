import { useQuery } from "@tanstack/react-query"
import {
  getCountries,
  getLastSync,
  getLastCalibration,
  getLastElegibilidad,
  getLastPrices,
  getLastWeighting,
  getLastMtr,
} from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const STAGES = [
  { key: "sync", label: "Sync" },
  { key: "calibracion", label: "Calibración" },
  { key: "elegibilidad", label: "Elegibilidad" },
  { key: "precios", label: "Precios" },
  { key: "pesaje", label: "Pesaje" },
  { key: "mtr", label: "MTR" },
] as const

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

export default function OverviewPage() {
  const { data: countriesData, isLoading: countriesLoading } = useQuery({
    queryKey: ["countries"],
    queryFn: getCountries,
    ...QUERY_CONFIG,
  })

  const { data: syncData, isLoading: syncLoading } = useQuery({
    queryKey: ["last-sync"],
    queryFn: () => getLastSync(),
    ...QUERY_CONFIG,
  })

  const { data: calibData, isLoading: calibLoading } = useQuery({
    queryKey: ["last-calibration"],
    queryFn: getLastCalibration,
    ...QUERY_CONFIG,
  })

  const { data: elegData, isLoading: elegLoading } = useQuery({
    queryKey: ["last-elegibilidad"],
    queryFn: getLastElegibilidad,
    ...QUERY_CONFIG,
  })

  const { data: preciosData, isLoading: preciosLoading } = useQuery({
    queryKey: ["last-prices"],
    queryFn: getLastPrices,
    ...QUERY_CONFIG,
  })

  const { data: pesajeData, isLoading: pesajeLoading } = useQuery({
    queryKey: ["last-weighting"],
    queryFn: getLastWeighting,
    ...QUERY_CONFIG,
  })

  const { data: mtrData, isLoading: mtrLoading } = useQuery({
    queryKey: ["last-mtr"],
    queryFn: getLastMtr,
    ...QUERY_CONFIG,
  })

  const dataLoading =
    syncLoading || calibLoading || elegLoading || preciosLoading || pesajeLoading || mtrLoading

  const countries = countriesData?.countries.filter((c) => c.type === "country") ?? []

  function getEntry(stageKey: typeof STAGES[number]["key"], countryCode: string) {
    switch (stageKey) {
      case "sync": return syncData?.countries[countryCode]
      case "calibracion": return calibData?.countries[countryCode]
      case "elegibilidad": return elegData?.countries[countryCode]
      case "precios": return preciosData?.countries[countryCode]
      case "pesaje": return pesajeData?.countries[countryCode]
      case "mtr": return mtrData?.countries[countryCode]
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Country Pipeline Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Last completed stage per country</p>
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
                    const period = (entry as { period?: number | string } | undefined)?.period
                    return (
                      <td key={stage.key} className="px-4 py-2">
                        <span
                          title={completedAt ? new Date(completedAt).toLocaleString() : undefined}
                          className={cn(
                            "inline-flex flex-col rounded px-2 py-1 text-xs leading-tight",
                            dateCellClass(completedAt),
                          )}
                        >
                          {completedAt ? (
                            <>
                              <span>{formatDate(completedAt)}</span>
                              {period != null && (
                                <span className="opacity-70">{String(period)}</span>
                              )}
                            </>
                          ) : (
                            <span>—</span>
                          )}
                        </span>
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

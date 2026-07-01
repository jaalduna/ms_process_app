import { useState } from "react"
import { PeriodSelector } from "@/components/PeriodSelector"
import { ProcessWorkspaceTabs } from "@/components/ProcessWorkspaceTabs"
import { ViewToggle } from "@/components/ViewToggle"
import { WeightingCountryCard } from "../components/WeightingCountryCard"
import { WeightingCountryListRow } from "../components/WeightingCountryListRow"
import { WeightingHistoryPanel } from "../components/WeightingHistoryPanel"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useCountries } from "@/hooks/useCountries"
import { useViewMode } from "@/hooks/useViewMode"
import { useLastWeighting } from "../hooks/useLastWeighting"
import { PesajeParametrosTab } from "../components/PesajeParametrosTab"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

export function PesajePage() {
  const [period, setPeriod] = useState(currentPeriod)
  const [viewMode, setViewMode] = useViewMode("pesaje")
  const { data, isLoading, error } = useCountries()
  const { data: lastWeighting } = useLastWeighting()

  const ejecutar = (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <ViewToggle value={viewMode} onChange={setViewMode} />
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

      {data && viewMode === "cards" && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.countries.filter((c) => c.type === "country").map((c) => (
            <WeightingCountryCard
              key={c.code}
              countryCode={c.code}
              period={period}
              lastFinalizedDate={lastWeighting?.[c.code]?.completed_at ?? null}
            />
          ))}
        </div>
      )}

      {data && viewMode === "list" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>País</TableHead>
              <TableHead>Último</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Resultado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.countries.filter((c) => c.type === "country").map((c) => (
              <WeightingCountryListRow
                key={c.code}
                countryCode={c.code}
                period={period}
                lastFinalizedDate={lastWeighting?.[c.code]?.completed_at ?? null}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )

  const parametros = <PesajeParametrosTab />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pesaje</h1>
        <p className="text-sm text-muted-foreground">
          Ejecuta y monitorea procesos de pesaje por pais
        </p>
      </div>

      <ProcessWorkspaceTabs
        tabs={[
          { value: "ejecutar", label: "Ejecutar", content: ejecutar },
          { value: "parametros", label: "Parametros", content: parametros },
          { value: "historial", label: "Historial", content: <WeightingHistoryPanel /> },
        ]}
      />
    </div>
  )
}

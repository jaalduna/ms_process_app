import { useState } from "react"
import { PeriodSelector } from "@/components/PeriodSelector"
import { EligibilityConfigDialog, DEFAULT_ELIGIBILITY_PARAMS } from "../components/EligibilityConfigDialog"
import type { EligibilityParams } from "../components/EligibilityConfigDialog"
import { EligibilityCountryRow } from "../components/EligibilityCountryRow"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useCountries } from "@/hooks/useCountries"
import { useLastElegibilidad } from "../hooks/useLastElegibilidad"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const yyyy = prev.getFullYear()
  const mm = String(prev.getMonth() + 1).padStart(2, "0")
  return `${yyyy}${mm}`
}

export function ElegibilidadPage() {
  const [period, setPeriod] = useState(currentPeriod)
  const [eligibilityParams, setEligibilityParams] = useState<EligibilityParams>(DEFAULT_ELIGIBILITY_PARAMS)
  const { data, isLoading, error } = useCountries()
  const { data: lastElegibilidad } = useLastElegibilidad()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Elegibilidad</h1>
          <p className="text-sm text-muted-foreground">
            Ejecuta y monitorea procesos de elegibilidad por país
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={setPeriod} />
          <EligibilityConfigDialog params={eligibilityParams} onChange={setEligibilityParams} />
        </div>
      </div>

      {/* Country list (patrón lista de wp-calibration-app) */}
      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          Error al cargar países: {(error as Error).message}
        </div>
      )}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>País</TableHead>
              <TableHead className="hidden lg:table-cell">Última corrida</TableHead>
              <TableHead className="hidden md:table-cell">Dependencias</TableHead>
              <TableHead className="hidden md:table-cell">Proceso</TableHead>
              <TableHead>Corrida actual</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.countries.filter((c) => c.type === "country").map((c) => (
              <EligibilityCountryRow
                key={c.code}
                countryCode={c.code}
                period={period}
                eligibilityParams={eligibilityParams}
                lastFinalizedDate={lastElegibilidad?.[c.code]?.completed_at ?? null}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useWeightingRuns } from "../hooks/useWeighting"
import { WEIGHTING_STATUS_CONFIG } from "../types"
import { COUNTRY_LABELS } from "./WeightingCountryCard"

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/**
 * Page-level weighting history: a simple flat list of every run across countries.
 * Reuses the same data source as WeightingHistoryModal (useWeightingRuns) without
 * a country filter. Minimal by design — richer per-country detail stays in the modal.
 */
export function WeightingHistoryPanel() {
  const { data: runs, isLoading } = useWeightingRuns()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!runs || runs.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No hay ejecuciones registradas.</p>
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[minmax(96px,auto)_minmax(64px,auto)_minmax(80px,auto)_minmax(0,1fr)] gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
        <span>Pais</span>
        <span>Periodo</span>
        <span>Estado</span>
        <span>Fecha</span>
      </div>
      {runs.map((run) => {
        const statusConfig = WEIGHTING_STATUS_CONFIG[run.status]
        return (
          <div
            key={run.run_id}
            className="grid grid-cols-[minmax(96px,auto)_minmax(64px,auto)_minmax(80px,auto)_minmax(0,1fr)] gap-2 items-center px-2 py-1.5 text-xs rounded hover:bg-muted/50"
          >
            <span>{COUNTRY_LABELS[run.country] ?? run.country}</span>
            <span className="font-mono">{run.period}</span>
            <Badge variant={statusConfig.variant} className={`${statusConfig.className} text-[10px] px-1.5 py-0 w-fit`}>
              {statusConfig.label}
            </Badge>
            <span className="text-muted-foreground">
              {run.started_at ? formatDate(run.started_at) : "-"}
            </span>
          </div>
        )
      })}
    </div>
  )
}

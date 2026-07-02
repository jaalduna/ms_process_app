import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Download, Eye, FileText, Loader2 } from "lucide-react"
import { usePricesHistory } from "../hooks/usePricesHistory"
import { PricesDetailModal } from "./PricesDetailModal"
import { downloadOutliersCSV } from "../outliersCsv"
import { PRICES_STATUS_CONFIG } from "../types"
import type { PricesRun } from "../types"
import { LiveDuration, parseUTC } from "@/lib/duration"

interface PricesHistoryModalProps {
  country: string
  countryLabel: string
  countryFlag: string
  open: boolean
  onClose: () => void
}

function formatDate(isoDate: string): string {
  const d = new Date(parseUTC(isoDate))
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

const GRID = "grid grid-cols-[minmax(64px,auto)_minmax(80px,auto)_minmax(110px,auto)_minmax(48px,auto)_minmax(0,1fr)_auto] gap-2"

export function PricesHistoryModal({ country, countryLabel, countryFlag, open, onClose }: PricesHistoryModalProps) {
  const { data, isLoading, isError } = usePricesHistory(country, open)
  const items = data?.items ?? []
  const [selectedRun, setSelectedRun] = useState<PricesRun | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const handleViewDetail = (run: PricesRun) => {
    setSelectedRun(run)
    setDetailOpen(true)
  }

  const handleDownload = (run: PricesRun) => {
    if (downloadOutliersCSV(run)) {
      toast.success("CSV descargado")
    } else {
      toast.error("Sin outliers para descargar")
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {countryFlag && <span>{countryFlag}</span>}
              <span>Historial de Precios - {countryLabel}</span>
            </DialogTitle>
            <DialogDescription>
              Todas las validaciones de precios para {countryLabel}.
            </DialogDescription>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && isError && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-destructive/40 mb-3" />
              <p className="text-sm font-medium text-destructive">Error al cargar el historial</p>
              <p className="text-xs text-muted-foreground mt-1">
                Intenta de nuevo mas tarde o revisa tu conexion.
              </p>
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No hay validaciones registradas.</p>
          )}

          {!isLoading && !isError && items.length > 0 && (
            <div className="space-y-1">
              {/* Table header */}
              <div className={`${GRID} px-2 py-1.5 text-xs font-medium text-muted-foreground border-b`}>
                <span>Periodo</span>
                <span>Estado</span>
                <span>Fecha</span>
                <span>Duracion</span>
                <span>Resumen</span>
                <span>Acciones</span>
              </div>

              {items.map((run) => {
                const statusConfig = PRICES_STATUS_CONFIG[run.status]
                const hasOutliers = (run.outliers?.length ?? run.outliers_count ?? 0) > 0
                const summary = run.error_message
                  ? `Error: ${run.error_message}`
                  : run.outliers_count != null
                    ? `${run.outliers_count} outliers`
                    : "-"

                return (
                  <div
                    key={run.run_id}
                    className={`${GRID} items-center px-2 py-1.5 text-xs rounded hover:bg-muted/50`}
                  >
                    <span className="font-mono">{run.period}</span>
                    <Badge variant={statusConfig.variant} className={`${statusConfig.className} text-[10px] px-1.5 py-0 w-fit`}>
                      {statusConfig.label}
                    </Badge>
                    <span className="text-muted-foreground">
                      {run.started_at ? formatDate(run.started_at) : formatDate(run.created_at)}
                    </span>
                    <span className="text-muted-foreground">
                      <LiveDuration start={run.started_at} end={run.completed_at} />
                    </span>
                    <span className="text-muted-foreground truncate">{summary}</span>
                    <div className="flex gap-1">
                      {hasOutliers && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => handleDownload(run)}
                          title="Descargar CSV de outliers"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleViewDetail(run)}
                        title="Ver detalle"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}

              {data && data.total > items.length && (
                <p className="text-xs text-muted-foreground text-center pt-3">
                  Mostrando {items.length} de {data.total} validaciones
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PricesDetailModal
        run={selectedRun}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </>
  )
}

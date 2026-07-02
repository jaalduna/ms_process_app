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
import { Download, Eye, Loader2 } from "lucide-react"
import { downloadEligibilityFile } from "@/lib/api"
import { LiveDuration, parseUTC } from "@/lib/duration"
import { useEligibilityHistory } from "../hooks/useEligibility"
import { EligibilityDetailModal } from "./EligibilityDetailModal"
import { STATUS_CONFIG } from "../types"
import type { EligibilityRun, EligibilityFile } from "../types"

interface EligibilityHistoryModalProps {
  countryCode: string
  countryLabel: string
  countryFlag: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(isoDate: string): string {
  const d = new Date(parseUTC(isoDate))
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

/** The Phase A results file is the stage-1 download file. */
function phaseAFile(run: EligibilityRun): EligibilityFile | undefined {
  return run.files?.find((f) => f.stage === 1 && f.direction === "download")
}

const GRID = "grid grid-cols-[minmax(64px,auto)_minmax(96px,auto)_minmax(110px,auto)_minmax(48px,auto)_minmax(0,1fr)_auto] gap-2"

export function EligibilityHistoryModal({
  countryCode,
  countryLabel,
  countryFlag,
  open,
  onOpenChange,
}: EligibilityHistoryModalProps) {
  const { data: runs, isLoading } = useEligibilityHistory(countryCode, open)
  const [selectedRun, setSelectedRun] = useState<EligibilityRun | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleViewDetail = (run: EligibilityRun) => {
    setSelectedRun(run)
    setDetailOpen(true)
  }

  const handleDownload = async (run: EligibilityRun) => {
    const file = phaseAFile(run)
    if (!file) {
      toast.error("Sin resultados para descargar")
      return
    }
    setDownloadingId(run.run_id)
    try {
      await downloadEligibilityFile(run.run_id, file.file_id, file.filename)
      toast.success("Resultados descargados")
    } catch {
      toast.error("Error al descargar resultados")
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {countryFlag && <span>{countryFlag}</span>}
              <span>Historial de Elegibilidad - {countryLabel}</span>
            </DialogTitle>
            <DialogDescription>
              Todas las ejecuciones de elegibilidad para {countryLabel}.
            </DialogDescription>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && (!runs || runs.length === 0) && (
            <p className="text-sm text-muted-foreground py-4">No hay ejecuciones registradas.</p>
          )}

          {!isLoading && runs && runs.length > 0 && (
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

              {runs.map((run) => {
                const statusConfig = STATUS_CONFIG[run.status]
                const hasResults = !!phaseAFile(run)
                const summary = run.error_message
                  ? `Error: ${run.error_message}`
                  : run.approved_by
                    ? `Aprobado por ${run.approved_by}`
                    : "-"

                return (
                  <div
                    key={run.run_id}
                    className={`${GRID} items-center px-2 py-1.5 text-xs rounded hover:bg-muted/50`}
                  >
                    <span className="font-mono">{run.period}</span>
                    {statusConfig ? (
                      <Badge variant={statusConfig.variant} className={`${statusConfig.className} text-[10px] px-1.5 py-0 w-fit`}>
                        {statusConfig.label}
                      </Badge>
                    ) : (
                      <span>{run.status}</span>
                    )}
                    <span className="text-muted-foreground">
                      {run.started_at ? formatDate(run.started_at) : formatDate(run.created_at)}
                    </span>
                    <span className="text-muted-foreground">
                      <LiveDuration start={run.started_at} end={run.completed_at} />
                    </span>
                    <span className="text-muted-foreground truncate">{summary}</span>
                    <div className="flex gap-1">
                      {hasResults && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={downloadingId === run.run_id}
                          onClick={() => handleDownload(run)}
                          title="Descargar resultados (Phase A)"
                        >
                          {downloadingId === run.run_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
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
            </div>
          )}
        </DialogContent>
      </Dialog>

      <EligibilityDetailModal
        run={selectedRun}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  )
}

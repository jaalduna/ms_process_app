import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
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
import { Input } from "@/components/ui/input"
import { Download, Eye, Loader2, Star } from "lucide-react"
import { downloadWeightingCSV, patchWeightingRun } from "@/lib/api"
import { useWeightingRuns } from "../hooks/useWeighting"
import { WeightingDetailModal } from "./WeightingDetailModal"
import { WEIGHTING_STATUS_CONFIG } from "../types"
import { COUNTRY_LABELS } from "@/lib/countries"
import type { WeightingRun } from "../types"

const GRID = "grid grid-cols-[minmax(28px,auto)_minmax(64px,auto)_minmax(80px,auto)_minmax(110px,auto)_minmax(48px,auto)_minmax(0,1fr)_minmax(100px,auto)_auto] gap-2"

interface WeightingHistoryModalProps {
  countryCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) return "-"
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const totalSeconds = Math.max(0, Math.round((e - s) / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const m = Math.floor(totalSeconds / 60)
  const sec = totalSeconds % 60
  return `${m}m ${sec}s`
}

export function WeightingHistoryModal({ countryCode, open, onOpenChange }: WeightingHistoryModalProps) {
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode
  const { data: runs, isLoading } = useWeightingRuns(open ? countryCode : undefined)
  const [selectedRun, setSelectedRun] = useState<WeightingRun | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const patchMutation = useMutation({
    mutationFn: ({ runId, patch }: { runId: string; patch: { is_final?: boolean; label?: string } }) =>
      patchWeightingRun(runId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["weighting-runs", countryCode, undefined] })
    },
    onError: () => {
      toast.error("No se pudo actualizar la corrida")
    },
  })

  const handleToggleFinal = (run: WeightingRun) => {
    patchMutation.mutate({ runId: run.run_id, patch: { is_final: !run.is_final } })
  }

  const handleLabelBlur = (run: WeightingRun) => {
    const draft = labelDrafts[run.run_id]
    if (draft === undefined || draft === (run.label ?? "")) return
    patchMutation.mutate({ runId: run.run_id, patch: { label: draft } })
  }

  const handleDownload = async (run: WeightingRun) => {
    setDownloadingId(run.run_id)
    try {
      await downloadWeightingCSV(run.run_id)
      toast.success("CSV descargado")
    } catch {
      toast.error("Error al descargar CSV")
    } finally {
      setDownloadingId(null)
    }
  }

  const handleViewDetail = (run: WeightingRun) => {
    setSelectedRun(run)
    setDetailOpen(true)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Pesaje - {countryLabel}</DialogTitle>
            <DialogDescription>
              Todas las ejecuciones de pesaje para {countryLabel}.
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
                <span>Final</span>
                <span>Periodo</span>
                <span>Estado</span>
                <span>Fecha</span>
                <span>Duracion</span>
                <span>Resumen</span>
                <span>Etiqueta</span>
                <span>Acciones</span>
              </div>

              {runs.map((run) => {
                const statusConfig = WEIGHTING_STATUS_CONFIG[run.status]
                const summary = run.summary_stats
                  ? `${run.summary_stats.total_households.toLocaleString()} hogares, peso medio ${run.summary_stats.mean_weight.toFixed(2)}`
                  : null

                return (
                  <div
                    key={run.run_id}
                    className={`${GRID} items-center px-2 py-1.5 text-xs rounded hover:bg-muted/50`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={patchMutation.isPending}
                      onClick={() => handleToggleFinal(run)}
                      aria-label={run.is_final ? "Quitar marca de final" : "Marcar como final"}
                      aria-pressed={!!run.is_final}
                      title={run.is_final ? "Corrida final" : "Marcar como final"}
                    >
                      <Star className={`h-3.5 w-3.5 ${run.is_final ? "fill-warning text-warning" : "text-muted-foreground"}`} />
                    </Button>
                    <span className="font-mono">{run.period}</span>
                    <Badge variant={statusConfig.variant} className={`${statusConfig.className} text-[10px] px-1.5 py-0 w-fit`}>
                      {statusConfig.label}
                    </Badge>
                    <span className="text-muted-foreground">
                      {run.started_at ? formatDate(run.started_at) : "-"}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDuration(run.started_at, run.completed_at)}
                    </span>
                    <span className="text-muted-foreground truncate">
                      {summary ?? (run.error_message ? `Error: ${run.error_message}` : "-")}
                    </span>
                    <Input
                      value={labelDrafts[run.run_id] ?? run.label ?? ""}
                      onChange={(e) => setLabelDrafts((prev) => ({ ...prev, [run.run_id]: e.target.value }))}
                      onBlur={() => handleLabelBlur(run)}
                      placeholder="Nota..."
                      aria-label={`Etiqueta para el pesaje del periodo ${run.period}`}
                      className="h-7 text-xs"
                    />
                    <div className="flex gap-1">
                      {run.status === "completed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={downloadingId === run.run_id}
                          onClick={() => handleDownload(run)}
                          title="Descargar CSV"
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

      <WeightingDetailModal
        run={selectedRun}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  )
}

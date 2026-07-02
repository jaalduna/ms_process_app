import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
import { Download, Eye, Loader2, FileText, Star } from "lucide-react"
import { downloadCalibrationReport, getEvent, patchEvent } from "@/lib/api"
import { LiveDuration, parseUTC } from "@/lib/duration"
import { useCalibrationHistory } from "../hooks/useCalibrationHistory"
import { CalibrationDetailModal } from "./CalibrationDetailModal"
import type { EventSummary, JobStatus } from "@/types/api"

interface CalibrationHistoryModalProps {
  country: string
  countryLabel: string
  countryFlag: string
  open: boolean
  onClose: () => void
}

function formatDate(isoDate: string): string {
  const d = new Date(parseUTC(isoDate))
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

interface StatusBadgeConfig {
  className: string
  label: string
}

function getStatusConfig(status: JobStatus): StatusBadgeConfig {
  switch (status) {
    case "completed":
      return { className: "bg-success/15 text-success border-success/30", label: "Completed" }
    case "failed":
      return { className: "bg-destructive/10 text-destructive border-destructive/30", label: "Failed" }
    case "cancelled":
      return { className: "bg-muted text-muted-foreground", label: "Cancelled" }
    case "running":
      return { className: "bg-info/15 text-info border-info/30", label: "Running" }
    case "pending":
      return { className: "bg-warning/15 text-warning border-warning/30", label: "Pending" }
    default:
      return { className: "bg-muted text-muted-foreground", label: status }
  }
}

const GRID = "grid grid-cols-[minmax(28px,auto)_minmax(64px,auto)_minmax(80px,auto)_minmax(110px,auto)_minmax(48px,auto)_minmax(0,1fr)_minmax(100px,auto)_auto] gap-2"

export function CalibrationHistoryModal({
  country,
  countryLabel,
  countryFlag,
  open,
  onClose,
}: CalibrationHistoryModalProps) {
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [detailJobId, setDetailJobId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({})
  const { data, isLoading, isError } = useCalibrationHistory(country, open)
  const queryClient = useQueryClient()

  const patchMutation = useMutation({
    mutationFn: ({ jobId, patch }: { jobId: string; patch: { is_final?: boolean; label?: string } }) =>
      patchEvent(jobId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calibration-history", country] })
    },
    onError: () => {
      toast.error("No se pudo actualizar la corrida")
    },
  })

  function handleToggleFinal(event: EventSummary) {
    patchMutation.mutate({ jobId: event.job_id, patch: { is_final: !event.is_final } })
  }

  function handleLabelBlur(event: EventSummary) {
    const draft = labelDrafts[event.job_id]
    if (draft === undefined || draft === (event.label ?? "")) return
    patchMutation.mutate({ jobId: event.job_id, patch: { label: draft } })
  }

  // The history list returns EventSummary; the detail modal needs the full
  // EventDetail, so fetch it on demand when a row's eye is clicked.
  const { data: detailJob } = useQuery({
    queryKey: ["event", detailJobId],
    queryFn: () => getEvent(detailJobId!),
    enabled: !!detailJobId && detailOpen,
  })

  function handleViewDetail(jobId: string) {
    setDetailJobId(jobId)
    setDetailOpen(true)
  }

  async function handleDownload(event: EventSummary) {
    if (!event.tag) {
      toast.error("No hay resultado descargable para esta calibracion")
      return
    }
    setDownloadingIds((prev) => new Set(prev).add(event.job_id))
    try {
      // Real download: streams the result zip from the Databricks Volume via
      // GET /calibration/{tag}/download. Calibration produces a single zip
      // report per run, so there is no per-table picker.
      await downloadCalibrationReport(event.tag, country)
      toast.success("Resultados descargados")
    } catch {
      toast.error("Error al descargar los resultados")
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(event.job_id)
        return next
      })
    }
  }

  const items = data?.items ?? []

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {countryFlag && <span>{countryFlag}</span>}
              <span>Historial de Calibracion - {countryLabel}</span>
            </DialogTitle>
            <DialogDescription>
              Todas las calibraciones para {countryLabel}. Descarga los resultados de las completadas.
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
            <p className="text-sm text-muted-foreground py-4">No hay calibraciones registradas.</p>
          )}

          {!isLoading && !isError && items.length > 0 && (
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

              {items.map((event) => {
                const statusConfig = getStatusConfig(event.status)
                const isCompleted = event.status === "completed"
                const isDownloading = downloadingIds.has(event.job_id)

                return (
                  <div key={event.job_id} className="rounded">
                    <div className={`${GRID} items-center px-2 py-1.5 text-xs hover:bg-muted/50`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={patchMutation.isPending}
                        onClick={() => handleToggleFinal(event)}
                        aria-label={event.is_final ? "Quitar marca de final" : "Marcar como final"}
                        aria-pressed={!!event.is_final}
                        title={event.is_final ? "Corrida final" : "Marcar como final"}
                      >
                        <Star
                          className={`h-3.5 w-3.5 ${event.is_final ? "fill-warning text-warning" : "text-muted-foreground"}`}
                        />
                      </Button>
                      <span className="font-mono">{event.period ?? "-"}</span>
                      <Badge variant="outline" className={`${statusConfig.className} text-[10px] px-1.5 py-0 w-fit`}>
                        {statusConfig.label}
                      </Badge>
                      <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                      <span className="text-muted-foreground">
                        <LiveDuration start={event.started_at} end={event.completed_at} />
                      </span>
                      <span className="text-muted-foreground truncate">
                        {event.error
                          ? `Error: ${event.error}`
                          : `${event.total_rows_extracted.toLocaleString()} filas`}
                      </span>
                      <Input
                        value={labelDrafts[event.job_id] ?? event.label ?? ""}
                        onChange={(e) =>
                          setLabelDrafts((prev) => ({ ...prev, [event.job_id]: e.target.value }))
                        }
                        onBlur={() => handleLabelBlur(event)}
                        placeholder="Nota..."
                        aria-label={`Etiqueta para la calibracion de ${formatDate(event.created_at)}`}
                        className="h-7 text-xs"
                      />
                      <div className="flex gap-1">
                        {isCompleted && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={isDownloading}
                            onClick={() => handleDownload(event)}
                            aria-label={`Descargar resultados de ${formatDate(event.created_at)}`}
                            title="Descargar resultados"
                          >
                            {isDownloading ? (
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
                          onClick={() => handleViewDetail(event.job_id)}
                          title="Ver detalle"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {data && data.total > items.length && (
                <p className="text-xs text-muted-foreground text-center pt-3">
                  Mostrando {items.length} de {data.total} calibraciones
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <CalibrationDetailModal
        job={detailJob}
        open={detailOpen && !!detailJob}
        onClose={() => setDetailOpen(false)}
      />
    </>
  )
}

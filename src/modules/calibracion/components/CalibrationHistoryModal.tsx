import { useState, useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Download, Eye, Loader2, FileText } from "lucide-react"
import { downloadCSV, getEvent } from "@/lib/api"
import { useCalibrationHistory } from "../hooks/useCalibrationHistory"
import { useJobTables } from "../hooks/useJobTables"
import { CalibrationDetailModal } from "./CalibrationDetailModal"
import type { JobStatus, TableInfo } from "@/types/api"

interface CalibrationHistoryModalProps {
  country: string
  countryLabel: string
  countryFlag: string
  open: boolean
  onClose: () => void
}

function parseUTC(ts: string): number {
  return new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(ts) ? ts : ts + "Z").getTime()
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

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return "-"
  const s = parseUTC(start)
  const e = end ? parseUTC(end) : Date.now()
  const totalSeconds = Math.max(0, Math.round((e - s) / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60)
    const sec = totalSeconds % 60
    return `${m}m ${sec}s`
  }
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}h ${m}m`
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

const GRID = "grid grid-cols-[minmax(64px,auto)_minmax(80px,auto)_minmax(110px,auto)_minmax(48px,auto)_minmax(0,1fr)_auto] gap-2"

interface TablePickerProps {
  jobId: string
  onDownload: (jobId: string, table: string) => Promise<void>
  onCollapse: () => void
}

function TablePicker({ jobId, onDownload, onCollapse }: TablePickerProps) {
  const { data, isLoading, isError } = useJobTables(jobId)
  const [selectedTable, setSelectedTable] = useState<string>("")
  const [isDownloading, setIsDownloading] = useState(false)

  const tables: TableInfo[] = data?.tables ?? []

  // Auto-download when exactly 1 table, or show error when 0 tables
  useEffect(() => {
    if (isLoading || isError) return
    if (tables.length === 0) {
      toast.error("No tables available")
      onCollapse()
    } else if (tables.length === 1) {
      onDownload(jobId, tables[0].full_name).finally(onCollapse)
    }
  }, [isLoading, isError, tables.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // For 0 or 1 tables, the useEffect handles it -- don't render the picker
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/60 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Loading available tables...</span>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/60 text-xs">
        <span className="text-destructive">Failed to load tables</span>
        <button
          onClick={onCollapse}
          className="text-muted-foreground hover:text-foreground underline"
        >
          Cancel
        </button>
      </div>
    )
  }

  // 0 or 1 table: useEffect handles these, render nothing while it runs
  if (tables.length <= 1) return null

  async function handlePickerDownload() {
    if (!selectedTable) return
    setIsDownloading(true)
    try {
      await onDownload(jobId, selectedTable)
    } finally {
      setIsDownloading(false)
      onCollapse()
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/60">
      <span className="text-xs text-muted-foreground shrink-0">Table:</span>
      <Select value={selectedTable} onValueChange={setSelectedTable}>
        <SelectTrigger size="sm" className="h-7 text-xs min-w-[200px]">
          <SelectValue placeholder="Select a table..." />
        </SelectTrigger>
        <SelectContent>
          {tables.map((t) => (
            <SelectItem key={t.full_name} value={t.full_name} className="text-xs">
              {t.schema_name}.{t.table_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        className="h-7 text-xs px-3"
        disabled={!selectedTable || isDownloading}
        onClick={handlePickerDownload}
      >
        {isDownloading ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : (
          <Download className="h-3 w-3 mr-1" />
        )}
        Download
      </Button>
      <button
        onClick={onCollapse}
        className="text-xs text-muted-foreground hover:text-foreground ml-auto"
      >
        Cancel
      </button>
    </div>
  )
}

export function CalibrationHistoryModal({
  country,
  countryLabel,
  countryFlag,
  open,
  onClose,
}: CalibrationHistoryModalProps) {
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [detailJobId, setDetailJobId] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const { data, isLoading, isError } = useCalibrationHistory(country, open)

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

  function handleDownload(jobId: string) {
    // Toggle: second click on same row collapses the picker
    setExpandedJobId((prev) => (prev === jobId ? null : jobId))
  }

  async function actualDownload(jobId: string, table: string) {
    setDownloadingIds((prev) => new Set(prev).add(jobId))
    try {
      await downloadCSV(jobId, table)
      toast.success("CSV downloaded successfully")
    } catch {
      toast.error("Failed to download CSV")
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(jobId)
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
              Todas las calibraciones para {countryLabel}. Descarga CSV de las completadas.
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
                <span>Periodo</span>
                <span>Estado</span>
                <span>Fecha</span>
                <span>Duracion</span>
                <span>Resumen</span>
                <span>Acciones</span>
              </div>

              {items.map((event) => {
                const statusConfig = getStatusConfig(event.status)
                const isCompleted = event.status === "completed"
                const isDownloading = downloadingIds.has(event.job_id)

                return (
                  <div key={event.job_id} className="rounded">
                    <div className={`${GRID} items-center px-2 py-1.5 text-xs hover:bg-muted/50`}>
                      <span className="font-mono">{event.period ?? "-"}</span>
                      <Badge variant="outline" className={`${statusConfig.className} text-[10px] px-1.5 py-0 w-fit`}>
                        {statusConfig.label}
                      </Badge>
                      <span className="text-muted-foreground">{formatDate(event.created_at)}</span>
                      <span className="text-muted-foreground">
                        {formatDuration(event.started_at, event.completed_at)}
                      </span>
                      <span className="text-muted-foreground truncate">
                        {event.error
                          ? `Error: ${event.error}`
                          : `${event.total_rows_extracted.toLocaleString()} filas`}
                      </span>
                      <div className="flex gap-1">
                        {isCompleted && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            disabled={isDownloading}
                            onClick={() => handleDownload(event.job_id)}
                            aria-label={`Descargar CSV de ${formatDate(event.created_at)}`}
                            title="Descargar CSV"
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
                    {expandedJobId === event.job_id && (
                      <TablePicker
                        jobId={event.job_id}
                        onDownload={actualDownload}
                        onCollapse={() => setExpandedJobId(null)}
                      />
                    )}
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

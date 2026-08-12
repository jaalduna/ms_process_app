import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Loader2,
} from "lucide-react"
import { downloadWeightingCSV } from "@/lib/api"
import { cn } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { useNow } from "@/hooks/useNow"
import { useWeightingRuns } from "../hooks/useWeighting"
import { WeightingDetailModal } from "./WeightingDetailModal"
import { WEIGHTING_STATUS_CONFIG, WEIGHTING_ACTIVE_STATUSES } from "../types"
import { formatDuration } from "../format"
import type { WeightingRun } from "../types"

// Fetched once, filtered/sorted/paginated entirely client-side. The API
// defaults to limit=50 — ask for a high ceiling here so the client-side
// pager below reflects the true total instead of silently truncating.
const HISTORY_FETCH_LIMIT = 500

type SortKey = "created_at" | "country" | "period" | "created_by" | "duration" | "status"
type SortDir = "asc" | "desc"

const HISTORY_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "created_at", label: "Fecha" },
  { key: "country", label: "Pais" },
  { key: "period", label: "Periodo" },
  { key: "created_by", label: "Lanzado por" },
  { key: "duration", label: "Duracion" },
  { key: "status", label: "Estado" },
]

const PAGE_SIZES = [10, 25, 50] as const

/** Default order: active runs first, then most recent. */
function defaultOrder(a: WeightingRun, b: WeightingRun): number {
  const active = (r: WeightingRun) => (WEIGHTING_ACTIVE_STATUSES.includes(r.status) || r.status === "pending" ? 0 : 1)
  return active(a) - active(b) || b.created_at.localeCompare(a.created_at)
}

/**
 * Rich history table for the "Historial" tab — sortable columns, filters
 * (pais/estado/lanzado por/periodo), client-side pagination, inline CSV
 * download and a row-level detail view. Ported from wp-calibration-app's
 * "Historial del período" table (CalibrationRunPage.tsx), adapted to
 * pesaje's fields (created_by instead of triggered_by, no run_page_url —
 * the pesaje backend has no Databricks deep-link).
 */
export function WeightingHistoryPanel() {
  const { data: runs, isLoading } = useWeightingRuns(undefined, undefined, { limit: HISTORY_FETCH_LIMIT })
  const [countryFilter, setCountryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [createdByFilter, setCreatedByFilter] = useState("all")
  const [periodFilter, setPeriodFilter] = useState("all")
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  const [selectedRun, setSelectedRun] = useState<WeightingRun | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const allRuns = useMemo(() => runs ?? [], [runs])
  const anyActive = allRuns.some((r) => r.status === "pending" || WEIGHTING_ACTIVE_STATUSES.includes(r.status))
  // Tick every second while a run is active so open-ended durations advance
  // (React Query skips re-renders when a poll returns unchanged data).
  const now = useNow(anyActive)

  const countryOptions = useMemo(
    () =>
      [...new Set(allRuns.map((r) => r.country))].sort((a, b) =>
        (COUNTRY_LABELS[a] ?? a).localeCompare(COUNTRY_LABELS[b] ?? b),
      ),
    [allRuns],
  )
  const createdByOptions = useMemo(
    () => [...new Set(allRuns.map((r) => r.created_by).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b)),
    [allRuns],
  )
  const periodOptions = useMemo(
    () => [...new Set(allRuns.map((r) => r.period))].sort((a, b) => b - a),
    [allRuns],
  )

  function runDurationMs(r: WeightingRun): number {
    if (!r.started_at) return -1
    const start = new Date(r.started_at).getTime()
    const end = r.completed_at
      ? new Date(r.completed_at).getTime()
      : r.status === "running"
        ? now
        : start
    return end - start
  }

  const rows = useMemo(() => {
    const filtered = allRuns.filter((r) => {
      if (countryFilter !== "all" && r.country !== countryFilter) return false
      if (statusFilter !== "all" && r.status !== statusFilter) return false
      if (createdByFilter !== "all" && r.created_by !== createdByFilter) return false
      if (periodFilter !== "all" && String(r.period) !== periodFilter) return false
      return true
    })
    if (!sort) return [...filtered].sort(defaultOrder)
    const dir = sort.dir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "created_at":
          return dir * a.created_at.localeCompare(b.created_at)
        case "country":
          return dir * (COUNTRY_LABELS[a.country] ?? a.country).localeCompare(COUNTRY_LABELS[b.country] ?? b.country)
        case "period":
          return dir * (a.period - b.period)
        case "created_by":
          return dir * (a.created_by ?? "").localeCompare(b.created_by ?? "")
        case "duration":
          return dir * (runDurationMs(a) - runDurationMs(b))
        case "status":
          return dir * (WEIGHTING_STATUS_CONFIG[a.status]?.label ?? a.status).localeCompare(WEIGHTING_STATUS_CONFIG[b.status]?.label ?? b.status)
        default:
          return 0
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRuns, countryFilter, statusFilter, createdByFilter, periodFilter, sort, now])

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" }
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" }
    })
    setPage(1)
  }

  function handleCountryFilterChange(next: string) {
    setCountryFilter(next)
    setPage(1)
  }
  function handleStatusFilterChange(next: string) {
    setStatusFilter(next)
    setPage(1)
  }
  function handleCreatedByFilterChange(next: string) {
    setCreatedByFilter(next)
    setPage(1)
  }
  function handlePeriodFilterChange(next: string) {
    setPeriodFilter(next)
    setPage(1)
  }
  function handlePageSizeChange(next: string) {
    setPageSize(Number(next))
    setPage(1)
  }

  async function handleDownload(run: WeightingRun) {
    setDownloadingId(run.run_id)
    try {
      await downloadWeightingCSV(run.run_id)
    } catch {
      toast.error("Error al descargar CSV")
    } finally {
      setDownloadingId(null)
    }
  }

  function openDetail(run: WeightingRun) {
    setSelectedRun(run)
    setDetailOpen(true)
  }

  // Derived from page/pageSize/rows.length on every render (not stored) so a
  // shrinking result set — e.g. a poll returning fewer rows while on a now
  // out-of-range page — self-corrects instead of needing an effect to clamp it.
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const paginatedRows = rows.slice(pageStart, pageStart + pageSize)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (allRuns.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No hay ejecuciones registradas.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Select value={countryFilter} onValueChange={handleCountryFilterChange}>
          <SelectTrigger size="sm" className="w-[150px] text-xs" aria-label="Filtrar por pais">
            <SelectValue placeholder="Pais" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los paises</SelectItem>
            {countryOptions.map((code) => (
              <SelectItem key={code} value={code}>
                {COUNTRY_FLAGS[code] ?? ""} {COUNTRY_LABELS[code] ?? code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger size="sm" className="w-[140px] text-xs" aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {Object.entries(WEIGHTING_STATUS_CONFIG).map(([status, { label }]) => (
              <SelectItem key={status} value={status}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={periodFilter} onValueChange={handlePeriodFilterChange}>
          <SelectTrigger size="sm" className="w-[130px] text-xs" aria-label="Filtrar por periodo">
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los periodos</SelectItem>
            {periodOptions.map((p) => (
              <SelectItem key={p} value={String(p)}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={createdByFilter} onValueChange={handleCreatedByFilterChange}>
          <SelectTrigger size="sm" className="w-[160px] text-xs" aria-label="Filtrar por quien lanzo">
            <SelectValue placeholder="Lanzado por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {createdByOptions.map((user) => (
              <SelectItem key={user} value={user}>
                {user}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger size="sm" className="w-[110px] text-xs" aria-label="Filas por pagina">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} / pagina
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto py-0">
        <Table>
          <TableHeader>
            <TableRow>
              {HISTORY_COLUMNS.map(({ key, label }) => {
                const active = sort?.key === key
                const SortIcon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown
                return (
                  <TableHead key={key}>
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {label}
                      <SortIcon className={cn("size-3", !active && "opacity-40")} />
                    </button>
                  </TableHead>
                )
              })}
              <TableHead className="w-16" aria-label="Acciones" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="whitespace-normal py-8 text-center text-sm text-muted-foreground">
                  Sin corridas que coincidan con los filtros
                </TableCell>
              </TableRow>
            )}
            {paginatedRows.map((run) => {
              const statusConfig = WEIGHTING_STATUS_CONFIG[run.status]
              const label = COUNTRY_LABELS[run.country] ?? run.country
              const isCompleted = run.status === "completed"
              return (
                <TableRow key={run.run_id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(run)}>
                  <TableCell className="font-mono text-xs">
                    {new Date(run.created_at).toLocaleString("es-CL", { hour12: false })}
                  </TableCell>
                  <TableCell>
                    {COUNTRY_FLAGS[run.country] ?? ""} {label}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{run.period}</TableCell>
                  <TableCell className="text-muted-foreground">{run.created_by ?? "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{formatDuration(run.started_at, run.completed_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusConfig.variant} className={statusConfig.className}>
                      {statusConfig.label}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {isCompleted && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={downloadingId === run.run_id}
                          onClick={() => handleDownload(run)}
                          aria-label={`Descargar resultados de ${label} periodo ${run.period}`}
                          title="Descargar resultados"
                        >
                          {downloadingId === run.run_id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Download className="size-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => openDetail(run)}
                        aria-label={`Ver detalle de ${label} periodo ${run.period}`}
                        title="Ver detalle"
                      >
                        <Eye className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {rows.length === 0
              ? "0 de 0"
              : `${pageStart + 1}–${Math.min(pageStart + pageSize, rows.length)} de ${rows.length}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              <ChevronLeft className="size-3.5" /> Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
              Siguiente <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      <WeightingDetailModal run={selectedRun} open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  )
}

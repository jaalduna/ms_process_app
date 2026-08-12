import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PeriodSelector } from "@/components/PeriodSelector"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react"
import { downloadCalibrationReport } from "@/lib/api"
import { cn } from "@/lib/utils"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { useCountries } from "@/hooks/useCountries"
import { useNow } from "@/hooks/useNow"
import { useCalibrationBoard } from "../hooks/useCalibrationBoard"
import { useAuth } from "@/hooks/useAuth"
import { getPermissions } from "@/lib/permissions"
import { ExecutionLaunchPanel } from "../components/ExecutionLaunchPanel"
import { ExecutionRunCard } from "../components/ExecutionRunCard"
import { HistoryRunDetailModal } from "../components/HistoryRunDetailModal"
import { formatDuration } from "../format"
import type { EventSummary } from "@/types/api"

function currentPeriod(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, "0")}`
}

const HIST_STATUS: Record<string, { label: string; className: string }> = {
  completed: { label: "Completado", className: "bg-emerald-500/15 text-emerald-500" },
  failed: { label: "Error", className: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Cancelado", className: "bg-muted text-muted-foreground" },
  running: { label: "Ejecutando", className: "bg-blue-500/15 text-blue-500" },
  pending: { label: "En cola", className: "bg-muted text-muted-foreground" },
}

type HistorySortKey = "created_at" | "country" | "triggered_by" | "duration" | "status"
type SortDir = "asc" | "desc"

const HISTORY_COLUMNS: { key: HistorySortKey; label: string }[] = [
  { key: "created_at", label: "Fecha" },
  { key: "country", label: "País" },
  { key: "triggered_by", label: "Lanzado por" },
  { key: "duration", label: "Duración" },
  { key: "status", label: "Estado" },
]

const HISTORY_PAGE_SIZES = [10, 25, 50] as const

/** Default order: active runs first, then created_at desc (same as the run cards above). */
function defaultHistoryOrder(a: EventSummary, b: EventSummary): number {
  const active = (r: EventSummary) => (r.status === "running" || r.status === "pending" ? 0 : 1)
  return active(a) - active(b) || b.created_at.localeCompare(a.created_at)
}

/** Execution board (mockup v6 "▶ Ejecución" view): launch calibration for
 * several countries at once and monitor every run of the period in one place.
 * Complements the per-country view at /calibration — same server state. */
export function CalibrationRunPage() {
  const [period, setPeriod] = useState(currentPeriod)
  // Igual que en CalibrationPage: el rol se lee acá y baja por props.
  const { roles } = useAuth()
  const { canTriggerCalibration: canTriggerByRole } = getPermissions(roles)
  const { data: countriesData, isLoading: countriesLoading } = useCountries()
  const board = useCalibrationBoard(period)
  const [retryingCountry, setRetryingCountry] = useState<string | null>(null)
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [historyCountryFilter, setHistoryCountryFilter] = useState("all")
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all")
  const [historyTriggeredByFilter, setHistoryTriggeredByFilter] = useState("all")
  const [historySort, setHistorySort] = useState<{ key: HistorySortKey; dir: SortDir } | null>(null)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState<number>(HISTORY_PAGE_SIZES[0])
  const [selectedRunJobId, setSelectedRunJobId] = useState<string | null>(null)
  const anyActive = board.runs.some((r) => r.status === "pending" || r.status === "running")
  // Tick de 1 s para que las duraciones de filas activas del historial avancen
  // (React Query no re-renderiza si el payload del poll no cambió).
  const now = useNow(anyActive)

  async function handleHistoryDownload(run: EventSummary) {
    setDownloadingIds((prev) => new Set(prev).add(run.job_id))
    try {
      await downloadCalibrationReport(run.tag, run.country)
    } catch {
      toast.error("Error al descargar los resultados")
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(run.job_id)
        return next
      })
    }
  }

  const countries = (countriesData?.countries ?? []).filter((c) => c.type === "country")

  async function handleLaunch(
    codes: string[],
    overrides: { skip_sync: boolean; j_source?: string },
  ) {
    const results = await board.launch(codes, overrides)
    for (const { country, result } of results) {
      const label = COUNTRY_LABELS[country] ?? country
      if (result.status === "fulfilled") toast.success(`Calibración lanzada para ${label}`)
      else toast.error(`No se pudo lanzar ${label}: ${(result.reason as Error).message}`)
    }
  }

  async function handleRetry(run: EventSummary) {
    setRetryingCountry(run.country)
    try {
      await handleLaunch([run.country], { skip_sync: false })
    } finally {
      setRetryingCountry(null)
    }
  }

  // Cards only for runs that need attention or action (pending/running to
  // monitor, failed to retry). Completed/cancelled runs don't get a card —
  // they live in the history table below (with badge + download) so the
  // board doesn't fill up with cards for corridas ya cerradas.
  const latestRuns = [...board.latestByCountry.values()]
    .filter((r) => r.status === "pending" || r.status === "running" || r.status === "failed")
    .sort(defaultHistoryOrder)

  const historyCountries = useMemo(
    () =>
      [...new Set(board.runs.map((r) => r.country))].sort((a, b) =>
        (COUNTRY_LABELS[a] ?? a).localeCompare(COUNTRY_LABELS[b] ?? b),
      ),
    [board.runs],
  )

  const historyTriggeredBy = useMemo(
    () => [...new Set(board.runs.map((r) => r.triggered_by))].sort((a, b) => a.localeCompare(b)),
    [board.runs],
  )

  function runDurationMs(r: EventSummary): number {
    const end = r.completed_at
      ? new Date(r.completed_at).getTime()
      : r.status === "pending" || r.status === "running"
        ? now
        : new Date(r.created_at).getTime()
    return end - new Date(r.created_at).getTime()
  }

  const historyRows = useMemo(() => {
    const filtered = board.runs.filter((r) => {
      if (historyCountryFilter !== "all" && r.country !== historyCountryFilter) return false
      if (historyStatusFilter !== "all" && r.status !== historyStatusFilter) return false
      if (historyTriggeredByFilter !== "all" && r.triggered_by !== historyTriggeredByFilter) return false
      return true
    })
    if (!historySort) return [...filtered].sort(defaultHistoryOrder)
    const dir = historySort.dir === "asc" ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (historySort.key) {
        case "created_at":
          return dir * a.created_at.localeCompare(b.created_at)
        case "country":
          return dir * (COUNTRY_LABELS[a.country] ?? a.country).localeCompare(COUNTRY_LABELS[b.country] ?? b.country)
        case "triggered_by":
          return dir * a.triggered_by.localeCompare(b.triggered_by)
        case "duration":
          return dir * (runDurationMs(a) - runDurationMs(b))
        case "status":
          return dir * (HIST_STATUS[a.status]?.label ?? a.status).localeCompare(HIST_STATUS[b.status]?.label ?? b.status)
        default:
          return 0
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.runs, historyCountryFilter, historyStatusFilter, historyTriggeredByFilter, historySort, now])

  function toggleHistorySort(key: HistorySortKey) {
    setHistorySort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" }
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" }
    })
    setHistoryPage(1)
  }

  // Any change to what historyRows contains/how it's ordered should land the
  // user back on page 1 — set directly from each handler (no effect needed,
  // avoids the reset-loop a useEffect watching historyRows would risk).
  function handlePeriodChange(next: string) {
    setPeriod(next)
    setHistoryPage(1)
  }
  function handleHistoryCountryFilterChange(next: string) {
    setHistoryCountryFilter(next)
    setHistoryPage(1)
  }
  function handleHistoryStatusFilterChange(next: string) {
    setHistoryStatusFilter(next)
    setHistoryPage(1)
  }
  function handleHistoryTriggeredByFilterChange(next: string) {
    setHistoryTriggeredByFilter(next)
    setHistoryPage(1)
  }
  function handleHistoryPageSizeChange(next: string) {
    setHistoryPageSize(Number(next))
    setHistoryPage(1)
  }

  // Re-resolved from board.runs on every render (not a snapshot) so a fresh
  // poll updates the open modal instead of freezing on the click-time data.
  const selectedRun = board.runs.find((r) => r.job_id === selectedRunJobId)

  // Derived (not stored) so a shrinking result set — e.g. a poll returning
  // fewer runs while on a now out-of-range page — self-corrects on render
  // instead of needing an effect to clamp historyPage.
  const historyTotalPages = Math.max(1, Math.ceil(historyRows.length / historyPageSize))
  const historyCurrentPage = Math.min(historyPage, historyTotalPages)
  const historyPageStart = (historyCurrentPage - 1) * historyPageSize
  const paginatedHistoryRows = historyRows.slice(historyPageStart, historyPageStart + historyPageSize)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Calibración · Ejecución</h1>
          <p className="text-sm text-muted-foreground">
            Lanza la calibración de varios países y monitorea las corridas del período
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector value={period} onChange={handlePeriodChange} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <div>
          {countriesLoading ? (
            <Skeleton className="h-96 rounded-xl" />
          ) : (
            <ExecutionLaunchPanel
              canTriggerByRole={canTriggerByRole}
              countries={countries}
              period={period}
              launching={board.launching}
              runningCountries={
                new Set(
                  board.runs
                    .filter((r) => r.status === "pending" || r.status === "running")
                    .map((r) => r.country),
                )
              }
              onLaunch={handleLaunch}
            />
          )}
        </div>

        <div className="space-y-5">
          {board.isLoading && <Skeleton className="h-40 rounded-xl" />}

          {!board.isLoading && latestRuns.length === 0 && board.runs.length === 0 && (
            <Card className="flex flex-col items-center justify-center gap-1 py-12 text-sm text-muted-foreground">
              <span className="text-2xl">🛰️</span>
              No hay corridas para este período.
              <span>Selecciona países a la izquierda y lanza el proceso.</span>
            </Card>
          )}

          {!board.isLoading && latestRuns.length === 0 && board.runs.length > 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              Sin corridas activas — revisa el historial abajo.
            </p>
          )}

          {latestRuns.map((run) => (
            <ExecutionRunCard
              key={run.job_id}
              run={run}
              onCancel={board.cancelRun}
              onRetry={handleRetry}
              cancelling={board.cancelling}
              retrying={retryingCountry === run.country}
            />
          ))}

          {board.runs.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Historial del período</h2>
                <div className="flex items-center gap-2">
                  <Select value={historyCountryFilter} onValueChange={handleHistoryCountryFilterChange}>
                    <SelectTrigger size="sm" className="w-[160px] text-xs" aria-label="Filtrar por país">
                      <SelectValue placeholder="País" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los países</SelectItem>
                      {historyCountries.map((code) => (
                        <SelectItem key={code} value={code}>
                          {COUNTRY_FLAGS[code] ?? ""} {COUNTRY_LABELS[code] ?? code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={historyStatusFilter} onValueChange={handleHistoryStatusFilterChange}>
                    <SelectTrigger size="sm" className="w-[140px] text-xs" aria-label="Filtrar por estado">
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      {Object.entries(HIST_STATUS).map(([status, { label }]) => (
                        <SelectItem key={status} value={status}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={historyTriggeredByFilter} onValueChange={handleHistoryTriggeredByFilterChange}>
                    <SelectTrigger size="sm" className="w-[160px] text-xs" aria-label="Filtrar por quién lanzó">
                      <SelectValue placeholder="Lanzado por" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {historyTriggeredBy.map((user) => (
                        <SelectItem key={user} value={user}>
                          {user}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={String(historyPageSize)} onValueChange={handleHistoryPageSizeChange}>
                    <SelectTrigger size="sm" className="w-[110px] text-xs" aria-label="Filas por página">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HISTORY_PAGE_SIZES.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} / página
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Card className="overflow-x-auto py-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {HISTORY_COLUMNS.map(({ key, label }) => {
                        const active = historySort?.key === key
                        const SortIcon = !active
                          ? ArrowUpDown
                          : historySort!.dir === "asc"
                            ? ArrowUp
                            : ArrowDown
                        return (
                          <TableHead key={key}>
                            <button
                              type="button"
                              onClick={() => toggleHistorySort(key)}
                              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                            >
                              {label}
                              <SortIcon className={cn("size-3", !active && "opacity-40")} />
                            </button>
                          </TableHead>
                        )
                      })}
                      <TableHead className="w-12" aria-label="Acciones" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="whitespace-normal py-8 text-center text-sm text-muted-foreground">
                          Sin corridas que coincidan con los filtros
                        </TableCell>
                      </TableRow>
                    )}
                    {paginatedHistoryRows.map((r) => {
                      const st = HIST_STATUS[r.status] ?? HIST_STATUS.pending
                      const label = COUNTRY_LABELS[r.country] ?? r.country
                      return (
                        <TableRow
                          key={r.job_id}
                          className="cursor-pointer hover:bg-muted/50"
                          role="button"
                          tabIndex={0}
                          aria-label={`Ver detalle de la corrida de ${label} ${r.tag}`}
                          onClick={() => setSelectedRunJobId(r.job_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault()
                              setSelectedRunJobId(r.job_id)
                            }
                          }}
                        >
                          <TableCell className="font-mono text-xs">
                            {new Date(r.created_at).toLocaleString("es-CL", { hour12: false })}
                          </TableCell>
                          <TableCell>
                            {COUNTRY_FLAGS[r.country] ?? ""} {label}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{r.triggered_by}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {formatDuration(
                              r.created_at,
                              r.completed_at ??
                                (r.status === "pending" || r.status === "running"
                                  ? new Date(now).toISOString()
                                  : null),
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("border-transparent", st.className)}>
                              {st.label}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {r.status === "completed" && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7"
                                disabled={downloadingIds.has(r.job_id)}
                                onClick={() => handleHistoryDownload(r)}
                                aria-label={`Descargar resultados de ${label} ${r.tag}`}
                                title="Descargar resultados"
                              >
                                {downloadingIds.has(r.job_id) ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Download className="size-3.5" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </Card>

              {historyTotalPages > 1 && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {historyRows.length === 0
                      ? "0 de 0"
                      : `${historyPageStart + 1}–${Math.min(historyPageStart + historyPageSize, historyRows.length)} de ${historyRows.length}`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyCurrentPage <= 1}
                      onClick={() => setHistoryPage(historyCurrentPage - 1)}
                    >
                      <ChevronLeft className="size-3.5" /> Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={historyCurrentPage >= historyTotalPages}
                      onClick={() => setHistoryPage(historyCurrentPage + 1)}
                    >
                      Siguiente <ChevronRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <HistoryRunDetailModal
        run={selectedRun}
        open={selectedRunJobId !== null}
        onClose={() => setSelectedRunJobId(null)}
        onDownload={handleHistoryDownload}
        downloading={selectedRunJobId !== null && downloadingIds.has(selectedRunJobId)}
      />
    </div>
  )
}

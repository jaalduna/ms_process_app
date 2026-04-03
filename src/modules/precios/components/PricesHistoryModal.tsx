import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { FileText, Clock, Calendar } from "lucide-react"
import { usePricesHistory } from "../hooks/usePricesHistory"
import { PRICES_STATUS_CONFIG } from "../types"
import type { PricesRun } from "../types"

interface PricesHistoryModalProps {
  country: string
  countryLabel: string
  countryFlag: string
  open: boolean
  onClose: () => void
}

function parseUTC(ts: string): number {
  return new Date(ts.endsWith("Z") ? ts : ts + "Z").getTime()
}

function formatDate(isoDate: string): string {
  const d = new Date(parseUTC(isoDate))
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
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

function HistoryEntrySkeleton() {
  return (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="space-y-2 flex-1 min-w-0">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  )
}

function HistoryEntry({ run }: { run: PricesRun }) {
  const statusConfig = PRICES_STATUS_CONFIG[run.status]
  const dateStr = formatDate(run.created_at)
  const duration = formatDuration(run.started_at ?? null, run.completed_at ?? null)

  return (
    <div className="flex items-center justify-between py-3 px-1 group">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          <span>Period: <span className="font-mono font-medium text-foreground">{run.period}</span></span>
          {run.outliers_count != null && run.outliers_count > 0 && (
            <span className="ml-2">{run.outliers_count} outliers</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0 ml-4">
        <Badge
          variant={statusConfig.variant}
          className={`text-xs px-2 py-0.5 ${statusConfig.className}`}
        >
          {statusConfig.label}
        </Badge>
        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[50px] justify-end">
          <Clock className="h-3 w-3 shrink-0" />
          <span>{duration}</span>
        </div>
      </div>
    </div>
  )
}

export function PricesHistoryModal({ country, countryLabel, countryFlag, open, onClose }: PricesHistoryModalProps) {
  const { data, isLoading, isError } = usePricesHistory(country, open)
  const items = data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {countryFlag && <span>{countryFlag}</span>}
            <span>{countryLabel}</span>
            <span className="text-muted-foreground font-normal">-- Price Validation History</span>
          </DialogTitle>
          <DialogDescription>
            Past price validation runs for {countryLabel}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {isLoading && (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <HistoryEntrySkeleton key={i} />
              ))}
            </div>
          )}

          {!isLoading && isError && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-destructive/40 mb-3" />
              <p className="text-sm font-medium text-destructive">Failed to load validation history</p>
              <p className="text-xs text-muted-foreground mt-1">
                Please try again later or check your connection.
              </p>
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No validations found for this country</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Validation history will appear here once runs have been triggered.
              </p>
            </div>
          )}

          {!isLoading && !isError && items.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground mb-3">
                Showing {items.length} most recent validation{items.length !== 1 ? "s" : ""}
              </div>
              <div className="divide-y divide-border rounded-lg border">
                {items.map((run, idx) => (
                  <div key={run.run_id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/40"}>
                    <div className="px-3">
                      <HistoryEntry run={run} />
                    </div>
                  </div>
                ))}
              </div>

              {data && data.total > items.length && (
                <>
                  <Separator className="mt-4" />
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Showing {items.length} of {data.total} total validations
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

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
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Download, FileText, Clock, Calendar, Loader2 } from "lucide-react"
import { useQmsTrHistory } from "../hooks/useQmsTr"
import { QMSTR_STATUS_CONFIG } from "../types"
import type { QmsTrRun } from "../types"
import { downloadQmsTrTag } from "@/lib/api"
import { LiveDuration, parseUTC } from "@/lib/duration"

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

function HistoryEntrySkeleton() {
  return (
    <div className="flex items-center justify-between py-3 px-1">
      <div className="space-y-2 flex-1 min-w-0">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
    </div>
  )
}

interface HistoryEntryProps {
  run: QmsTrRun
  isDownloading: boolean
  onDownload: (run: QmsTrRun) => void
}

function HistoryEntry({ run, isDownloading, onDownload }: HistoryEntryProps) {
  const statusConfig = QMSTR_STATUS_CONFIG[run.status]
  const isCompleted = run.status === "completed"
  const canDownload = isCompleted && !!run.tag
  const dateStr = formatDate(run.created_at)

  return (
    <div className="flex items-center justify-between py-3 px-1 group">
      {/* Left: date, year */}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" />
          <span>Year: <span className="font-mono font-medium text-foreground">{run.ano_base}</span></span>
        </div>
      </div>

      {/* Right: status badge, duration, download */}
      <div className="flex items-center gap-3 shrink-0 ml-4">
        <Badge variant={statusConfig.variant} className={`text-xs px-2 py-0.5 ${statusConfig.className}`}>
          {statusConfig.label}
        </Badge>

        <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[50px] justify-end">
          <Clock className="h-3 w-3 shrink-0" />
          <LiveDuration start={run.started_at} end={run.completed_at} />
        </div>

        <Button
          size="sm"
          variant={canDownload ? "default" : "ghost"}
          className={`h-8 w-8 p-0 ${!canDownload ? "opacity-30 cursor-not-allowed" : ""}`}
          disabled={!canDownload || isDownloading}
          aria-label={`Download result for ${dateStr}`}
          onClick={() => onDownload(run)}
          title={canDownload ? "Download" : "Download only available for completed runs"}
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}

interface MtrHistoryModalProps {
  country: string
  countryLabel: string
  countryFlag: string
  open: boolean
  onClose: () => void
}

export function MtrHistoryModal({
  country,
  countryLabel,
  countryFlag,
  open,
  onClose,
}: MtrHistoryModalProps) {
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const { data, isLoading, isError } = useQmsTrHistory(country, open)

  async function handleDownload(run: QmsTrRun) {
    if (!run.tag) return
    setDownloadingIds((prev) => new Set(prev).add(run.job_id))
    try {
      await downloadQmsTrTag(run.tag)
      toast.success("Download started")
    } catch {
      toast.error("Failed to download")
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev)
        next.delete(run.job_id)
        return next
      })
    }
  }

  const items = data?.items ?? []

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {countryFlag && <span>{countryFlag}</span>}
            <span>{countryLabel}</span>
            <span className="text-muted-foreground font-normal">&mdash; QMS-TR History</span>
          </DialogTitle>
          <DialogDescription>
            Past QMS-TR runs for {countryLabel}. Download results for completed runs.
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
              <p className="text-sm font-medium text-destructive">Failed to load QMS-TR history</p>
              <p className="text-xs text-muted-foreground mt-1">
                Please try again later or check your connection.
              </p>
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No QMS-TR runs found for this country</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                QMS-TR history will appear here once runs have been triggered.
              </p>
            </div>
          )}

          {!isLoading && !isError && items.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground mb-3">
                Showing {items.length} most recent QMS-TR run{items.length !== 1 ? "s" : ""}
              </div>
              <div className="divide-y divide-border rounded-lg border">
                {items.map((run, idx) => (
                  <div key={run.job_id} className={`px-3 ${idx % 2 === 0 ? "bg-background" : "bg-muted/40"}`}>
                    <HistoryEntry
                      run={run}
                      isDownloading={downloadingIds.has(run.job_id)}
                      onDownload={handleDownload}
                    />
                  </div>
                ))}
              </div>

              {data && data.total > items.length && (
                <>
                  <Separator className="mt-4" />
                  <p className="text-xs text-muted-foreground text-center mt-3">
                    Showing {items.length} of {data.total} total QMS-TR runs
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

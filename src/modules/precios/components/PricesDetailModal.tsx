import { useState, useMemo, useCallback } from "react"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { CheckCircle2, Download, Loader2, ArrowUpDown } from "lucide-react"
import { PricesProgress } from "./PricesProgress"
import { useApprovePrices } from "../hooks/usePrices"
import { PRICES_STATUS_CONFIG } from "../types"
import { downloadOutliersCSV } from "../outliersCsv"
import type { PricesRun, PricesOutlier } from "../types"

const COUNTRY_LABELS: Record<string, string> = {
  argentina: "Argentina",
  bolivia: "Bolivia",
  brasil: "Brasil",
  brazil: "Brazil",
  cam: "CAM",
  chile: "Chile",
  colombia: "Colombia",
  ecuador: "Ecuador",
  mexico: "Mexico",
  peru: "Peru",
}

function parseUTC(ts: string): number {
  return new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(ts) ? ts : ts + "Z").getTime()
}

function formatDate(isoDate: string): string {
  const d = new Date(parseUTC(isoDate))
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

type SortField = keyof PricesOutlier
type SortDir = "asc" | "desc"

interface PricesDetailModalProps {
  run: PricesRun | null
  open: boolean
  onClose: () => void
}

export function PricesDetailModal({ run, open, onClose }: PricesDetailModalProps) {
  const [sortField, setSortField] = useState<SortField>("deviation_pct")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const approve = useApprovePrices()

  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- pre-existing, preserving behavior
  const sortedOutliers = useMemo(() => {
    if (!run?.outliers) return []
    return [...run.outliers].sort((a, b) => {
      const av = a[sortField]
      const bv = b[sortField]
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av
      }
      const as = String(av)
      const bs = String(bv)
      return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as)
    })
  }, [run?.outliers, sortField, sortDir])

  const handleSort = useCallback((field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("desc")
    }
  }, [sortField])

  const handleApprove = useCallback(async () => {
    if (!run) return
    try {
      await approve.mutateAsync(run.run_id)
      toast.success("Validation approved")
    } catch {
      toast.error("Failed to approve validation")
    }
  }, [approve, run])

  const handleDownloadCSV = useCallback(() => {
    if (!run) return
    if (downloadOutliersCSV(run)) toast.success("CSV downloaded")
  }, [run])

  if (!run) return null

  const statusConfig = PRICES_STATUS_CONFIG[run.status]
  const hasOutliers = run.outliers && run.outliers.length > 0
  const canApprove = run.status === "results_ready"
  const isApproving = approve.isPending

  const columns: { field: SortField; label: string; align?: string }[] = [
    { field: "product", label: "Product" },
    { field: "declared_price", label: "Declared Price", align: "right" },
    { field: "historical_avg", label: "Historical Avg", align: "right" },
    { field: "deviation_pct", label: "Deviation %", align: "right" },
    { field: "reason", label: "Reason" },
    { field: "household_id", label: "Household" },
  ]

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Price Validation Detail
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            {COUNTRY_LABELS[run.country] ?? run.country} - Period {run.period}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Started</span>
              <p className="font-medium">{run.started_at ? formatDate(run.started_at) : "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Completed</span>
              <p className="font-medium">{run.completed_at ? formatDate(run.completed_at) : "-"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Outliers Found</span>
              <p className="font-medium">{run.outliers_count ?? 0}</p>
            </div>
            {run.approved_by && (
              <div>
                <span className="text-muted-foreground">Approved By</span>
                <p className="font-medium">{run.approved_by}</p>
              </div>
            )}
          </div>

          {/* Pipeline Progress */}
          {run.steps && run.steps.length > 0 && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Pipeline Steps</span>
                <div className="mt-2">
                  <PricesProgress run={run} />
                </div>
              </div>
            </>
          )}

          {/* Error */}
          {run.error_message && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Error</span>
                <p className="mt-1 rounded bg-destructive/10 p-2 text-xs text-destructive font-mono">
                  {run.error_message}
                </p>
              </div>
            </>
          )}

          {/* Outlier Table */}
          {(run.status === "results_ready" || run.status === "approved") && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Outlier Results</span>
                {hasOutliers ? (
                  <div className="mt-2 rounded-lg border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {columns.map((col) => (
                            <th
                              key={col.field}
                              className={`px-3 py-2 font-medium cursor-pointer hover:bg-muted select-none ${col.align === "right" ? "text-right" : "text-left"}`}
                              onClick={() => handleSort(col.field)}
                            >
                              <span className="inline-flex items-center gap-1">
                                {col.label}
                                <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedOutliers.map((o, i) => (
                          <tr key={`${o.household_id}-${i}`} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                            <td className="px-3 py-1.5">{o.product}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{o.declared_price.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{o.historical_avg.toLocaleString()}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{o.deviation_pct}%</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{o.reason}</td>
                            <td className="px-3 py-1.5 font-mono">{o.household_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <span>No outliers detected. All prices are within expected ranges.</span>
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Action buttons */}
          <div className="flex gap-2">
            {canApprove && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="flex-1" disabled={isApproving}>
                    {isApproving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {isApproving ? "Approving..." : "Approve"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Approve Validation</AlertDialogTitle>
                    <AlertDialogDescription>
                      Approve the price validation results for <strong>{COUNTRY_LABELS[run.country] ?? run.country}</strong> period <strong>{run.period}</strong>?
                      {hasOutliers && ` This includes ${run.outliers_count} flagged outliers.`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApprove}>Approve</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Button
              variant="outline"
              disabled={!hasOutliers}
              onClick={handleDownloadCSV}
              title={hasOutliers ? "Download outlier results as CSV" : "No outlier data to export"}
            >
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Download,
  Loader2,
  RefreshCcw,
  XCircle,
} from "lucide-react"
import { QmsTrProgress } from "./QmsTrProgress"
import { useQmsTrRun, useCreateQmsTrRun } from "../hooks/useQmsTr"
import { QMSTR_ACTIVE_STATUSES, QMSTR_STATUS_CONFIG } from "../types"
import type { QmsTrStep } from "../types"
import { downloadQmsTrTag } from "@/lib/api"
import { COUNTRY_LABELS } from "@/lib/countries"
import { LiveDuration, parseUTC } from "@/lib/duration"

function stepLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
    case "running":
      return <Loader2 className="h-4 w-4 text-info animate-spin shrink-0" />
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive shrink-0" />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
  }
}

interface StepRowProps {
  step: QmsTrStep
  expanded: boolean
  onToggle: () => void
  hasDetails: boolean
  children?: React.ReactNode
}

function StepRow({ step, expanded, onToggle, hasDetails, children }: StepRowProps) {
  const label = stepLabel(step.name)

  return (
    <div>
      <button
        type="button"
        onClick={hasDetails ? onToggle : undefined}
        className={`flex items-center justify-between rounded px-2 py-1.5 text-xs w-full text-left ${
          hasDetails ? "cursor-pointer hover:ring-1 hover:ring-ring/30" : "cursor-default"
        } ${
          step.status === "failed"
            ? "bg-destructive/10"
            : step.status === "running"
              ? "bg-info/10"
              : "bg-muted/50"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <StepIcon status={step.status} />
          <span className="font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {step.status !== "pending" && (
            <span className="text-muted-foreground">
              <LiveDuration start={step.started_at} end={step.completed_at} />
            </span>
          )}
          <Badge
            variant={
              step.status === "completed"
                ? "default"
                : step.status === "failed"
                  ? "destructive"
                  : step.status === "running"
                    ? "secondary"
                    : "outline"
            }
            className="text-[10px] px-1.5 py-0"
          >
            {step.status}
          </Badge>
        </div>
      </button>
      {expanded && children}
    </div>
  )
}

interface QmsTrDetailModalProps {
  jobId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QmsTrDetailModal({ jobId, open, onOpenChange }: QmsTrDetailModalProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: run } = useQmsTrRun(open ? jobId : null)
  const createRun = useCreateQmsTrRun()

  if (!run) return null

  const steps = run.steps ?? []
  const statusConfig = QMSTR_STATUS_CONFIG[run.status]
  const countryLabel = COUNTRY_LABELS[run.country] ?? run.country
  const isProcessing = QMSTR_ACTIVE_STATUSES.includes(run.status)
  const isCompleted = run.status === "completed"
  const isFailed = run.status === "failed"
  const canDownload = isCompleted && !!run.tag

  function toggleStep(stepName: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepName)) next.delete(stepName)
      else next.add(stepName)
      return next
    })
  }

  const handleRetry = () => {
    createRun.mutate(
      {
        country: run.country,
        ano_base: run.ano_base,
      },
      {
        onSuccess: () => {
          toast.success(`Retry started for ${countryLabel}`)
          onOpenChange(false)
        },
        onError: () => toast.error(`Failed to create retry job for ${countryLabel}`),
      },
    )
  }

  const handleDownload = async () => {
    if (!run.tag) return
    setIsDownloading(true)
    try {
      await downloadQmsTrTag(run.tag)
      toast.success("Download started")
    } catch {
      toast.error("Download failed")
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            QMS-TR Detail
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Pipeline details and step progress.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Country</span>
              <p className="font-medium">{countryLabel}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Year</span>
              <p className="font-medium font-mono text-xs">{run.ano_base}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Started</span>
              <p className="font-medium">
                {run.started_at ? new Date(parseUTC(run.started_at)).toLocaleString() : "-"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="font-medium">
                <LiveDuration start={run.started_at} end={run.completed_at} />
              </p>
            </div>
          </div>

          {/* Pipeline steps */}
          {steps.length > 0 && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Pipeline</span>
                <div className="mt-2">
                  <QmsTrProgress steps={steps} />
                </div>
                <div className="mt-3 space-y-1">
                  {steps.map((step) => {
                    const isExpanded = expandedSteps.has(step.name)
                    const hasDetails = step.started_at != null

                    return (
                      <StepRow
                        key={step.name}
                        step={step}
                        expanded={isExpanded}
                        onToggle={() => toggleStep(step.name)}
                        hasDetails={hasDetails}
                      >
                        {step.started_at && (
                          <div className="ml-6 mt-1 border-l-2 border-muted pl-2 pb-1">
                            <div className="text-[11px] text-muted-foreground px-2 py-0.5">
                              <span>Started: {new Date(parseUTC(step.started_at)).toLocaleTimeString()}</span>
                              {step.completed_at && (
                                <span className="ml-3">
                                  Finished: {new Date(parseUTC(step.completed_at)).toLocaleTimeString()}
                                </span>
                              )}
                            </div>
                            {step.error && (
                              <div className="rounded bg-destructive/10 p-1.5 mt-1">
                                <p className="text-destructive font-mono text-[10px]">{step.error}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </StepRow>
                    )
                  })}
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
        </div>

        {/* Action buttons */}
        <DialogFooter className="gap-2 sm:gap-0">
          {/* Retry on failure */}
          {isFailed && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={createRun.isPending}>
                  {createRun.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Retry QMS-TR</AlertDialogTitle>
                  <AlertDialogDescription>
                    Create a new QMS-TR job for{" "}
                    <strong>{countryLabel}</strong> year <strong>{run.ano_base}</strong>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRetry}>Retry</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Download result */}
          {canDownload && (
            <Button
              variant="outline"
              disabled={isDownloading}
              onClick={handleDownload}
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download
            </Button>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

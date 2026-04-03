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
import { MtrProgress } from "./MtrProgress"
import { useMtrRun, useCreateMtrRun, useExecuteMtr, useCancelMtr } from "../hooks/useMtr"
import { MTR_STEPS, MTR_STEP_LABELS, MTR_ACTIVE_STATUSES, MTR_STATUS_CONFIG } from "../types"
import type { MtrStep } from "../types"
import { downloadMtrCsv } from "../utils/downloadMtrCsv"

const COUNTRY_LABELS: Record<string, string> = {
  argentina: "Argentina",
  bolivia: "Bolivia",
  brasil: "Brasil",
  brazil: "Brasil",
  cam: "CAM",
  chile: "Chile",
  colombia: "Colombia",
  ecuador: "Ecuador",
  mexico: "Mexico",
  peru: "Peru",
}

function parseUTC(ts: string): number {
  return new Date(ts).getTime()
}

function formatDuration(start?: string | null, end?: string | null): string {
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
  const sec = totalSeconds % 60
  return `${h}h ${m}m ${sec}s`
}

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
    case "running":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin shrink-0" />
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive shrink-0" />
    default:
      return <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
  }
}

interface StepRowProps {
  step: MtrStep
  expanded: boolean
  onToggle: () => void
  hasDetails: boolean
  children?: React.ReactNode
}

function StepRow({ step, expanded, onToggle, hasDetails, children }: StepRowProps) {
  const label = MTR_STEP_LABELS[step.name] ?? step.name
  const duration = formatDuration(step.started_at, step.completed_at)

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
              ? "bg-blue-500/10"
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
            <span className="text-muted-foreground">{duration}</span>
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

interface MtrDetailModalProps {
  runId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MtrDetailModal({ runId, open, onOpenChange }: MtrDetailModalProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: run } = useMtrRun(open ? runId : null)
  const createRun = useCreateMtrRun()
  const executeRun = useExecuteMtr()
  const cancelRunMutation = useCancelMtr()

  if (!run) return null

  const steps = run.steps ?? []
  const statusConfig = MTR_STATUS_CONFIG[run.status]
  const countryLabel = COUNTRY_LABELS[run.country] ?? run.country
  const isProcessing = MTR_ACTIVE_STATUSES.includes(run.status)
  const canCancel = run.status === "running" || run.status === "pending"
  const isCompleted = run.status === "completed"
  const isFailed = run.status === "failed"
  const hasResults = isCompleted && run.results_summary != null

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
        period: run.period,
        parameters: run.parameters_json,
      },
      {
        onSuccess: (newRun) => {
          executeRun.mutate(newRun.run_id, {
            onSuccess: () => {
              toast.success(`Retry started for ${countryLabel}`)
              onOpenChange(false)
            },
            onError: () => toast.error(`Failed to execute retry for ${countryLabel}`),
          })
        },
        onError: () => toast.error(`Failed to create retry run for ${countryLabel}`),
      },
    )
  }

  const handleCancel = () => {
    cancelRunMutation.mutate(run.run_id, {
      onSuccess: () => toast.info(`MTR cancelled for ${countryLabel}`),
      onError: () => toast.error(`Failed to cancel MTR for ${countryLabel}`),
    })
  }

  const handleDownload = () => {
    setIsDownloading(true)
    try {
      downloadMtrCsv(run)
      toast.success("CSV downloaded")
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
            MTR Detail
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Pipeline details, step progress, and imputation results.
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
              <span className="text-muted-foreground">Period</span>
              <p className="font-medium font-mono text-xs">{run.period}</p>
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
                {formatDuration(run.started_at, run.completed_at)}
              </p>
            </div>
          </div>

          {/* Parameters */}
          {run.parameters_json && Object.keys(run.parameters_json).length > 0 && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Parameters</span>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(run.parameters_json).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-xs gap-2">
                      <span className="text-muted-foreground font-mono truncate">{key}</span>
                      <span className="font-medium font-mono">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Pipeline steps */}
          {steps.length > 0 && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Pipeline</span>
                <div className="mt-2">
                  <MtrProgress steps={steps} currentStep={run.current_step} />
                </div>
                <div className="mt-3 space-y-1">
                  {MTR_STEPS.map((stepName) => {
                    const step = steps.find((s) => s.name === stepName)
                    if (!step) return null
                    const isExpanded = expandedSteps.has(stepName)
                    const hasDetails = step.started_at != null

                    return (
                      <StepRow
                        key={stepName}
                        step={step}
                        expanded={isExpanded}
                        onToggle={() => toggleStep(stepName)}
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

          {/* Results summary */}
          {isCompleted && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Imputation Results</span>
                {hasResults ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Total Targets</p>
                      <p className="text-lg font-bold">{run.results_summary!.total_targets}</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Targets Achieved</p>
                      <p className="text-lg font-bold text-green-600">
                        {run.results_summary!.targets_achieved}
                        <span className="text-xs font-normal text-muted-foreground ml-1">
                          ({run.results_summary!.total_targets > 0
                            ? (run.results_summary!.targets_achieved / run.results_summary!.total_targets * 100).toFixed(1)
                            : 0}%)
                        </span>
                      </p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Total Imputations</p>
                      <p className="text-lg font-bold">{run.results_summary!.total_imputations.toLocaleString()}</p>
                    </div>
                    {run.results_summary!.quality_score != null && (
                      <div className="rounded bg-muted/50 p-2">
                        <p className="text-xs text-muted-foreground">Quality Score</p>
                        <p className="text-lg font-bold">
                          {(run.results_summary!.quality_score * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground italic">
                    Results unavailable
                  </p>
                )}
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
                <Button variant="outline" disabled={createRun.isPending || executeRun.isPending}>
                  {(createRun.isPending || executeRun.isPending) && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Retry MTR</AlertDialogTitle>
                  <AlertDialogDescription>
                    Create a new MTR run for{" "}
                    <strong>{countryLabel}</strong> period <strong>{run.period}</strong> with the same parameters?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRetry}>Retry</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Download CSV */}
          {hasResults && (
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
              Download CSV
            </Button>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </Button>
          )}

          {/* Cancel */}
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={cancelRunMutation.isPending}>
                  {cancelRunMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel MTR</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cancel the MTR pipeline for{" "}
                    <strong>{countryLabel}</strong> period <strong>{run.period}</strong>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Running</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleCancel}
                  >
                    Cancel
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

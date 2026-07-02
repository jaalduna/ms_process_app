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
import { Formato4Progress } from "./Formato4Progress"
import {
  useFormato4Run,
  useCreateFormato4Run,
  useExecuteFormato4,
  useCancelFormato4,
} from "../hooks/useFormato4"
import { downloadFormato4 } from "@/lib/api"
import {
  FORMATO4_STEPS,
  FORMATO4_STEP_LABELS,
  FORMATO4_ACTIVE_STATUSES,
  FORMATO4_STATUS_CONFIG,
} from "../types"
import type { Formato4Step } from "../types"
import { COUNTRY_LABELS } from "@/lib/countries"
import { LiveDuration, parseUTC } from "@/lib/duration"

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
  step: Formato4Step
  expanded: boolean
  onToggle: () => void
  hasDetails: boolean
  children?: React.ReactNode
}

function StepRow({ step, expanded, onToggle, hasDetails, children }: StepRowProps) {
  const label = FORMATO4_STEP_LABELS[step.name] ?? step.name

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

interface Formato4DetailModalProps {
  runId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Detail modal for a Formato 4 run. Clone of
 * `src/modules/mtr/components/MtrDetailModal.tsx` (MTR-33) driven by
 * `useFormato4Run` so steps update live while the modal is open. Formato 4 has
 * no parameters (retry re-creates with `{country, period}`), its results grid
 * mirrors the writer's `_metadata.json` (row_count / sim wheel version /
 * generated_at), and the download streams the SERVER-generated zip via
 * `downloadFormato4` (MTR-32), not a client-built CSV.
 */
export function Formato4DetailModal({ runId, open, onOpenChange }: Formato4DetailModalProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: run } = useFormato4Run(open ? runId : null)
  const createRun = useCreateFormato4Run()
  const executeRun = useExecuteFormato4()
  const cancelRunMutation = useCancelFormato4()

  if (!run) return null

  const steps = run.steps ?? []
  const statusConfig = FORMATO4_STATUS_CONFIG[run.status]
  const countryLabel = COUNTRY_LABELS[run.country] ?? run.country
  const isProcessing = FORMATO4_ACTIVE_STATUSES.includes(run.status)
  const canCancel = run.status === "running" || run.status === "pending"
  const isCompleted = run.status === "completed"
  const isFailed = run.status === "failed"
  const summary = run.results_summary
  const hasResults = isCompleted && summary != null

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
      onSuccess: () => toast.info(`Formato 4 cancelled for ${countryLabel}`),
      onError: () => toast.error(`Failed to cancel Formato 4 for ${countryLabel}`),
    })
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      // Server-generated zip by runId (MTR-32) — mirrors the weighting
      // download, NOT a client-side CSV builder.
      await downloadFormato4(run.run_id, run.country)
      toast.success(`Formato 4 zip downloaded for ${countryLabel}`)
    } catch {
      toast.error(`Failed to download Formato 4 zip for ${countryLabel}`)
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Formato 4 Detail
            <Badge variant={statusConfig.variant} className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Pipeline details, step progress, and generated output.
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
                  {/* Error is surfaced in the dedicated Error section below
                      (and per-step in the rows), so the progress bar is not
                      given `error` to avoid duplicating the message. */}
                  <Formato4Progress steps={steps} currentStep={run.current_step} />
                </div>
                <div className="mt-3 space-y-1">
                  {FORMATO4_STEPS.map((stepName) => {
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
                <span className="text-muted-foreground">Generated Output</span>
                {hasResults ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Row Count</p>
                      <p className="text-lg font-bold">{summary!.row_count.toLocaleString()}</p>
                    </div>
                    <div className="rounded bg-muted/50 p-2">
                      <p className="text-xs text-muted-foreground">Sim Wheel Version</p>
                      <p className="text-sm font-bold font-mono">
                        {summary!.sim_wheel_version ?? "-"}
                      </p>
                    </div>
                    {summary!.generated_at && (
                      <div className="rounded bg-muted/50 p-2 col-span-2">
                        <p className="text-xs text-muted-foreground">Generated At</p>
                        <p className="text-sm font-medium">
                          {new Date(parseUTC(summary!.generated_at)).toLocaleString()}
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
                  <AlertDialogTitle>Retry Formato 4</AlertDialogTitle>
                  <AlertDialogDescription>
                    Create a new Formato 4 run for{" "}
                    <strong>{countryLabel}</strong> period <strong>{run.period}</strong>?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRetry}>Retry</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Download server-generated zip */}
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
              Descargar
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
                  <AlertDialogTitle>Cancel Formato 4</AlertDialogTitle>
                  <AlertDialogDescription>
                    Cancel the Formato 4 pipeline for{" "}
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

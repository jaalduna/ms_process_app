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
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Download, Loader2, XCircle } from "lucide-react"
import { downloadCalibrationReport } from "@/lib/api"
import type { EventDetail } from "@/types/api"
import type { CalibrationStep } from "../types"
import { stepLabel } from "../types"

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

interface CalibrationDetailModalProps {
  job: EventDetail | undefined
  open: boolean
  onClose: () => void
}

function statusVariant(status: string) {
  switch (status) {
    case "completed":
      return "default" as const
    case "failed":
      return "destructive" as const
    case "running":
      return "secondary" as const
    default:
      return "outline" as const
  }
}

function parseUTC(ts: string): number {
  // Backend sends ISO 8601 timestamps that may already carry a timezone
  // (e.g. "+00:00" or "Z") or none at all. Only assume UTC by appending "Z"
  // when there is no timezone designator — otherwise the string is valid as-is.
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(ts)
  return new Date(hasTz ? ts : ts + "Z").getTime()
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
  const sec = totalSeconds % 60
  return `${h}h ${m}m ${sec}s`
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
  step: CalibrationStep
  expanded: boolean
  onToggle: () => void
  hasDetails: boolean
  children?: React.ReactNode
}

function StepRow({ step, expanded, onToggle, hasDetails, children }: StepRowProps) {
  const label = stepLabel(step.name)
  const duration = formatDuration(step.started_at, step.completed_at)

  return (
    <div>
      <button
        type="button"
        onClick={hasDetails ? onToggle : undefined}
        className={`flex items-center justify-between rounded px-2 py-1.5 text-xs w-full text-left ${
          hasDetails ? "cursor-pointer hover:ring-1 hover:ring-ring/30" : "cursor-default"
        } ${
          step.status === "failed" ? "bg-destructive/10" : step.status === "running" ? "bg-info/10" : "bg-muted/50"
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
            variant={statusVariant(step.status)}
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

export function CalibrationDetailModal({ job, open, onClose }: CalibrationDetailModalProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)

  if (!job) return null

  const steps = job.steps
  const hasSteps = steps && steps.length > 0

  // Distinguish catalog-promotion failures (000 → 001) from calculation failures.
  // The user needs to know which side of the pipeline broke.
  const copyStep = steps?.find((s) => s.name === "copy_to_calibration")
  const copyFailed = copyStep?.status === "failed"

  function toggleStep(stepName: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(stepName)) {
        next.delete(stepName)
      } else {
        next.add(stepName)
      }
      return next
    })
  }

  function stepHasDetails(_stepName: string, step: CalibrationStep): boolean {
    if (step.tasks && step.tasks.length > 0) return true
    if (step.error) return true
    if (step.started_at) return true
    return false
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Calibration Detail
            <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
          </DialogTitle>
          <DialogDescription>
            Details for the calibration job including pipeline steps and query results.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted-foreground">Country</span>
              <p className="font-medium">{COUNTRY_LABELS[job.country] ?? job.country}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Tag</span>
              <p className="font-medium font-mono text-xs">{job.tag}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Started</span>
              <p className="font-medium">
                {job.started_at ? new Date(parseUTC(job.started_at)).toLocaleString() : "-"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Completed</span>
              <p className="font-medium">
                {job.completed_at ? new Date(parseUTC(job.completed_at)).toLocaleString() : "-"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Duration</span>
              <p className="font-medium">
                {formatDuration(job.started_at, job.completed_at)}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Queries</span>
              <p className="font-medium">
                {job.queries_completed}/{job.queries_total}
                {job.queries_failed > 0 && (
                  <span className="text-destructive ml-1">
                    ({job.queries_failed} failed)
                  </span>
                )}
              </p>
            </div>
          </div>

          {copyFailed && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Catalog Promotion</span>
                <div className="mt-1 rounded bg-destructive/10 p-2 text-xs text-destructive">
                  <p className="font-medium">Failed to promote data to calibration catalog (000 → 001).</p>
                  {copyStep?.error && (
                    <p className="font-mono text-[10px] mt-1">{copyStep.error}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Pipeline Steps */}
          {hasSteps && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Pipeline Steps</span>
                <div className="mt-2 space-y-1">
                  {steps.map((step) => {
                    const hasDetails = stepHasDetails(step.name, step)
                    const isExpanded = expandedSteps.has(step.name)

                    return (
                      <StepRow
                        key={step.name}
                        step={step}
                        expanded={isExpanded}
                        onToggle={() => toggleStep(step.name)}
                        hasDetails={hasDetails}
                      >
                        <div className="ml-6 mt-1 space-y-1 border-l-2 border-muted pl-2 pb-1">
                          {/* Timing details for any started step */}
                          {step.started_at && (
                            <div className="text-[11px] text-muted-foreground px-2 py-0.5">
                              <span>Started: {new Date(parseUTC(step.started_at)).toLocaleTimeString()}</span>
                              {step.completed_at && (
                                <span className="ml-3">Finished: {new Date(parseUTC(step.completed_at)).toLocaleTimeString()}</span>
                              )}
                            </div>
                          )}

                          {/* Databricks task-level progress */}
                          {step.tasks && step.tasks.length > 0 && (
                            <>
                              {step.tasks.map((t) => (
                                <div
                                  key={t.task_key}
                                  className={`flex items-center justify-between rounded px-2 py-1 text-[11px] ${
                                    t.status === "failed" ? "bg-destructive/5" : "bg-transparent"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <StepIcon status={t.status} />
                                    <span className="font-mono truncate">{t.task_key}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-2 text-muted-foreground">
                                    {t.status !== "pending" && (
                                      <span>{formatDuration(t.started_at, t.completed_at)}</span>
                                    )}
                                    <Badge
                                      variant={statusVariant(t.status)}
                                      className="text-[9px] px-1 py-0"
                                    >
                                      {t.status}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                              {step.tasks.some((t) => t.error) && (
                                <div className="mt-1 space-y-0.5">
                                  {step.tasks.filter((t) => t.error).map((t) => (
                                    <div key={`${t.task_key}-error`} className="rounded bg-destructive/10 p-1.5">
                                      <span className="font-mono text-[10px]">{t.task_key}:</span>
                                      <p className="text-destructive font-mono text-[10px] mt-0.5">{t.error}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}

                          {/* Step error */}
                          {step.error && (
                            <div className="rounded bg-destructive/10 p-1.5">
                              <p className="text-destructive font-mono text-[10px]">{step.error}</p>
                            </div>
                          )}
                        </div>
                      </StepRow>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {job.error && (
            <>
              <Separator />
              <div>
                <span className="text-muted-foreground">Error</span>
                <p className="mt-1 rounded bg-destructive/10 p-2 text-xs text-destructive font-mono">
                  {job.error}
                </p>
              </div>
            </>
          )}

          <Separator />

          <Button
            variant="outline"
            className="w-full"
            disabled={isDownloading || job.status !== "completed"}
            onClick={async () => {
              setIsDownloading(true)
              try {
                await downloadCalibrationReport(job.tag, job.country)
                toast.success("Report downloaded")
              } catch {
                toast.error("Download failed — report may not be ready yet")
              } finally {
                setIsDownloading(false)
              }
            }}
          >
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isDownloading ? "Downloading..." : "Download Report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

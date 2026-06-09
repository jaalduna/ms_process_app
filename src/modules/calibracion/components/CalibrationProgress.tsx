import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import type { EventDetail } from "@/types/api"
import { stepLabel } from "../types"

interface CalibrationProgressProps {
  job: EventDetail
}

export function CalibrationProgress({ job }: CalibrationProgressProps) {
  // Steps are fully backend-driven: render whatever steps the job reports,
  // in backend order. The set/labels are not hardcoded by this UI.
  const visibleSteps = job.steps ?? []
  const hasSteps = visibleSteps.length > 0

  let percent: number
  let label: string

  if (hasSteps) {
    const total = visibleSteps.length
    const completed = visibleSteps.filter((s) => s.status === "completed").length
    percent = total > 0 ? Math.round((completed / total) * 100) : 0
    const currentStep = job.current_step
    if (currentStep) {
      // Show running Databricks task name if available
      const currentStepObj = visibleSteps.find((s) => s.name === currentStep)
      const runningTask = currentStepObj?.tasks?.find((t) => t.status === "running")
      if (runningTask) {
        label = `${stepLabel(currentStep)} — ${runningTask.task_key}`
      } else {
        label = stepLabel(currentStep)
      }
    } else {
      label = `${completed}/${total} steps`
    }
  } else {
    // Fallback to query-based progress
    percent = job.queries_total > 0 ? Math.round((job.queries_completed / job.queries_total) * 100) : 0
    label = `${job.queries_completed}/${job.queries_total} queries`
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-2" />

      {/* Step indicators */}
      {hasSteps && (
        <div className="flex items-center gap-0.5 pt-1">
          {visibleSteps.map((step) => (
            <StepDot key={step.name} status={step.status} label={stepLabel(step.name)} />
          ))}
        </div>
      )}
    </div>
  )
}

function StepDot({ status, label }: { status: string; label: string }) {
  return (
    <div className="flex flex-col items-center flex-1 min-w-0" title={label}>
      {status === "completed" && (
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
      )}
      {status === "running" && (
        <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
      )}
      {status === "failed" && (
        <XCircle className="h-3.5 w-3.5 text-destructive" />
      )}
      {status === "pending" && (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
      )}
    </div>
  )
}

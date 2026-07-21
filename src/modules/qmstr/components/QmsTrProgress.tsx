import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Loader2, MinusCircle, XCircle } from "lucide-react"
import { QMSTR_STEP_STATUS_LABELS } from "../types"
import type { QmsTrStep } from "../types"

function stepLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface QmsTrProgressProps {
  steps: QmsTrStep[]
}

export function QmsTrProgress({ steps }: QmsTrProgressProps) {
  const total = steps.length
  // "cancelled" at the step level means SKIPPED (JAA-1002's run_sync
  // sync-gate), a resolved/terminal state -- count it toward progress like
  // "completed" so a skip_sync=true run can still reach 100%.
  const done = steps.filter((s) => s.status === "completed" || s.status === "cancelled").length
  const percent = total > 0 ? Math.round((done / total) * 100) : 0

  const currentStep = steps.find((s) => s.status === "running")
  const label = currentStep ? stepLabel(currentStep.name) : `${done}/${total} steps`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-2" />

      <div className="flex items-center gap-0.5 pt-1">
        {steps.map((step) => (
          <StepDot key={step.name} status={step.status} label={stepLabel(step.name)} />
        ))}
      </div>
    </div>
  )
}

function StepDot({ status, label }: { status: string; label: string }) {
  const title = `${label} — ${QMSTR_STEP_STATUS_LABELS[status] ?? status}`
  return (
    <div className="flex flex-col items-center flex-1 min-w-0" title={title}>
      {status === "completed" && (
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
      )}
      {status === "running" && (
        <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />
      )}
      {status === "failed" && (
        <XCircle className="h-3.5 w-3.5 text-destructive" />
      )}
      {status === "cancelled" && (
        <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      {status !== "completed" && status !== "running" && status !== "failed" && status !== "cancelled" && (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
      )}
    </div>
  )
}

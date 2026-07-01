import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import { MTR_STEPS, MTR_STEP_LABELS } from "../types"
import type { MtrStep } from "../types"

interface MtrProgressProps {
  steps: MtrStep[]
  currentStep?: string
}

export function MtrProgress({ steps, currentStep }: MtrProgressProps) {
  const total = MTR_STEPS.length
  let completed = 0
  for (const s of steps) {
    if (s.status === "completed") {
      completed += 1
    }
  }
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  const label = currentStep
    ? (MTR_STEP_LABELS[currentStep as keyof typeof MTR_STEP_LABELS] ?? currentStep)
    : `${completed}/${total} steps`

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-2" />

      <div className="flex items-center gap-0.5 pt-1">
        {MTR_STEPS.map((stepName) => {
          const step = steps.find((s) => s.name === stepName)
          const status = step?.status ?? "pending"
          return (
            <StepDot key={stepName} status={status} label={MTR_STEP_LABELS[stepName]} />
          )
        })}
      </div>
    </div>
  )
}

function StepDot({ status, label }: { status: string; label: string }) {
  return (
    <div className="flex flex-col items-center flex-1 min-w-0" title={label}>
      {status === "completed" && (
        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
      )}
      {status === "running" && (
        <Loader2 className="h-3.5 w-3.5 text-info animate-spin" />
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

import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import { PRICES_STEPS, PRICES_STEP_LABELS } from "../types"
import type { PricesRun } from "../types"

interface PricesProgressProps {
  run: PricesRun
}

export function PricesProgress({ run }: PricesProgressProps) {
  const steps = run.steps
  const hasSteps = steps && steps.length > 0

  let percent: number
  let label: string

  if (hasSteps) {
    const total = steps.length
    const completed = steps.filter((s) => s.status === "completed").length
    percent = total > 0 ? Math.round((completed / total) * 100) : 0
    const currentStep = run.current_step
    if (currentStep) {
      label = PRICES_STEP_LABELS[currentStep as keyof typeof PRICES_STEP_LABELS] ?? currentStep
    } else {
      label = `${completed}/${total} steps`
    }
  } else {
    percent = 0
    label = run.status === "pending" ? "Waiting..." : "Processing..."
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
          {PRICES_STEPS.map((stepName) => {
            const step = steps.find((s) => s.name === stepName)
            const status = step?.status ?? "pending"
            return (
              <StepDot key={stepName} status={status} label={PRICES_STEP_LABELS[stepName]} />
            )
          })}
        </div>
      )}
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

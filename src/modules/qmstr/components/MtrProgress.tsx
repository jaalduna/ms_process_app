import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import type { QmsTrStep } from "../types"

function stepLabel(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

interface MtrProgressProps {
  steps: QmsTrStep[]
}

export function MtrProgress({ steps }: MtrProgressProps) {
  const total = steps.length
  const completed = steps.filter((s) => s.status === "completed").length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  const currentStep = steps.find((s) => s.status === "running")
  const label = currentStep ? stepLabel(currentStep.name) : `${completed}/${total} steps`

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
      {status !== "completed" && status !== "running" && status !== "failed" && (
        <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
      )}
    </div>
  )
}

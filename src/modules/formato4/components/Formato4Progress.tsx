import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react"
import { FORMATO4_STEPS, FORMATO4_STEP_LABELS } from "../types"
import type { Formato4Step } from "../types"

interface Formato4ProgressProps {
  steps: Formato4Step[]
  currentStep?: string
  /** Run-level error message (e.g. from `Formato4Run.error_message`). */
  error?: string | null
}

/**
 * Progress bar + step-dot row for a formato4 run. Clone of
 * `src/modules/mtr/components/MtrProgress.tsx` driven by the formato4 step list
 * (sync → merge → simulate → format_4 → zip). Dots reflect each step's state
 * and a failure surfaces an error message.
 */
export function Formato4Progress({ steps, currentStep, error }: Formato4ProgressProps) {
  const total = FORMATO4_STEPS.length
  let completed = 0
  for (const s of steps) {
    if (s.status === "completed") {
      completed += 1
    }
  }
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  const label = currentStep
    ? (FORMATO4_STEP_LABELS[currentStep as keyof typeof FORMATO4_STEP_LABELS] ?? currentStep)
    : `${completed}/${total} pasos`

  const failedStep = steps.find((s) => s.status === "failed")
  const errorMessage = error ?? failedStep?.error ?? (failedStep ? "El proceso falló." : null)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} className="h-2" />

      <div className="flex items-center gap-0.5 pt-1">
        {FORMATO4_STEPS.map((stepName) => {
          const step = steps.find((s) => s.name === stepName)
          const status = step?.status ?? "pending"
          return (
            <StepDot
              key={stepName}
              stepName={stepName}
              status={status}
              label={FORMATO4_STEP_LABELS[stepName]}
            />
          )
        })}
      </div>

      {errorMessage && (
        <p
          data-testid="formato4-progress-error"
          className="text-xs text-destructive"
        >
          {errorMessage}
        </p>
      )}
    </div>
  )
}

function StepDot({
  stepName,
  status,
  label,
}: {
  stepName: string
  status: string
  label: string
}) {
  return (
    <div
      className="flex flex-col items-center flex-1 min-w-0"
      title={label}
      data-testid="formato4-step-dot"
      data-step={stepName}
      data-status={status}
      aria-label={`${label}: ${status}`}
    >
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

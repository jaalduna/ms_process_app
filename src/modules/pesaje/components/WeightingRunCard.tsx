import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Eye } from "lucide-react"
import { useNow } from "@/hooks/useNow"
import { COUNTRY_FLAGS, COUNTRY_LABELS } from "@/lib/countries"
import { WeightingProgress } from "./WeightingProgress"
import { StopWeightingButton } from "./StopWeightingButton"
import { WEIGHTING_ACTIVE_STATUSES, WEIGHTING_STATUS_CONFIG } from "../types"
import { formatDuration } from "../format"
import type { WeightingRun } from "../types"

interface WeightingRunCardProps {
  run: WeightingRun
  onOpenDetail: (run: WeightingRun) => void
  onCancel: (runId: string) => void
  cancelling: boolean
}

/**
 * One country's "needs attention" run (pending/running/failed) on the
 * Ejecutar board. Adapted from wp-calibration-app's ExecutionRunCard, reusing
 * pesaje's own WeightingProgress for the step pipeline instead of porting a
 * second implementation.
 */
export function WeightingRunCard({ run, onOpenDetail, onCancel, cancelling }: WeightingRunCardProps) {
  const countryLabel = COUNTRY_LABELS[run.country] ?? run.country
  const flag = COUNTRY_FLAGS[run.country] ?? ""
  const statusConfig = WEIGHTING_STATUS_CONFIG[run.status]
  const isActive = run.status === "pending" || WEIGHTING_ACTIVE_STATUSES.includes(run.status)
  // Tick every second while active so the open-ended duration keeps advancing.
  const now = useNow(isActive)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg">{flag}</span>
          <span className="text-base font-semibold">{countryLabel}</span>
          <Badge variant={statusConfig.variant} className={statusConfig.className}>
            {statusConfig.label}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">{run.period}</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenDetail(run)}
              className="inline-flex items-center gap-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Ver detalle de ${countryLabel} periodo ${run.period}`}
              title="Ver detalle"
            >
              <Eye className="size-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {run.steps && run.steps.length > 0 && (
          <WeightingProgress steps={run.steps} currentStep={run.current_step} />
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="font-mono">
            {formatDuration(run.started_at, run.completed_at ?? (isActive ? new Date(now).toISOString() : null))}
          </span>
          {run.created_by && <span>por {run.created_by}</span>}
          {isActive && (
            <div className="ml-auto">
              <StopWeightingButton
                countryLabel={countryLabel}
                period={String(run.period)}
                disabled={cancelling}
                onConfirm={() => onCancel(run.run_id)}
              />
            </div>
          )}
        </div>

        {run.error_message && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            ⚠ {run.error_message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

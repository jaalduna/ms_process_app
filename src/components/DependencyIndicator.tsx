import { CheckCircle2, MinusCircle, HelpCircle } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { DependencyStatus, DepStatusValue } from "@/hooks/usePipelineDeps"
import { formatRelativeTime } from "@/lib/utils"

const STATUS_CONFIG: Record<DepStatusValue, {
  Icon: typeof CheckCircle2
  colorClass: string
  ariaLabel: (label: string, completedAt?: string) => string
  tooltipText: (label: string, completedAt?: string) => string | null
}> = {
  completed: {
    Icon: CheckCircle2,
    colorClass: "text-green-600",
    ariaLabel: (label, completedAt) =>
      `${label}: completed ${completedAt ? formatRelativeTime(completedAt) : ""}`,
    tooltipText: (_label, completedAt) =>
      completedAt ? new Date(completedAt).toLocaleString() : null,
  },
  not_run: {
    Icon: MinusCircle,
    colorClass: "text-muted-foreground",
    ariaLabel: (label) => `${label}: not yet run`,
    tooltipText: () => null,
  },
  unknown: {
    Icon: HelpCircle,
    colorClass: "text-muted-foreground",
    ariaLabel: (label) => `${label}: status unknown`,
    tooltipText: () => null,
  },
}

export interface DependencyIndicatorProps {
  dependencies: DependencyStatus[]
}

export function DependencyIndicator({ dependencies }: DependencyIndicatorProps) {
  if (dependencies.length === 0) return null

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1.5">
        {dependencies.map((dep) => {
          const config = STATUS_CONFIG[dep.status]
          const { Icon } = config
          const ariaLabel = config.ariaLabel(dep.label, dep.completed_at)
          const tooltip = config.tooltipText(dep.label, dep.completed_at)

          const pill = (
            <span
              key={dep.stage}
              className={`inline-flex items-center gap-1 text-xs ${config.colorClass}`}
              aria-label={ariaLabel}
              role="status"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{dep.label}</span>
            </span>
          )

          if (tooltip) {
            return (
              <Tooltip key={dep.stage}>
                <TooltipTrigger asChild>{pill}</TooltipTrigger>
                <TooltipContent>{tooltip}</TooltipContent>
              </Tooltip>
            )
          }

          return pill
        })}
      </div>
    </TooltipProvider>
  )
}

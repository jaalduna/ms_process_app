import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export interface WeightingParams {
  max_weight: number
  min_weight: number
  cv_threshold: number
  max_iterations: number
  trim_percentile: number
}

export const DEFAULT_WEIGHTING_PARAMS: WeightingParams = {
  max_weight: 500,
  min_weight: 10,
  cv_threshold: 0.05,
  max_iterations: 50,
  trim_percentile: 0.99,
}

const PARAM_META: Record<keyof WeightingParams, { label: string; unit: string; step?: string }> = {
  max_weight: { label: "Peso maximo permitido", unit: "factor" },
  min_weight: { label: "Peso minimo permitido", unit: "factor" },
  cv_threshold: { label: "Umbral CV para convergencia", unit: "ratio", step: "0.01" },
  max_iterations: { label: "Iteraciones maximas", unit: "iter" },
  trim_percentile: { label: "Percentil de recorte outliers", unit: "%", step: "0.01" },
}

interface WeightingConfigDialogProps {
  params: WeightingParams
  onChange: (params: WeightingParams) => void
}

export function WeightingConfigDialog({ params, onChange }: WeightingConfigDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Parametros de pesaje">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Parametros de Pesaje</DialogTitle>
          <DialogDescription>
            Modifica los parametros antes de ejecutar. Los valores se guardan con cada ejecucion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(Object.keys(PARAM_META) as (keyof WeightingParams)[]).map((key) => {
            const meta = PARAM_META[key]
            return (
              <label key={key} className="block space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{meta.label}</span>
                  <span className="text-[10px] text-muted-foreground/60 font-mono">{meta.unit}</span>
                </div>
                <Input
                  type="number"
                  step={meta.step ?? "1"}
                  min={0}
                  value={params[key]}
                  onChange={(e) =>
                    onChange({
                      ...params,
                      [key]: e.target.value ? parseFloat(e.target.value) : 0,
                    })
                  }
                  className="h-8 text-sm font-mono"
                />
              </label>
            )
          })}
        </div>

        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => onChange(DEFAULT_WEIGHTING_PARAMS)}
          >
            Restaurar valores por defecto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

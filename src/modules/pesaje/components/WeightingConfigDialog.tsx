import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DEFAULT_WEIGHTING_PARAMS,
  WEIGHTING_PARAM_FIELDS,
  type WeightingParams,
} from "../weightingParams"

// Re-export so existing imports (`../components/WeightingConfigDialog`) keep working.
export { DEFAULT_WEIGHTING_PARAMS }
export type { WeightingParams }

interface WeightingConfigDialogProps {
  params: WeightingParams
  onChange: (params: WeightingParams) => void
  /** When set, render a labeled button instead of the icon-only trigger. */
  triggerLabel?: string
}

export function WeightingConfigDialog({ params, onChange, triggerLabel }: WeightingConfigDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {triggerLabel ? (
          <Button variant="outline" size="sm" className="flex-1" aria-label={triggerLabel}>
            <Settings className="mr-2 h-3.5 w-3.5" />
            {triggerLabel}
          </Button>
        ) : (
          <Button variant="outline" size="icon" aria-label="Parametros de pesaje">
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Parametros de Pesaje</DialogTitle>
          <DialogDescription>
            Modifica los parametros antes de ejecutar. Los valores se guardan con cada ejecucion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {WEIGHTING_PARAM_FIELDS.map((field) => {
            const value = params[field.key]
            return (
              <div key={field.key} className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{field.label}</span>
                  <span className="text-[10px] text-muted-foreground/60 font-mono">{field.key}</span>
                </div>

                {field.control === "number" && (
                  <Input
                    type="number"
                    aria-label={field.label}
                    step={field.step ?? "1"}
                    min={field.min}
                    max={field.max}
                    value={value === null || value === undefined ? "" : String(value)}
                    onChange={(e) => {
                      const raw = e.target.value
                      const next = raw === "" ? (field.nullable ? null : 0) : parseFloat(raw)
                      onChange({ ...params, [field.key]: next })
                    }}
                    className="h-8 text-sm font-mono"
                  />
                )}

                {field.control === "switch" && (
                  <div className="flex h-8 items-center">
                    <Switch
                      aria-label={field.label}
                      checked={Boolean(value)}
                      onCheckedChange={(checked) =>
                        onChange({ ...params, [field.key]: checked })
                      }
                    />
                  </div>
                )}

                {field.control === "select" && (
                  <Select
                    value={String(value)}
                    onValueChange={(v) => onChange({ ...params, [field.key]: v })}
                  >
                    <SelectTrigger aria-label={field.label} className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {field.help && (
                  <p className="text-[10px] text-muted-foreground/60">{field.help}</p>
                )}
              </div>
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

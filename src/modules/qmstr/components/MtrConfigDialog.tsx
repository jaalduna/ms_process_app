import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import type { QmsTrParams } from "../types"
import { DEFAULT_QMSTR_PARAMS, QMSTR_PARAM_META } from "../types"

interface MtrConfigDialogProps {
  params: QmsTrParams
  onChange: (params: QmsTrParams) => void
}

export function MtrConfigDialog({ params, onChange }: MtrConfigDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="QMS-TR settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>QMS-TR Parameters</DialogTitle>
          <DialogDescription>
            Configure parameters applied to all QMS-TR runs. Values are saved with each execution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(Object.keys(QMSTR_PARAM_META) as (keyof QmsTrParams)[]).map((key) => {
            const meta = QMSTR_PARAM_META[key]
            return (
              <label key={key} className="block space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{meta.label}</span>
                  {meta.unit && (
                    <span className="text-[10px] text-muted-foreground/60 font-mono">{meta.unit}</span>
                  )}
                </div>
                {meta.type === "select" && meta.options ? (
                  <Select
                    value={String(params[key])}
                    onValueChange={(value) =>
                      onChange({ ...params, [key]: value })
                    }
                  >
                    <SelectTrigger className="h-8 text-sm font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {meta.options.map((opt) => (
                        <SelectItem key={opt} value={opt} className="text-sm font-mono">
                          {opt.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type="number"
                    step={meta.step ?? "1"}
                    min={0}
                    value={params[key] as number}
                    onChange={(e) =>
                      onChange({
                        ...params,
                        [key]: e.target.value ? parseFloat(e.target.value) : 0,
                      })
                    }
                    className="h-8 text-sm font-mono"
                  />
                )}
              </label>
            )
          })}
        </div>

        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => onChange(DEFAULT_QMSTR_PARAMS)}
          >
            Restore defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

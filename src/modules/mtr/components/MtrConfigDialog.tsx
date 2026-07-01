import { useState } from "react"
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
import type { MtrParams } from "../types"
import { DEFAULT_MTR_PARAMS, MTR_PARAM_META } from "../types"

interface MtrConfigDialogProps {
  /** Current shared defaults (hydrated from the backend). */
  params: MtrParams
  /** Whether the requester may edit/save (GET `editable`). Read-only otherwise. */
  editable: boolean
  /** Persist the edited params (PUT shared config). Only called when editable. */
  onSave: (params: MtrParams) => Promise<void> | void
  /** True while a save is in flight. */
  saving?: boolean
}

export function MtrConfigDialog({ params, editable, onSave, saving = false }: MtrConfigDialogProps) {
  const [open, setOpen] = useState(false)
  // Local draft so editing doesn't mutate the shared/hydrated value until saved.
  const [draft, setDraft] = useState<MtrParams>(params)

  // Re-seed the draft from the latest hydrated params whenever the dialog opens,
  // so a cancelled edit is discarded and a fresh GET is reflected.
  function handleOpenChange(next: boolean) {
    if (next) setDraft(params)
    setOpen(next)
  }

  async function handleSave() {
    await onSave(draft)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="MTR settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>MTR Parameters</DialogTitle>
          <DialogDescription>
            {editable
              ? "Configure shared defaults applied to all MTR runs for every user."
              : "Shared defaults applied to all MTR runs. Only an MTR admin can edit these."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {(Object.keys(MTR_PARAM_META) as (keyof MtrParams)[]).map((key) => {
            const meta = MTR_PARAM_META[key]
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
                    value={String(draft[key])}
                    disabled={!editable}
                    onValueChange={(value) =>
                      setDraft((d) => ({ ...d, [key]: value }))
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
                    disabled={!editable}
                    value={draft[key] as number}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [key]: e.target.value ? parseFloat(e.target.value) : 0,
                      }))
                    }
                    className="h-8 text-sm font-mono"
                  />
                )}
              </label>
            )
          })}
        </div>

        {editable && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setDraft(DEFAULT_MTR_PARAMS)}
            >
              Restore defaults
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

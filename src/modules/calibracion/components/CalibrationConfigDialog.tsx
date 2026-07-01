import { useState } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { CalibrationConfig } from "../types"
import { DEFAULT_CALIBRATION_CONFIG } from "../types"

interface CalibrationConfigDialogProps {
  /** Current shared defaults (hydrated from the backend). */
  config: CalibrationConfig
  /** Whether the requester may edit/save (GET `editable`). Read-only otherwise. */
  editable: boolean
  /** Persist the edited config (PUT shared config). Only called when editable. */
  onSave: (config: CalibrationConfig) => Promise<void> | void
  /** True while a save is in flight. */
  saving?: boolean
}

export function CalibrationConfigDialog({
  config,
  editable,
  onSave,
  saving = false,
}: CalibrationConfigDialogProps) {
  const [open, setOpen] = useState(false)
  // Local draft so editing doesn't mutate the shared/hydrated value until saved.
  const [draft, setDraft] = useState<CalibrationConfig>(config)

  // Re-seed the draft from the latest hydrated config whenever the dialog opens,
  // so a cancelled edit is discarded and a fresh GET is reflected.
  function handleOpenChange(next: boolean) {
    if (next) setDraft(config)
    setOpen(next)
  }

  async function handleSave() {
    await onSave(draft)
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Calibration settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Calibration Settings</DialogTitle>
          <DialogDescription>
            {editable
              ? "Configure shared defaults applied to all countries for every user."
              : "Shared defaults applied to all countries. Only a calibration admin can edit these."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Aggregation checkboxes */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Aggregations</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.aggregations.region}
                disabled={!editable}
                onCheckedChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    aggregations: { ...d.aggregations, region: v === true },
                  }))
                }
              />
              Region
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.aggregations.nivel_2}
                disabled={!editable}
                onCheckedChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    aggregations: { ...d.aggregations, nivel_2: v === true },
                  }))
                }
              />
              Canal
            </label>
          </fieldset>

          {/* Override parameters */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Overrides</legend>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Lookback months</span>
              <Input
                type="number"
                min={1}
                max={120}
                disabled={!editable}
                value={draft.lookback_months}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    lookback_months: e.target.value ? parseInt(e.target.value, 10) : 0,
                  }))
                }
                className="h-8 text-sm"
              />
            </label>
          </fieldset>
        </div>

        {editable && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setDraft(DEFAULT_CALIBRATION_CONFIG)}
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

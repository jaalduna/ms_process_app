import { useState } from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { PricesConfig } from "../types"
import { DEFAULT_PRICES_CONFIG } from "../types"

interface PricesConfigDialogProps {
  /** Current shared defaults (hydrated from the backend). */
  config: PricesConfig
  /** Whether the requester may edit/save (GET `editable`). Read-only otherwise. */
  editable: boolean
  /** Persist the edited config (PUT shared config). Only called when editable. */
  onSave: (config: PricesConfig) => Promise<void> | void
  /** True while a save is in flight. */
  saving?: boolean
}

/**
 * Prices settings dialog (JAA-646). Edits the shared prices process config and
 * persists it server-side via the JAA-642 process_config endpoints.
 *
 * The params are intentionally **dummy placeholders** — the dialog wires up the
 * full end-to-end path (hydrate from GET → edit → PUT shared config → role
 * gating) so only the field set has to change once the real params are defined.
 */
export function PricesConfigDialog({
  config,
  editable,
  onSave,
  saving = false,
}: PricesConfigDialogProps) {
  const [open, setOpen] = useState(false)
  // Local draft so editing doesn't mutate the shared/hydrated value until saved.
  const [draft, setDraft] = useState<PricesConfig>(config)

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
        <Button variant="outline" size="icon" aria-label="Prices settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Prices Settings</DialogTitle>
          <DialogDescription>
            {editable
              ? "Configure shared defaults applied to all countries for every user. These params are provisional placeholders."
              : "Shared defaults applied to all countries. Only a prices admin can edit these."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Placeholder param 1</span>
            <Input
              type="number"
              disabled={!editable}
              value={draft.placeholder_param_1}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  placeholder_param_1: e.target.value ? parseInt(e.target.value, 10) : 0,
                }))
              }
              className="h-8 text-sm"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Placeholder param 2</span>
            <Input
              type="text"
              disabled={!editable}
              value={draft.placeholder_param_2}
              onChange={(e) =>
                setDraft((d) => ({ ...d, placeholder_param_2: e.target.value }))
              }
              className="h-8 text-sm"
            />
          </label>

          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Notes</span>
            <Textarea
              disabled={!editable}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              className="text-sm"
            />
          </label>
        </div>

        {editable && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setDraft(DEFAULT_PRICES_CONFIG)}
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

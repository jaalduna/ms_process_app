import { useState } from "react"
import { SlidersHorizontal } from "lucide-react"
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

interface CountryGroupByDialogProps {
  countryLabel: string
  /** Effective group_by (persisted shared value or built-in default). */
  value: string | null
  /** Persist the per-country group_by (PUT shared config, scope=country). */
  onSave: (groupBy: string) => Promise<void> | void
  /** True while a save is in flight. */
  saving?: boolean
}

/**
 * Admin-only editor for a country's shared calibration `group_by` (JAA-667).
 * Rendered only when the requester may edit (GET `editable`); the resolved value
 * itself is shown to everyone in the Calibrar confirm dialog.
 */
export function CountryGroupByDialog({
  countryLabel,
  value,
  onSave,
  saving = false,
}: CountryGroupByDialogProps) {
  const [open, setOpen] = useState(false)
  // Local draft so editing doesn't touch the shared value until saved; re-seeded
  // from the latest resolved value each time the dialog opens.
  const [draft, setDraft] = useState(value ?? "")

  function handleOpenChange(next: boolean) {
    if (next) setDraft(value ?? "")
    setOpen(next)
  }

  async function handleSave() {
    await onSave(draft.trim())
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Group by settings for ${countryLabel}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Group by · {countryLabel}</DialogTitle>
          <DialogDescription>
            Agrupación compartida de calibración para este país (combinaciones de
            dimensiones separadas por «;»). Aplica para todos los usuarios.
          </DialogDescription>
        </DialogHeader>

        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">group_by</span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 font-mono text-sm"
            placeholder="IdProduto_Calib;IdProduto_Calib,Region"
          />
        </label>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={handleSave} disabled={saving || draft.trim() === ""}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

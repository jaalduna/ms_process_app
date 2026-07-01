import { LayoutGrid, List } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ViewMode } from "@/hooks/useViewMode"

interface ViewToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
}

/** Tarjetas / Lista toggle for country grids (JAA-763). */
export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="inline-flex rounded-md border p-0.5" role="group" aria-label="Cambiar vista">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={value === "cards"}
        className={cn("gap-1.5", value === "cards" && "bg-accent text-accent-foreground")}
        onClick={() => onChange("cards")}
      >
        <LayoutGrid className="h-4 w-4" />
        Tarjetas
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-pressed={value === "list"}
        className={cn("gap-1.5", value === "list" && "bg-accent text-accent-foreground")}
        onClick={() => onChange("list")}
      >
        <List className="h-4 w-4" />
        Lista
      </Button>
    </div>
  )
}

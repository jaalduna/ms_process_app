import { cn } from "@/lib/utils"
import type { PropsAjustes } from "../config"
import { IDPESOS } from "../idpesos"
import type { AjustesPesaje } from "../types"

export function SelectorIdPesos({ ajustes, onAjustes }: PropsAjustes) {
  const a = ajustes as AjustesPesaje
  const alternar = (id: string) => {
    const sel = a.idpesos.includes(id) ? a.idpesos.filter((x) => x !== id) : [...a.idpesos, id]
    if (sel.length === 0) return // siempre al menos uno
    onAjustes({ ...a, idpesos: IDPESOS.map((i) => i.id).filter((x) => sel.includes(x)) })
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">IdPesos a calcular</legend>
      <div className="flex flex-wrap gap-1.5">
        {IDPESOS.map((i) => {
          const on = a.idpesos.includes(i.id)
          return (
            <button
              key={i.id}
              type="button"
              aria-pressed={on}
              onClick={() => alternar(i.id)}
              className={cn(
                "h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
              )}
            >
              {i.nombre}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

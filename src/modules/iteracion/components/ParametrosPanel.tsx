import { Switch } from "@/components/ui/switch"
import { valorParametro } from "../format"
import type { ParamDef, ValoresParametros } from "../types"

/** Un control por parámetro, generado desde las definiciones que entrega la API. */
export function ParametrosPanel({ definiciones, valores, referencia, onChange }: {
  definiciones: ParamDef[]
  valores: ValoresParametros
  referencia: ValoresParametros
  onChange: (clave: string, v: number | boolean) => void
}) {
  return (
    <div className="space-y-5">
      {definiciones.map((d) => {
        const v = valores[d.clave]
        const cambiado = v !== referencia[d.clave]
        const id = `it-param-${d.clave}`
        if (d.tipo === "booleano") {
          return (
            <div key={d.clave} className="flex items-start justify-between gap-3">
              <label htmlFor={id} className="space-y-0.5">
                <span className="block text-sm font-medium">{d.etiqueta}</span>
                <span className="block text-xs text-muted-foreground">
                  {d.clave} · {d.ayuda}
                </span>
              </label>
              <Switch id={id} checked={v === true} onCheckedChange={(c) => onChange(d.clave, c)} />
            </div>
          )
        }
        return (
          <div key={d.clave} className="space-y-1.5">
            <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-sm font-medium">
              <span>{d.etiqueta}</span>
              <span className="tabular-nums">
                {valorParametro(d, v as number)}
                {cambiado && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    (antes {valorParametro(d, referencia[d.clave] as number)})
                  </span>
                )}
              </span>
            </label>
            <input
              id={id}
              type="range"
              min={d.min}
              max={d.max}
              step={d.paso ?? 1}
              value={v as number}
              onChange={(e) => onChange(d.clave, Number(e.target.value))}
              className="h-6 w-full cursor-pointer accent-[var(--primary)]"
            />
            <p className="text-xs text-muted-foreground">
              {d.clave} · {d.ayuda}
            </p>
          </div>
        )
      })}
    </div>
  )
}

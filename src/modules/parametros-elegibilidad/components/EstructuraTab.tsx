import { Input } from "@/components/ui/input"
import { Lock } from "lucide-react"
import { ParamsEditor } from "./ParamsEditor"
import { validateEstructura, diffByKey } from "../validation"
import type { EstructuraRow, ElegCountry } from "../types"

// Estructura is the weighting hierarchy. Expresión / Jerarquía / Secuencia are
// LOCKED by default — only Muestra_Ideal (high-frequency tuning) is editable.
const FIELDS: (keyof EstructuraRow)[] = ["Muestra_Ideal"]

export function EstructuraTab({ country }: { country: ElegCountry }) {
  return (
    <ParamsEditor<EstructuraRow>
      table="Estructura"
      country={country}
      targetLabel={`Estructura · ${country}`}
      intro={
        <>
          Estructura de ponderación. La <span className="font-mono">Expresión</span> y la jerarquía están{" "}
          <span className="inline-flex items-center gap-1 font-medium">
            <Lock className="h-3 w-3" /> bloqueadas
          </span>
          ; solo <span className="font-mono">Muestra_Ideal</span> es editable.
        </>
      }
      validate={validateEstructura}
      diff={(base, draft) =>
        diffByKey(base, draft, (r) => String(r["Marginal/Categoría"]), FIELDS, (r) => String(r["Marginal/Categoría"]))
      }
    >
      {({ draft, setRows }) => (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Marginal/Categoría</th>
                <th className="px-4 py-3">
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Expresión
                  </span>
                </th>
                <th className="px-4 py-3 w-20">Jerarquia</th>
                <th className="px-4 py-3 w-20">Secuencia</th>
                <th className="px-4 py-3 w-32">Muestra_Ideal</th>
              </tr>
            </thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-2 font-mono text-xs">{r["Marginal/Categoría"]}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r["Expresión"]}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.Jerarquia}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.Secuencia}</td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      value={r.Muestra_Ideal}
                      onChange={(e) =>
                        setRows((d) => d.map((row, j) => (j === i ? { ...row, Muestra_Ideal: Number(e.target.value) } : row)))
                      }
                      className="h-8 w-28 font-mono"
                      data-testid={`estructura-muestra-${i}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ParamsEditor>
  )
}

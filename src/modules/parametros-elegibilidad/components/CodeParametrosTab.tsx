import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { ParamsEditor } from "./ParamsEditor"
import { validateCodeParametros, diffByIndex } from "../validation"
import type { CodeParametrosRow, ElegCountry } from "../types"

const FIELDS: (keyof CodeParametrosRow)[] = ["Variable", "Valor", "Observación"]

export function CodeParametrosTab({ country }: { country: ElegCountry }) {
  return (
    <ParamsEditor<CodeParametrosRow>
      table="Code_Parametros"
      country={country}
      targetLabel={`Code_Parametros · ${country}`}
      intro={
        <>
          Parámetros clave-valor de elegibilidad. La <span className="font-mono">Variable</span> debe ser única
          y el <span className="font-mono">Valor</span> un entero.
        </>
      }
      validate={validateCodeParametros}
      diff={(base, draft) => diffByIndex(base, draft, FIELDS, (r) => r.Variable || "(sin nombre)")}
    >
      {({ draft, setRows }) => (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Variable</th>
                <th className="px-4 py-3 w-32">Valor</th>
                <th className="px-4 py-3">Observación</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-2">
                    <Input
                      value={r.Variable}
                      onChange={(e) => setRows((d) => d.map((row, j) => (j === i ? { ...row, Variable: e.target.value } : row)))}
                      className="h-8 font-mono"
                      data-testid={`code-variable-${i}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      value={r.Valor}
                      onChange={(e) =>
                        setRows((d) => d.map((row, j) => (j === i ? { ...row, Valor: Number(e.target.value) } : row)))
                      }
                      className="h-8 w-28 font-mono"
                      data-testid={`code-valor-${i}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      value={r["Observación"]}
                      onChange={(e) => setRows((d) => d.map((row, j) => (j === i ? { ...row, "Observación": e.target.value } : row)))}
                      placeholder="—"
                      className="h-8 text-xs"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setRows((d) => d.filter((_, j) => j !== i))}
                      aria-label="Eliminar fila"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows((d) => [...d, { Variable: "", Valor: 0, "Observación": "" }])}
              data-testid="code-add-row"
            >
              <Plus className="h-4 w-4" />
              Agregar parámetro
            </Button>
          </div>
        </div>
      )}
    </ParamsEditor>
  )
}

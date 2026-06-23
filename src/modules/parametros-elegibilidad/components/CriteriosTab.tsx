import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { ParamsEditor } from "./ParamsEditor"
import { validateCriterios, diffByKey } from "../validation"
import type { CriteriosRow, ElegCountry } from "../types"

const FIELDS: (keyof CriteriosRow)[] = ["Categorias", "Semanas", "ExCateg", "Actos"]

const numCols: { key: keyof CriteriosRow; label: string }[] = [
  { key: "Categorias", label: "Categorias" },
  { key: "Semanas", label: "Semanas (1–52)" },
  { key: "Actos", label: "Actos" },
]

export function CriteriosTab({ country }: { country: ElegCountry }) {
  return (
    <ParamsEditor<CriteriosRow>
      table="Criterios_Elegibilidad"
      country={country}
      targetLabel={`Criterios_Elegibilidad · ${country}`}
      intro={
        <>
          Reglas de elegibilidad. <span className="font-mono">Semanas</span> debe estar en el rango 1–52 y{" "}
          <span className="font-mono">IdRegla</span> ser único.
        </>
      }
      validate={validateCriterios}
      diff={(base, draft) => diffByKey(base, draft, (r) => String(r.IdRegla), FIELDS, (r) => `IdRegla ${r.IdRegla}`)}
    >
      {({ draft, setRows }) => (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 w-28">IdRegla</th>
                {numCols.map((c) => (
                  <th key={String(c.key)} className="px-4 py-3 w-32">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 w-28">ExCateg</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
                  <td className="px-4 py-2">
                    <Input
                      type="number"
                      value={r.IdRegla}
                      onChange={(e) => setRows((d) => d.map((row, j) => (j === i ? { ...row, IdRegla: Number(e.target.value) } : row)))}
                      className="h-8 w-24 font-mono"
                    />
                  </td>
                  {numCols.map((c) => (
                    <td key={String(c.key)} className="px-4 py-2">
                      <Input
                        type="number"
                        value={r[c.key] as number}
                        onChange={(e) =>
                          setRows((d) => d.map((row, j) => (j === i ? { ...row, [c.key]: Number(e.target.value) } : row)))
                        }
                        className="h-8 w-28 font-mono"
                        data-testid={c.key === "Semanas" ? `criterios-semanas-${i}` : undefined}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <Input
                      value={r.ExCateg}
                      onChange={(e) => setRows((d) => d.map((row, j) => (j === i ? { ...row, ExCateg: e.target.value } : row)))}
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
              onClick={() =>
                setRows((d) => [
                  ...d,
                  { IdRegla: (d.reduce((m, r) => Math.max(m, r.IdRegla), 0) || 0) + 1, Categorias: 1, Semanas: 12, ExCateg: "", Actos: 1 },
                ])
              }
            >
              <Plus className="h-4 w-4" />
              Agregar regla
            </Button>
          </div>
        </div>
      )}
    </ParamsEditor>
  )
}

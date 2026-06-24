import { type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { ParamsEditor } from "./ParamsEditor"
import { diffByIndex, type ValidationIssue } from "../validation"
import type { ElegCountry, ElegTable, ParamRow } from "../types"

/** JAA-613 — generic, schema-driven grid editor reused by most of the remaining
 *  tables. A column is rendered as a numeric/text Input, or a 0/1 Switch for
 *  boolean flag columns (the validation tables). Behaviour (live validation +
 *  before→after diff + publish trust gate) comes from the shared ParamsEditor. */

export type ColType = "int" | "float" | "string" | "bool"

export interface GridColumn<R> {
  key: keyof R & string
  label: string
  type: ColType
  width?: string
  readOnly?: boolean
}

interface GridTabProps<R extends ParamRow> {
  table: ElegTable
  country: ElegCountry
  intro?: ReactNode
  columns: GridColumn<R>[]
  validate: (rows: R[]) => ValidationIssue[]
  newRow: () => R
  testidPrefix: string
  addLabel?: string
}

const coerce = (type: ColType, raw: string): string | number => (type === "string" ? raw : Number(raw))

export function GridTab<R extends ParamRow>({
  table,
  country,
  intro,
  columns,
  validate,
  newRow,
  testidPrefix,
  addLabel = "Agregar fila",
}: GridTabProps<R>) {
  const fields = columns.map((c) => c.key) as (keyof R)[]
  const labelOf = (r: R, i: number) => {
    const v = r[columns[0].key]
    return v === undefined || v === null || v === "" ? `fila ${i + 1}` : String(v)
  }

  return (
    <ParamsEditor<R>
      table={table}
      country={country}
      targetLabel={`${table} · ${country}`}
      intro={intro}
      validate={validate}
      diff={(base, draft) => diffByIndex(base, draft, fields, labelOf)}
    >
      {({ draft, setRows }) => (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-3" style={c.width ? { width: c.width } : undefined}>
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {draft.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-2">
                      {c.type === "bool" ? (
                        <Switch
                          checked={Number(r[c.key]) === 1}
                          onCheckedChange={(on) =>
                            setRows((d) => d.map((row, j) => (j === i ? { ...row, [c.key]: on ? 1 : 0 } : row)))
                          }
                          data-testid={`${testidPrefix}-${c.key}-${i}`}
                          aria-label={`${c.label} fila ${i + 1}`}
                        />
                      ) : (
                        <Input
                          type={c.type === "string" ? "text" : "number"}
                          value={(r[c.key] as string | number | null) ?? ""}
                          readOnly={c.readOnly}
                          onChange={(e) =>
                            setRows((d) => d.map((row, j) => (j === i ? { ...row, [c.key]: coerce(c.type, e.target.value) } : row)))
                          }
                          className="h-8 font-mono"
                          data-testid={`${testidPrefix}-${c.key}-${i}`}
                        />
                      )}
                    </td>
                  ))}
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
            <Button variant="ghost" size="sm" onClick={() => setRows((d) => [...d, newRow()])} data-testid={`${testidPrefix}-add`}>
              <Plus className="h-4 w-4" />
              {addLabel}
            </Button>
          </div>
        </div>
      )}
    </ParamsEditor>
  )
}

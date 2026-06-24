import { useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, X } from "lucide-react"
import { ParamsEditor } from "./ParamsEditor"
import { diffByIndex, validateNumericList } from "../validation"
import type { ElegCountry, ElegTable, ParamRow } from "../types"

/** JAA-613 — single-column integer exclusion list (Origen_NoConsiderar,
 *  Imputacion_ExCateg, IdDomicilio_Prueba). Multi-add via an input + chips with
 *  remove. Duplicates and non-integers are caught by validateNumericList and
 *  block the publish gate. */

interface Props {
  table: ElegTable
  country: ElegCountry
  col: string
  label: string
  intro?: ReactNode
  testidPrefix: string
}

function ChipEditor({
  draft,
  setRows,
  col,
  label,
  testidPrefix,
}: {
  draft: ParamRow[]
  setRows: (updater: (d: ParamRow[]) => ParamRow[]) => void
  col: string
  label: string
  testidPrefix: string
}) {
  const [val, setVal] = useState("")

  const add = () => {
    const t = val.trim()
    if (t === "") return
    const n = Number(t)
    // Keep the raw value when it is not a number so the validator can flag it.
    setRows((d) => [...d, { [col]: Number.isNaN(n) ? t : n }])
    setVal("")
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder={`Nuevo ${label}`}
          className="h-8 w-48 font-mono"
          data-testid={`${testidPrefix}-input`}
        />
        <Button size="sm" variant="ghost" onClick={add} data-testid={`${testidPrefix}-add`}>
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {draft.length === 0 && <p className="text-sm text-muted-foreground">Sin exclusiones.</p>}
        {draft.map((r, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-3 py-1 text-sm font-mono"
            data-testid={`${testidPrefix}-chip-${i}`}
          >
            {String(r[col] ?? "")}
            <button
              onClick={() => setRows((d) => d.filter((_, j) => j !== i))}
              aria-label="Quitar exclusión"
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

export function ExclusionListTab({ table, country, col, label, intro, testidPrefix }: Props) {
  return (
    <ParamsEditor<ParamRow>
      table={table}
      country={country}
      targetLabel={`${table} · ${country}`}
      intro={intro}
      validate={(rows) => validateNumericList(rows.map((r) => Number(r[col])), label)}
      diff={(base, draft) =>
        diffByIndex(base, draft, [col], (r, i) => (r[col] === null || r[col] === undefined || r[col] === "" ? `fila ${i + 1}` : String(r[col])))
      }
    >
      {({ draft, setRows }) => (
        <ChipEditor draft={draft} setRows={setRows} col={col} label={label} testidPrefix={testidPrefix} />
      )}
    </ParamsEditor>
  )
}

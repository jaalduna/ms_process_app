import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { ParamsEditor } from "./ParamsEditor"
import { validateVocab, diffByIndex } from "../validation"
import { VARIABLE_VOCAB, type ElegCountry, type ElegTable, type ParamRow } from "../types"

/** One vocab-bound list editor (Q_Variables or M_Variables). The Select against
 *  the controlled vocabulary makes a non-existent column impossible to type. */
function VocabListEditor({ country, table, col, label }: { country: ElegCountry; table: ElegTable; col: string; label: string }) {
  return (
    <ParamsEditor<ParamRow>
      table={table}
      country={country}
      targetLabel={`${table} · ${country}`}
      intro={
        <>
          {label}: selecciona variables del <span className="font-medium">vocabulario del panel</span>. Solo se
          permiten columnas que existen.
        </>
      }
      validate={(rows) => validateVocab(rows.map((r) => String(r[col] ?? "")))}
      diff={(base, draft) => diffByIndex(base, draft, [col], (r) => String(r[col] ?? "(vacío)"))}
    >
      {({ draft, setRows }) => (
        <div className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
          {draft.length === 0 && <p className="text-sm text-muted-foreground">Sin variables seleccionadas.</p>}
          {draft.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                value={String(r[col] ?? "")}
                onValueChange={(v) => setRows((d) => d.map((row, j) => (j === i ? { ...row, [col]: v } : row)))}
              >
                <SelectTrigger className="w-64" data-testid={`${col}-select-${i}`}>
                  <SelectValue placeholder="Selecciona variable" />
                </SelectTrigger>
                <SelectContent>
                  {VARIABLE_VOCAB.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setRows((d) => d.filter((_, j) => j !== i))}
                aria-label="Quitar variable"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows((d) => [...d, { [col]: VARIABLE_VOCAB[0] }])}
            data-testid={`${col}-add`}
          >
            <Plus className="h-4 w-4" />
            Agregar variable
          </Button>
        </div>
      )}
    </ParamsEditor>
  )
}

export function VariablesTab({ country }: { country: ElegCountry }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Q_Variables</h3>
        <VocabListEditor country={country} table="Q_Variables" col="Q_Vars" label="Variables Q" />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">M_Variables</h3>
        <VocabListEditor country={country} table="M_Variables" col="M_Vars" label="Variables M" />
      </div>
    </div>
  )
}

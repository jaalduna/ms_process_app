import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Upload, RotateCcw, Check } from "lucide-react"
import {
  VARIABLE_VOCAB,
  VARIABLES_SEED,
  diffVariables,
  validateVariables,
  type CountryCode,
  type VariablesSeed,
} from "../mockData"
import { ReviewPublishDialog } from "./ReviewPublishDialog"
import { StatusPill } from "./IdPesoTab"

const clone = (s: VariablesSeed): VariablesSeed => ({ q: [...s.q], m: [...s.m] })

export function VariablesTab({ country, code }: { country: string; code: CountryCode }) {
  const seed = VARIABLES_SEED[code]
  const [baseline, setBaseline] = useState<VariablesSeed>(clone(seed))
  const [draft, setDraft] = useState<VariablesSeed>(clone(seed))
  const [review, setReview] = useState(false)

  const issues = useMemo(() => validateVariables(draft), [draft])
  const diff = useMemo(() => diffVariables(baseline, draft), [baseline, draft])
  const errors = issues.filter(i => i.severity === "error").length

  const toggle = (kind: "q" | "m", v: string) =>
    setDraft(d => ({
      ...d,
      [kind]: d[kind].includes(v) ? d[kind].filter(x => x !== v) : [...d[kind], v],
    }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Variables sociodemográficas que se pivotean para <span className="font-medium">{country}</span>.
          Se eligen del vocabulario real del panel — no se escriben a mano, así un nombre inexistente
          no puede romper el pivot.
        </p>
        <StatusPill errors={errors} dirty={diff.length} />
      </div>

      <VariablePicker
        title="Q_Variables — trimestrales"
        hint="Se colapsan por trimestre (p. ej. EDBEQ1…EDBEQ4 → EDBEQ#)."
        selected={draft.q}
        onToggle={v => toggle("q", v)}
      />
      <VariablePicker
        title="M_Variables — mensuales"
        hint="Se colapsan por mes (p. ej. NIME_MES01…12 → NIME_MESXX)."
        selected={draft.m}
        onToggle={v => toggle("m", v)}
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={diff.length === 0} onClick={() => setDraft(clone(baseline))}>
          <RotateCcw className="h-4 w-4" />
          Descartar
        </Button>
        <Button size="sm" disabled={diff.length === 0} onClick={() => setReview(true)}>
          <Upload className="h-4 w-4" />
          Revisar y publicar
        </Button>
      </div>

      <ReviewPublishDialog
        open={review}
        onOpenChange={setReview}
        target={`Q/M_Variables · ${country}`}
        issues={issues}
        diff={diff}
        onPublish={() => setBaseline(clone(draft))}
      />
    </div>
  )
}

function VariablePicker({
  title,
  hint,
  selected,
  onToggle,
}: {
  title: string
  hint: string
  selected: string[]
  onToggle: (v: string) => void
}) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {VARIABLE_VOCAB.map(v => {
          const on = selected.includes(v)
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              aria-pressed={on}
              className="focus-visible:ring-ring/50 rounded-full outline-none focus-visible:ring-[3px]"
            >
              <Badge
                variant={on ? "default" : "outline"}
                className={`cursor-pointer gap-1 font-mono ${on ? "" : "text-muted-foreground hover:bg-accent"}`}
              >
                {on && <Check className="h-3 w-3" />}
                {v}
              </Badge>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {selected.length ? `${selected.length} seleccionada(s)` : "Ninguna seleccionada"}
      </p>
    </section>
  )
}

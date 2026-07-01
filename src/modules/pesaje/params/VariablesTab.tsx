import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Upload, RotateCcw, Check } from "lucide-react"
import { StatusPill } from "./StatusPill"
import { ReviewPublishDialog } from "./ReviewPublishDialog"
import { usePublishWeightingParams, useValidateWeightingParams, useWeightingVariables } from "./hooks"
import { diffVariables, serverErrorsToIssues, validateVariables } from "./validation"
import { VARIABLE_VOCAB, type VariablesPayload } from "./types"

const clone = (s: VariablesPayload): VariablesPayload => ({ q_vars: [...s.q_vars], m_vars: [...s.m_vars] })

export function VariablesTab({ pais, country }: { pais: string; country: string }) {
  const query = useWeightingVariables(pais)
  const publish = usePublishWeightingParams(pais, "variables")
  const validate = useValidateWeightingParams(pais, "variables")

  const [baseline, setBaseline] = useState<VariablesPayload>({ q_vars: [], m_vars: [] })
  const [draft, setDraft] = useState<VariablesPayload>({ q_vars: [], m_vars: [] })
  const [review, setReview] = useState(false)

  const [seededSig, setSeededSig] = useState<number | null>(null)
  if (query.data && query.dataUpdatedAt !== seededSig) {
    setSeededSig(query.dataUpdatedAt)
    const seed = { q_vars: query.data.q_vars, m_vars: query.data.m_vars }
    setBaseline(clone(seed))
    setDraft(clone(seed))
  }

  const issues = useMemo(() => validateVariables(draft), [draft])
  const diff = useMemo(() => diffVariables(baseline, draft), [baseline, draft])
  const errors = issues.filter((i) => i.severity === "error").length

  const toggle = (kind: "q_vars" | "m_vars", v: string) =>
    setDraft((d) => ({
      ...d,
      [kind]: d[kind].includes(v) ? d[kind].filter((x) => x !== v) : [...d[kind], v],
    }))

  const handlePublish = async () => {
    try {
      const result = await publish.mutateAsync(draft)
      setBaseline(clone(draft))
      toast.success(`Publicado: Q/M_Variables · ${country}`, {
        description: result.unchanged
          ? "Sin cambios respecto a la versión publicada."
          : `Versión ${result.version} publicada.`,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Error al publicar"
      toast.error(`No se pudo publicar Q/M_Variables · ${country}`, { description: detail })
      throw err
    }
  }

  if (query.isLoading)
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando variables…
      </div>
    )

  if (query.isError)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        No se pudieron cargar las variables Q/M · {country}.
      </p>
    )

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
        selected={draft.q_vars}
        onToggle={(v) => toggle("q_vars", v)}
        testid="q"
      />
      <VariablePicker
        title="M_Variables — mensuales"
        hint="Se colapsan por mes (p. ej. NIME_MES01…12 → NIME_MESXX)."
        selected={draft.m_vars}
        onToggle={(v) => toggle("m_vars", v)}
        testid="m"
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={diff.length === 0} onClick={() => setDraft(clone(baseline))}>
          <RotateCcw className="h-4 w-4" />
          Descartar
        </Button>
        <Button size="sm" disabled={diff.length === 0} onClick={() => setReview(true)} data-testid="open-review">
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
        onPublish={handlePublish}
        onValidate={async () => {
          const res = await validate.mutateAsync(draft)
          return serverErrorsToIssues(res.errors)
        }}
      />
    </div>
  )
}

function VariablePicker({
  title,
  hint,
  selected,
  onToggle,
  testid,
}: {
  title: string
  hint: string
  selected: string[]
  onToggle: (v: string) => void
  testid: string
}) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {VARIABLE_VOCAB.map((v) => {
          const on = selected.includes(v)
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              aria-pressed={on}
              data-testid={`var-${testid}-${v}`}
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

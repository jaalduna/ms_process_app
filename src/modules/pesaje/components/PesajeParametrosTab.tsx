/**
 * PesajeParametrosTab — the 3-level parameter hierarchy for Pesaje, wired to the
 * real weighting-params API (JAA-581).
 *
 * Nivel 1 — De ejecución: los 4 hiperparámetros ajustables al lanzar. Aquí se
 *           edita su DEFAULT persistente (publicado, versionado); el panel
 *           Ejecutar los siembra desde el último publicado.
 * Nivel 2 — Insumos versionados (editable, validated + published against the API)
 * Nivel 3 — Estáticos / Avanzados: el resto del set F-001, editable y persistente
 *           aquí (no se ajusta al lanzar), más las constantes fijas del pipeline.
 *
 * Los niveles 1 y 3 comparten UN draft de hiperparámetros por país: se validan y
 * publican juntos como una versión (tabla `idpeso-config` del weighting store,
 * JAA-670) vía GET /weighting/params/{pais}/execution-params + validate/publish.
 */

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronRight, Info, Loader2, RotateCcw, Upload } from "lucide-react"
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SlidersHorizontal, Tags, Grid3x3 } from "lucide-react"

import { COUNTRIES, type CountryCode } from "../params/types"
import { IdPesoTab } from "../params/IdPesoTab"
import { VariablesTab } from "../params/VariablesTab"
import { UniversoTab } from "../params/UniversoTab"
import { StatusPill } from "../params/StatusPill"
import { ReviewPublishDialog } from "../params/ReviewPublishDialog"
import {
  useExecutionParams,
  usePublishWeightingParams,
  useValidateWeightingParams,
} from "../params/hooks"
import { diffHyperparams, serverErrorsToIssues, validateHyperparams } from "../params/validation"
import {
  ADVANCED_PARAM_KEYS,
  EXECUTION_PARAM_KEYS,
  WEIGHTING_PARAM_FIELD_BY_KEY,
  type WeightingFieldDescriptor,
} from "../weightingParams"

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function SectionHeader({ nivel, title, subtitle, muted }: { nivel: string; title: string; subtitle: string; muted?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          muted ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        {nivel}
      </div>
      <div>
        <h2 className="text-base font-semibold leading-none">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function FieldRow({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <span className="w-40 truncate text-right font-mono text-sm text-muted-foreground">{value}</span>
    </div>
  )
}

/** One editable hyperparameter row, rendered from its field descriptor. */
function ParamEditRow({
  descriptor,
  value,
  onChange,
}: {
  descriptor: WeightingFieldDescriptor
  value: unknown
  onChange: (next: unknown) => void
}) {
  const key = descriptor.key
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-medium">{key}</p>
        {descriptor.help && <p className="text-xs text-muted-foreground">{descriptor.help}</p>}
      </div>
      {descriptor.control === "switch" ? (
        <Switch aria-label={key} checked={Boolean(value)} onCheckedChange={onChange} />
      ) : descriptor.control === "select" ? (
        <Select value={String(value)} onValueChange={onChange}>
          <SelectTrigger aria-label={key} className="h-8 w-40 font-mono text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {descriptor.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          type="number"
          aria-label={key}
          step={descriptor.step ?? "any"}
          min={descriptor.min}
          max={descriptor.max}
          placeholder={descriptor.nullable ? "—" : undefined}
          className="h-8 w-40 text-right font-mono"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value
            onChange(raw === "" ? (descriptor.nullable ? null : 0) : parseFloat(raw))
          }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shared hyperparams draft (niveles 1 y 3)                            */
/* ------------------------------------------------------------------ */

type ParamsDraft = Record<string, unknown>

const EDITABLE_KEYS = [...EXECUTION_PARAM_KEYS, ...ADVANCED_PARAM_KEYS] as const

const pickEditable = (params: Record<string, unknown>): ParamsDraft =>
  Object.fromEntries(EDITABLE_KEYS.map((k) => [k, params[k]]))

/** Constantes del pipeline (KWP-pesaje param_configs.py) que NO forman parte del
 *  set F-001 overrideable — se muestran como referencia, no se editan. */
const PIPELINE_CONSTANTS: { label: string; value: string; hint: string }[] = [
  { label: "MANUAL_COLLAPSES", value: "[]", hint: "Colapsos manuales (editor dedicado pendiente)" },
  { label: "MAX_CELL_ERR_RATIO_BOUNDS", value: "50", hint: "Ratio máximo de error por celda corr_bounds/IPF" },
  { label: "IPF_IT_MAX", value: "1000", hint: "Máximo de iteraciones del IPF" },
  { label: "IPF_TOL_ERR", value: "1e-5", hint: "Tolerancia de error para convergencia" },
  { label: "IPF_IMPROVEMENT_TOL", value: "1e-8", hint: "Mejora mínima para no contar como estancamiento" },
  { label: "IPF_STAGNATION_PAT", value: "30", hint: "Iteraciones sin mejora antes de parar" },
]

function useHyperparamsDraft(pais: CountryCode, country: string) {
  const query = useExecutionParams(pais)
  const publish = usePublishWeightingParams(pais, "idpeso-config")
  const validate = useValidateWeightingParams(pais, "idpeso-config")

  const [baseline, setBaseline] = useState<ParamsDraft>({})
  const [draft, setDraft] = useState<ParamsDraft>({})
  const [review, setReview] = useState(false)

  // Seed baseline + draft from the server params (set-state-during-render, guarded).
  const [seededSig, setSeededSig] = useState<number | null>(null)
  if (query.data && query.dataUpdatedAt !== seededSig) {
    setSeededSig(query.dataUpdatedAt)
    setBaseline(pickEditable(query.data.params))
    setDraft(pickEditable(query.data.params))
  }

  const issues = useMemo(() => validateHyperparams(draft), [draft])
  const diff = useMemo(() => diffHyperparams(baseline, draft), [baseline, draft])
  const errors = issues.filter((i) => i.severity === "error").length

  const setParam = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }))

  const handlePublish = async () => {
    try {
      const result = await publish.mutateAsync({ params: draft })
      setBaseline({ ...draft })
      toast.success(`Publicado: parámetros de pesaje · ${country}`, {
        description: result.unchanged
          ? "Sin cambios respecto a la versión publicada."
          : `Versión ${result.version.version} publicada.`,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Error al publicar"
      toast.error(`No se pudo publicar parámetros · ${country}`, { description: detail })
      throw err
    }
  }

  return {
    query,
    baseline,
    draft,
    setDraft,
    setParam,
    issues,
    diff,
    errors,
    review,
    setReview,
    handlePublish,
    validate,
  }
}

type HyperparamsDraftState = ReturnType<typeof useHyperparamsDraft>

/** Discard / review-and-publish action bar for the shared hyperparams draft. */
function HyperparamsActions({ state, testId }: { state: HyperparamsDraftState; testId: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <StatusPill errors={state.errors} dirty={state.diff.length} />
      <Button
        variant="ghost"
        size="sm"
        disabled={state.diff.length === 0}
        onClick={() => state.setDraft({ ...state.baseline })}
      >
        <RotateCcw className="h-4 w-4" />
        Descartar
      </Button>
      <Button
        size="sm"
        disabled={state.diff.length === 0}
        onClick={() => state.setReview(true)}
        data-testid={testId}
      >
        <Upload className="h-4 w-4" />
        Revisar y publicar
      </Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 1 — De ejecución (defaults editables + persistentes)          */
/* ------------------------------------------------------------------ */

function NivelEjecucion({ state }: { state: HyperparamsDraftState }) {
  const version = state.query.data?.version ?? null
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeader
          nivel="1"
          title="De ejecución"
          subtitle="Ajustables al lanzar cada corrida — aquí se define su default persistente"
        />
        {state.query.data && (
          <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground" data-testid="exec-params-version">
            {version ? (version.version ? `v${version.version} · ${version.published_by ?? "—"}` : `Publicado ${new Date(version.published_at).toLocaleDateString("es-CL")} · ${version.published_by ?? "—"}`) : "defaults F-001 (sin publicar)"}
          </Badge>
        )}
      </div>
      <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Estos parámetros se pueden ajustar al lanzar cada corrida (panel Ejecutar). El valor
          publicado aquí es el default que se mantiene entre períodos hasta su próxima edición.
        </div>
        {state.query.isLoading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando parámetros…
          </div>
        ) : state.query.isError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            No se pudieron cargar los parámetros de ejecución.
          </p>
        ) : (
          <div className="divide-y">
            <FieldRow label="periodos" value="al lanzar" hint="Período de referencia de la corrida (YYYYMM)" />
            <FieldRow label="idpesos" value="al lanzar" hint="IDs de esquema de ponderación a ejecutar" />
            {EXECUTION_PARAM_KEYS.map((key) => (
              <ParamEditRow
                key={key}
                descriptor={WEIGHTING_PARAM_FIELD_BY_KEY[key]}
                value={state.draft[key]}
                onChange={(v) => state.setParam(key, v)}
              />
            ))}
          </div>
        )}
      </div>
      {state.query.data && <HyperparamsActions state={state} testId="exec-params-review" />}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 2 — Insumos versionados (wired)                               */
/* ------------------------------------------------------------------ */

function NivelInsumos({ code, country }: { code: CountryCode; country: string }) {
  return (
    <section className="space-y-4">
      <SectionHeader
        nivel="2"
        title="Insumos versionados"
        subtitle="Cambian cada cierto tiempo — edita, valida y publica una nueva versión"
      />

      {/* key prop resets draft state on country change */}
      <Tabs defaultValue="idpeso" key={code}>
        <TabsList>
          <TabsTrigger value="idpeso">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            IdPeso_Config
          </TabsTrigger>
          <TabsTrigger value="variables">
            <Tags className="h-3.5 w-3.5" />
            Variables Q/M
          </TabsTrigger>
          <TabsTrigger value="universo">
            <Grid3x3 className="h-3.5 w-3.5" />
            Universo
          </TabsTrigger>
        </TabsList>
        <TabsContent value="idpeso">
          <IdPesoTab pais={code} country={country} />
        </TabsContent>
        <TabsContent value="variables">
          <VariablesTab pais={code} country={country} />
        </TabsContent>
        <TabsContent value="universo">
          <UniversoTab pais={code} country={country} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Nivel 3 — Estáticos / Avanzados (editables + constantes fijas)      */
/* ------------------------------------------------------------------ */

function NivelAvanzados({ state }: { state: HyperparamsDraftState }) {
  const [open, setOpen] = useState(false)

  return (
    <section className="space-y-3">
      <CollapsiblePrimitive.Root open={open} onOpenChange={setOpen}>
        <CollapsiblePrimitive.Trigger asChild>
          <button
            type="button"
            data-testid="advanced-toggle"
            className="flex w-full items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
              3
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold">Estáticos / Avanzados</span>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {open ? "ocultar" : "mostrar"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Rara vez cambian — se editan y publican aquí (no se ajustan al lanzar)
              </p>
            </div>
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsiblePrimitive.Trigger>

        <CollapsiblePrimitive.Content className="overflow-hidden">
          <div className="mt-3 space-y-4 pl-9" data-testid="advanced-content">
            <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
              <Info className="h-3.5 w-3.5 shrink-0" />
              El valor publicado se mantiene entre períodos hasta su próxima edición. Se publica
              junto con los parámetros de ejecución (una sola versión).
            </div>

            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold">Outliers, bounds y colapso</h3>
              <div className="divide-y">
                {ADVANCED_PARAM_KEYS.map((key) => (
                  <ParamEditRow
                    key={key}
                    descriptor={WEIGHTING_PARAM_FIELD_BY_KEY[key]}
                    value={state.draft[key]}
                    onChange={(v) => state.setParam(key, v)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <h3 className="mb-1 text-sm font-semibold">Constantes del pipeline</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Fijas en KWP-pesaje (param_configs.py) — no son overrideables por corrida ni por país.
              </p>
              <div className="divide-y">
                {PIPELINE_CONSTANTS.map((c) => (
                  <FieldRow key={c.label} label={c.label} value={c.value} hint={c.hint} />
                ))}
              </div>
            </div>

            {state.query.data && <HyperparamsActions state={state} testId="advanced-params-review" />}
          </div>
        </CollapsiblePrimitive.Content>
      </CollapsiblePrimitive.Root>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Main export                                                          */
/* ------------------------------------------------------------------ */

function ParametrosContent({ code, country, conInsumos = true }: { code: CountryCode; country: string; conInsumos?: boolean }) {
  const hyper = useHyperparamsDraft(code, country)

  return (
    <>
      <NivelEjecucion state={hyper} />

      <div className="border-t" />

      {conInsumos && (
        <>
          <NivelInsumos code={code} country={country} />

          <div className="border-t" />
        </>
      )}

      <NivelAvanzados state={hyper} />

      <ReviewPublishDialog
        open={hyper.review}
        onOpenChange={hyper.setReview}
        target={`Parámetros de pesaje · ${country}`}
        issues={hyper.issues}
        diff={hyper.diff}
        onPublish={hyper.handlePublish}
        onValidate={async () => {
          const res = await hyper.validate.mutateAsync({ params: hyper.draft })
          return serverErrorsToIssues(res.errors)
        }}
      />
    </>
  )
}

/** Valores del país de los hiperparámetros (niveles 1 y 3), para la configuración del país del cierre. */
export function ValoresPorDefectoPesaje({ code, country }: { code: CountryCode; country: string }) {
  return (
    <div className="space-y-8">
      <ParametrosContent code={code} country={country} conInsumos={false} />
    </div>
  )
}

export function PesajeParametrosTab() {
  const [code, setCode] = useState<CountryCode>("CL")
  const country = COUNTRIES.find((c) => c.code === code)!.label

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Configuración de parámetros por proceso, organizada por frecuencia de cambio.
        </p>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">País</label>
          <Select value={code} onValueChange={(v) => setCode(v as CountryCode)}>
            <SelectTrigger className="w-44" data-testid="params-country-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* key prop resets hyperparams draft state on country change */}
      <ParametrosContent key={code} code={code} country={country} />
    </div>
  )
}

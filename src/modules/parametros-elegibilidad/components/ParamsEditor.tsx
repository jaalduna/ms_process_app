import { useMemo, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Upload, RotateCcw, Loader2 } from "lucide-react"
import { StatusPill } from "./StatusPill"
import { ReviewPublishDialog } from "./ReviewPublishDialog"
import { useParamsTable, usePublishParams } from "../hooks"
import type { DiffEntry, ValidationIssue } from "../validation"
import type { ElegCountry, ElegTable, ParamRow } from "../types"

const clone = <R,>(rows: R[]) => rows.map((r) => ({ ...r }))

interface RenderCtx<R> {
  draft: R[]
  baseline: R[]
  setRows: (updater: (d: R[]) => R[]) => void
}

interface Props<R extends ParamRow> {
  table: ElegTable
  country: ElegCountry
  targetLabel: string
  intro?: ReactNode
  validate: (rows: R[]) => ValidationIssue[]
  diff: (baseline: R[], draft: R[]) => DiffEntry[]
  children: (ctx: RenderCtx<R>) => ReactNode
}

/**
 * Shared shell for every specialized table editor: loads current rows from the
 * (mock) backend, tracks a local draft, runs live validation + diff, and drives
 * the Review/Publish trust gate against the real publish endpoint.
 */
export function ParamsEditor<R extends ParamRow>({
  table,
  country,
  targetLabel,
  intro,
  validate,
  diff,
  children,
}: Props<R>) {
  const query = useParamsTable(table, country)
  const publish = usePublishParams(table, country)

  const [baseline, setBaseline] = useState<R[]>([])
  const [draft, setDraft] = useState<R[]>([])

  // Seed baseline + draft from the server rows. React-blessed "reset state when
  // input changes" pattern (set state during render, guarded by a signature) —
  // avoids a useEffect just to copy props into state.
  const [seededSig, setSeededSig] = useState<number | null>(null)
  if (query.data && query.dataUpdatedAt !== seededSig) {
    setSeededSig(query.dataUpdatedAt)
    const rows = clone(query.data.rows as R[])
    setBaseline(rows)
    setDraft(clone(rows))
  }

  const issues = useMemo(() => validate(draft), [validate, draft])
  const diffEntries = useMemo(() => diff(baseline, draft), [diff, baseline, draft])
  const errors = issues.filter((i) => i.severity === "error").length
  const dirty = diffEntries.length

  const [review, setReview] = useState(false)

  const setRows = (updater: (d: R[]) => R[]) => setDraft((d) => updater(d))

  const handlePublish = async () => {
    try {
      const result = await publish.mutateAsync(draft as ParamRow[])
      setBaseline(clone(draft))
      toast.success(`Publicado: ${targetLabel}`, {
        description: `${result.diff.added_count} fila(s) nueva(s), ${result.diff.removed_count} eliminada(s). Parquet: ${result.parquet_path}`,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Error al publicar"
      toast.error(`No se pudo publicar ${targetLabel}`, { description: detail })
      throw err
    }
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando parámetros…
      </div>
    )
  }

  if (query.isError) {
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        No se pudieron cargar los parámetros de {table} · {country}.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {intro ? <div className="max-w-2xl text-sm text-muted-foreground">{intro}</div> : <span />}
        <StatusPill errors={errors} dirty={dirty} />
      </div>

      {children({ draft, baseline, setRows })}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={dirty === 0} onClick={() => setDraft(clone(baseline))}>
          <RotateCcw className="h-4 w-4" />
          Descartar
        </Button>
        {/* Deshabilitado: a muted, no primary al 50% — en oscuro el primario
            atenuado seguía leyéndose como habilitado. */}
        <Button
          size="sm"
          disabled={dirty === 0}
          onClick={() => setReview(true)}
          data-testid="open-review"
          className="disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
        >
          <Upload className="h-4 w-4" />
          Revisar y publicar
        </Button>
      </div>

      <ReviewPublishDialog
        open={review}
        onOpenChange={setReview}
        target={targetLabel}
        issues={issues}
        diff={diffEntries}
        onPublish={handlePublish}
      />
    </div>
  )
}

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Upload, RotateCcw } from "lucide-react"
import { StatusPill } from "./StatusPill"
import { ReviewPublishDialog } from "./ReviewPublishDialog"
import { useIdPesoConfig, usePublishWeightingParams, useValidateWeightingParams } from "./hooks"
import { diffIdPeso, serverErrorsToIssues, validateIdPeso } from "./validation"
import type { IdPesoConfigRow } from "./types"

const clone = (rows: IdPesoConfigRow[]) => rows.map((r) => ({ ...r }))

export function IdPesoTab({ pais, country }: { pais: string; country: string }) {
  const query = useIdPesoConfig(pais)
  const publish = usePublishWeightingParams(pais, "idpeso-config")
  const validate = useValidateWeightingParams(pais, "idpeso-config")

  const [baseline, setBaseline] = useState<IdPesoConfigRow[]>([])
  const [draft, setDraft] = useState<IdPesoConfigRow[]>([])
  const [review, setReview] = useState(false)

  // Seed baseline + draft from server rows (set-state-during-render, guarded).
  const [seededSig, setSeededSig] = useState<number | null>(null)
  if (query.data && query.dataUpdatedAt !== seededSig) {
    setSeededSig(query.dataUpdatedAt)
    setBaseline(clone(query.data.rows))
    setDraft(clone(query.data.rows))
  }

  const issues = useMemo(() => validateIdPeso(draft), [draft])
  const diff = useMemo(() => diffIdPeso(baseline, draft), [baseline, draft])
  const errors = issues.filter((i) => i.severity === "error").length

  const setCell = <K extends keyof IdPesoConfigRow>(idpeso: number, key: K, value: IdPesoConfigRow[K]) =>
    setDraft((d) => d.map((r) => (r.idpeso === idpeso ? { ...r, [key]: value } : r)))

  const handlePublish = async () => {
    try {
      const result = await publish.mutateAsync({ rows: draft })
      setBaseline(clone(draft))
      toast.success(`Publicado: IdPeso_Config · ${country}`, {
        description: result.unchanged
          ? "Sin cambios respecto a la versión publicada."
          : `Versión ${result.version} publicada.`,
      })
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Error al publicar"
      toast.error(`No se pudo publicar IdPeso_Config · ${country}`, { description: detail })
      throw err
    }
  }

  if (query.isLoading)
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando IdPeso_Config…
      </div>
    )

  if (query.isError)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        No se pudo cargar IdPeso_Config · {country}.
      </p>
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Esquemas de ponderación para <span className="font-medium">{country}</span>. Define la
          ventana móvil (<span className="font-mono">Periodos</span>) y el mínimo de períodos
          históricos (<span className="font-mono">Per_Min</span>) por esquema.
        </p>
        <StatusPill errors={errors} dirty={diff.length} />
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">IdPeso</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3 w-28">Per_Min</th>
              <th className="px-4 py-3 w-28">Periodos</th>
              <th className="px-4 py-3">Obs</th>
            </tr>
          </thead>
          <tbody>
            {draft.map((r) => (
              <tr key={r.idpeso} className="border-b last:border-0 hover:bg-accent/30">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.idpeso}</td>
                <td className="px-4 py-2">
                  <Input
                    value={r.nombre}
                    onChange={(e) => setCell(r.idpeso, "nombre", e.target.value)}
                    className="h-8"
                    data-testid={`idpeso-nombre-${r.idpeso}`}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    type="number"
                    value={r.per_min}
                    onChange={(e) => setCell(r.idpeso, "per_min", Number(e.target.value))}
                    className="h-8 w-20 font-mono"
                    data-testid={`idpeso-permin-${r.idpeso}`}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    type="number"
                    value={r.periodos}
                    onChange={(e) => setCell(r.idpeso, "periodos", Number(e.target.value))}
                    className="h-8 w-20 font-mono"
                    data-testid={`idpeso-periodos-${r.idpeso}`}
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={r.obs ?? ""}
                    onChange={(e) => setCell(r.idpeso, "obs", e.target.value)}
                    placeholder="—"
                    className="h-8 text-xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        target={`IdPeso_Config · ${country}`}
        issues={issues}
        diff={diff}
        onPublish={handlePublish}
        onValidate={async () => {
          const res = await validate.mutateAsync({ rows: draft })
          return serverErrorsToIssues(res.errors)
        }}
      />
    </div>
  )
}

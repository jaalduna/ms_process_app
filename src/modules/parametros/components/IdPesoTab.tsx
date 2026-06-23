import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Upload, RotateCcw, CheckCircle2, AlertTriangle } from "lucide-react"
import {
  ID_PESO_SEED,
  diffIdPeso,
  validateIdPeso,
  type IdPesoRow,
} from "../mockData"
import { ReviewPublishDialog } from "./ReviewPublishDialog"

const clone = (rows: IdPesoRow[]) => rows.map(r => ({ ...r }))

export function IdPesoTab({ country }: { country: string }) {
  // baseline = "currently published"; draft = user edits in this session
  const [baseline, setBaseline] = useState<IdPesoRow[]>(clone(ID_PESO_SEED))
  const [draft, setDraft] = useState<IdPesoRow[]>(clone(ID_PESO_SEED))
  const [review, setReview] = useState(false)

  const issues = useMemo(() => validateIdPeso(draft), [draft])
  const diff = useMemo(() => diffIdPeso(baseline, draft), [baseline, draft])
  const errors = issues.filter(i => i.severity === "error").length

  const setCell = <K extends keyof IdPesoRow>(idPeso: number, key: K, value: IdPesoRow[K]) =>
    setDraft(d => d.map(r => (r.IdPeso === idPeso ? { ...r, [key]: value } : r)))

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
            {draft.map(r => (
              <tr key={r.IdPeso} className="border-b last:border-0 hover:bg-accent/30">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.IdPeso}</td>
                <td className="px-4 py-2">
                  <Input
                    value={r.Nombre}
                    onChange={e => setCell(r.IdPeso, "Nombre", e.target.value)}
                    className="h-8"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    type="number"
                    value={r.Per_Min}
                    onChange={e => setCell(r.IdPeso, "Per_Min", Number(e.target.value))}
                    className="h-8 w-20 font-mono"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    type="number"
                    value={r.Periodos}
                    onChange={e => setCell(r.IdPeso, "Periodos", Number(e.target.value))}
                    className="h-8 w-20 font-mono"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={r.Obs}
                    onChange={e => setCell(r.IdPeso, "Obs", e.target.value)}
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
        <Button
          variant="ghost"
          size="sm"
          disabled={diff.length === 0}
          onClick={() => setDraft(clone(baseline))}
        >
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
        target={`IdPeso_Config · ${country}`}
        issues={issues}
        diff={diff}
        onPublish={() => setBaseline(clone(draft))}
      />
    </div>
  )
}

export function StatusPill({ errors, dirty }: { errors: number; dirty: number }) {
  if (dirty === 0)
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <CheckCircle2 className="h-3 w-3" />
        Sin cambios
      </Badge>
    )
  if (errors > 0)
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="h-3 w-3" />
        {errors} error{errors !== 1 && "es"} · {dirty} cambio{dirty !== 1 && "s"}
      </Badge>
    )
  return (
    <Badge className="gap-1 bg-emerald-600 text-white">
      <CheckCircle2 className="h-3 w-3" />
      {dirty} cambio{dirty !== 1 && "s"} · válido
    </Badge>
  )
}

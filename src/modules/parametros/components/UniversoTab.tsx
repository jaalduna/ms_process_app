import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Upload, RotateCcw, ClipboardPaste, Lock, CheckCircle2, XCircle } from "lucide-react"
import {
  UNIVERSO_PERIODS,
  UNIVERSO_SEED,
  diffUniverso,
  validateUniverso,
  type UniversoPeriod,
  type UniversoRow,
} from "../mockData"
import { ReviewPublishDialog } from "./ReviewPublishDialog"
import { StatusPill } from "./IdPesoTab"

const clone = (rows: UniversoRow[]) => rows.map(r => ({ ...r, values: { ...r.values } }))

export function UniversoTab({ country }: { country: string }) {
  const [baseline, setBaseline] = useState<UniversoRow[]>(clone(UNIVERSO_SEED))
  const [draft, setDraft] = useState<UniversoRow[]>(clone(UNIVERSO_SEED))
  const [review, setReview] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)

  const issues = useMemo(() => validateUniverso(draft), [draft])
  const diff = useMemo(() => diffUniverso(baseline, draft), [baseline, draft])
  const errors = issues.filter(i => i.severity === "error").length

  const total = draft.find(r => r.Marginales === 0)
  const leaves = draft.filter(r => r.Marginales === 1)

  const setValue = (id: string, p: UniversoPeriod, value: number) =>
    setDraft(d => d.map(r => (r.id === id ? { ...r, values: { ...r.values, [p]: value } } : r)))

  // per-period reconciliation for the live banner
  const reconciliation = UNIVERSO_PERIODS.map(p => {
    const sum = leaves.reduce((acc, r) => acc + (Number(r.values[p]) || 0), 0)
    const declared = Number(total?.values[p]) || 0
    return { period: p, sum, declared, ok: sum === declared, delta: sum - declared }
  })

  const applyPaste = (period: UniversoPeriod, raw: string) => {
    const nums = raw
      .split(/[\n\t,;]+/)
      .map(s => s.trim().replace(/\./g, "").replace(/\s/g, ""))
      .filter(Boolean)
      .map(Number)
    setDraft(d => {
      const ls = d.filter(r => r.Marginales === 1)
      return d.map(r => {
        const idx = ls.findIndex(l => l.id === r.id)
        if (idx === -1 || idx >= nums.length || !Number.isFinite(nums[idx])) return r
        return { ...r, values: { ...r.values, [period]: nums[idx] } }
      })
    })
    setPasteOpen(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Estratos del universo para <span className="font-medium">{country}</span>. Las reglas
          (<span className="font-mono">Expresion</span>, jerarquía) están bloqueadas; solo se editan
          los <span className="font-medium">marginales de población</span> por período.
        </p>
        <StatusPill errors={errors} dirty={diff.length} />
      </div>

      {/* Live reconciliation banner */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {reconciliation.map(r => (
          <div
            key={r.period}
            className={`rounded-lg border px-3 py-2 text-xs ${
              r.ok
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-medium">{r.period}</span>
              {r.ok ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
            <div className="mt-1 text-muted-foreground">
              Σ estratos: <span className="font-mono">{r.sum.toLocaleString("es")}</span>
            </div>
            {!r.ok && (
              <div className="font-mono text-destructive">
                Δ {r.delta > 0 ? "+" : ""}
                {r.delta.toLocaleString("es")}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3">
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Expresión
                </span>
              </th>
              {UNIVERSO_PERIODS.map(p => (
                <th key={p} className="px-3 py-3 text-right font-mono">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.map(r => {
              const isTotal = r.Marginales === 0
              return (
                <tr
                  key={r.id}
                  className={`border-b last:border-0 ${isTotal ? "bg-muted/30 font-medium" : "hover:bg-accent/30"}`}
                >
                  <td className="px-4 py-2">
                    <span style={{ paddingLeft: r.Jerarquia * 12 }} className="inline-block">
                      {r.Categoria}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">
                    {r.Expresion}
                  </td>
                  {UNIVERSO_PERIODS.map(p => (
                    <td key={p} className="px-2 py-1.5 text-right">
                      {isTotal ? (
                        <span className="px-2 font-mono text-xs">{r.values[p].toLocaleString("es")}</span>
                      ) : (
                        <Input
                          type="number"
                          value={r.values[p]}
                          onChange={e => setValue(r.id, p, Number(e.target.value))}
                          className="h-8 w-28 text-right font-mono text-xs"
                        />
                      )}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste className="h-4 w-4" />
          Pegar columna desde Excel
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={diff.length === 0} onClick={() => setDraft(clone(baseline))}>
            <RotateCcw className="h-4 w-4" />
            Descartar
          </Button>
          <Button size="sm" disabled={diff.length === 0} onClick={() => setReview(true)}>
            <Upload className="h-4 w-4" />
            Revisar y publicar
          </Button>
        </div>
      </div>

      <PasteDialog open={pasteOpen} onOpenChange={setPasteOpen} onApply={applyPaste} />

      <ReviewPublishDialog
        open={review}
        onOpenChange={setReview}
        target={`Universo · ${country}`}
        issues={issues}
        diff={diff}
        onPublish={() => setBaseline(clone(draft))}
      />
    </div>
  )
}

function PasteDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onApply: (p: UniversoPeriod, raw: string) => void
}) {
  const [period, setPeriod] = useState<UniversoPeriod>(UNIVERSO_PERIODS[0])
  const [raw, setRaw] = useState("")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pegar columna desde Excel</DialogTitle>
          <DialogDescription>
            Copia la columna de marginales en Excel y pégala aquí (un valor por línea, en el orden de
            los estratos). Se rellenará el período elegido.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Período destino</label>
            <Select value={period} onValueChange={v => setPeriod(v as UniversoPeriod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNIVERSO_PERIODS.map(p => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            value={raw}
            onChange={e => setRaw(e.target.value)}
            placeholder={"936000\n1248000\n1560000\n1872000\n624000"}
            className="h-40 font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!raw.trim()} onClick={() => onApply(period, raw)}>
            Aplicar al período
            <Badge variant="secondary" className="ml-1 font-mono">
              {period}
            </Badge>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

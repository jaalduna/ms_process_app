import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Loader2, Lock, Info, Upload, Download } from "lucide-react"
import { downloadUniversoExcel } from "./api"
import { useUniverso } from "./hooks"
import { UNIVERSO_PERIODS } from "./types"
import { UniversoUploadWizard } from "./UniversoUploadWizard"

/**
 * Universo — read-only table of the current versioned strata (JAA-576). The
 * Universo changes by uploading an Excel: subir → validar → previsualizar diff
 * → publicar a new version (JAA-583), via the wizard launched from here.
 */
export function UniversoTab({ pais, country }: { pais: string; country: string }) {
  const query = useUniverso(pais)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [template, setTemplate] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadUniversoExcel(pais, template)
      toast.success(
        template ? `Template vacío descargado (${country})` : `Excel con valores actuales descargado (${country})`,
      )
    } catch (err) {
      toast.error(`No se pudo descargar el Excel de Universo · ${country}`, {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setDownloading(false)
    }
  }

  if (query.isLoading)
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando Universo…
      </div>
    )

  if (query.isError)
    return (
      <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
        No se pudo cargar el Universo · {country}.
      </p>
    )

  const data = query.data!
  const periods = UNIVERSO_PERIODS

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Estratos del universo para <span className="font-medium">{country}</span> (versión publicada).
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 font-mono text-muted-foreground" data-testid="universo-version">
            v·{data.version.hash.slice(0, 8)} · {data.version.row_count} filas
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            data-testid="download-excel-btn"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar Excel
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
            <Switch
              checked={template}
              onCheckedChange={setTemplate}
              data-testid="download-template-toggle"
              aria-label="Descargar template vacío"
            />
            <span data-testid="download-mode-label">{template ? "Template vacío" : "Valores actuales"}</span>
          </label>
          <Button size="sm" data-testid="universo-upload-open" onClick={() => setWizardOpen(true)}>
            <Upload className="h-4 w-4" />
            Actualizar desde Excel
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 shrink-0" />
        ¿No conoces el formato? Usa <span className="font-medium">«Descargar Excel»</span> para bajar la
        plantilla o los valores actuales, complétalo y súbelo con{" "}
        <span className="font-medium">«Actualizar desde Excel»</span> — subir, validar, previsualizar el
        diff y publicar una versión nueva.
      </div>

      <UniversoUploadWizard pais={pais} country={country} open={wizardOpen} onOpenChange={setWizardOpen} />

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
              {periods.map((p) => (
                <th key={p} className="px-3 py-3 text-right font-mono">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, i) => {
              const isTotal = r.marginales === 0
              return (
                <tr key={i} className={`border-b last:border-0 ${isTotal ? "bg-muted/30 font-medium" : ""}`}>
                  <td className="px-4 py-2">
                    <span style={{ paddingLeft: (r.jerarquia ?? 0) * 12 }} className="inline-block">
                      {r.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px] text-muted-foreground">{r.expresion}</td>
                  {periods.map((p) => (
                    <td key={p} className="px-3 py-2 text-right font-mono text-xs">
                      {(r.marginales_por_periodo[p] ?? 0).toLocaleString("es")}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

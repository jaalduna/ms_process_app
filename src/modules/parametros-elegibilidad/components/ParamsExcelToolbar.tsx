import { useRef, useState } from "react"
import { toast } from "sonner"
import { Download, Upload, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { downloadParamsExcel, importParamsExcel, publishParams } from "../api"
import { mapImportResult, changedTables, type ReviewModel } from "../importMapping"
import { ReviewPublishDialog } from "./ReviewPublishDialog"
import type { ElegCountry, ImportResult } from "../types"

/**
 * JAA-628 — Excel round-trip toolbar for the eligibility-params editor.
 *
 * Export: "Descargar Excel" with a toggle for **valores actuales** vs
 * **template vacío** (`?template=true`) — streams the per-country workbook.
 *
 * Import: pick an `.xlsx` → POST /params/{country}/import → the backend returns
 * a validate-only preview (diff + errors per table). We map it into the existing
 * {@link ReviewPublishDialog} (the same trust gate the editor uses): errors block
 * publish; a clean upload publishes every changed table via the existing
 * per-table publish endpoint. The frontend never revalidates the contract.
 */
export function ParamsExcelToolbar({ country }: { country: ElegCountry }) {
  const [template, setTemplate] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [importing, setImporting] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [review, setReview] = useState<ReviewModel>({ issues: [], diff: [] })
  const [imported, setImported] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      await downloadParamsExcel(country, template)
      toast.success(
        template ? `Template vacío descargado (${country})` : `Excel con valores actuales descargado (${country})`,
      )
    } catch (err) {
      toast.error(`No se pudo descargar el Excel de ${country}`, {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setDownloading(false)
    }
  }

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // allow re-importing the same filename twice
    e.target.value = ""
    if (!file) return
    setImporting(true)
    try {
      const result = await importParamsExcel(country, file)
      setImported(result)
      setReview(mapImportResult(result))
      setDialogOpen(true)
    } catch (err) {
      toast.error(`No se pudo importar ${file.name}`, {
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setImporting(false)
    }
  }

  const handlePublish = async () => {
    if (!imported) return
    const changed = changedTables(imported)
    for (const tbl of changed) {
      await publishParams(tbl.table, country, tbl.rows)
    }
    toast.success(`Publicado desde Excel: ${changed.length} tabla(s) · ${country}`)
  }

  return (
    <div className="flex flex-wrap items-end gap-4" data-testid="params-excel-toolbar">
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-muted-foreground">Excel</span>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
            data-testid="download-excel-btn"
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            data-testid="import-excel-btn"
          >
            {importing ? <Loader2 className="animate-spin" /> : <Upload />}
            Importar Excel
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            data-testid="import-excel-input"
            onChange={handleFilePicked}
          />
        </div>
      </div>

      <ReviewPublishDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        target={`Importación Excel · ${country}`}
        issues={review.issues}
        diff={review.diff}
        onPublish={handlePublish}
      />
    </div>
  )
}

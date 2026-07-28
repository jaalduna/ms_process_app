import { useRef, useState } from "react"
import { DatabaseZap, FileSpreadsheet, Loader2, Upload, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateMacrocacRun, useUploadMacrocac } from "../hooks"
import { MacrocacApiError, MACROCAC_COUNTRIES, MACROCAC_TABLES } from "../types"
import type { MacrocacRun, MacrocacRunError, MacrocacUpload, MacrocacUploadError } from "../types"

/**
 * MacrocacPage — MVP form (JAA-1051) for the on-demand correction flow: pick
 * a target tabla/país, upload the corrections `.xlsx`, then trigger a
 * dry-run against the mock contract (JAA-1048, docs/design/macrocac-api-contract.md).
 * The run list/polling (JAA-1053) is out of scope — this only shows the run
 * created here.
 */
export function MacrocacPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tabla, setTabla] = useState<string>(MACROCAC_TABLES[0])
  const [pais, setPais] = useState<string>(MACROCAC_COUNTRIES[0])
  const [motivo, setMotivo] = useState("")
  const [upload, setUpload] = useState<MacrocacUpload | null>(null)
  const [run, setRun] = useState<MacrocacRun | null>(null)

  const uploadMutation = useUploadMacrocac()
  const runMutation = useCreateMacrocacRun()

  const uploadError = uploadMutation.error instanceof MacrocacApiError ? uploadMutation.error : null
  const runError = runMutation.error instanceof MacrocacApiError ? runMutation.error : null

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUpload(null)
    setRun(null)
    runMutation.reset()
    uploadMutation.mutate(
      { pais, tabla, motivo, file },
      {
        onSuccess: (data) => setUpload(data),
        onError: () => resetFileInput(),
      },
    )
  }

  const handleRemoveUpload = () => {
    setUpload(null)
    setRun(null)
    uploadMutation.reset()
    runMutation.reset()
    resetFileInput()
  }

  const handleEjecutar = () => {
    if (!upload) return
    runMutation.mutate(upload.upload_id, {
      onSuccess: (data) => setRun(data),
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Macrocac</h1>
        <p className="text-sm text-muted-foreground">
          Correcciones puntuales sobre tablas productivas. Sube el Excel de correcciones y ejecuta un dry-run
          antes de aplicar nada.
        </p>
      </div>

      <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Tabla</span>
            <Select value={tabla} onValueChange={setTabla}>
              <SelectTrigger className="w-full" aria-label="Tabla" data-testid="macrocac-tabla-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MACROCAC_TABLES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-sm font-medium">País</span>
            <Select value={pais} onValueChange={setPais}>
              <SelectTrigger className="w-full" aria-label="País" data-testid="macrocac-pais-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MACROCAC_COUNTRIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="macrocac-motivo" className="text-sm font-medium">
            Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input
            id="macrocac-motivo"
            data-testid="macrocac-motivo-input"
            placeholder="Ej: corrección de campos mal capturados en el operativo de campo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium">Excel de correcciones</span>

          {upload ? (
            <div
              className="flex items-center gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm"
              data-testid="macrocac-upload-chip"
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="truncate font-medium">{upload.filename}</span>
              <span className="text-xs text-muted-foreground">
                {upload.filas} filas · {upload.columnas.length} columnas
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto text-muted-foreground hover:text-destructive"
                aria-label="Quitar archivo"
                data-testid="macrocac-upload-remove"
                onClick={handleRemoveUpload}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-5 transition-colors hover:border-muted-foreground/50"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter") fileInputRef.current?.click()
              }}
              role="button"
              tabIndex={0}
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-6 w-6 text-muted-foreground" />
              )}
              <span className="text-center text-xs text-muted-foreground">
                {uploadMutation.isPending ? "Subiendo…" : "Arrastra el .xlsx o haz clic para seleccionar"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                data-testid="macrocac-file-input"
                onChange={handleFile}
                disabled={uploadMutation.isPending}
              />
            </div>
          )}

          {uploadError && <UploadErrorDetail error={uploadError.body} />}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            {upload
              ? "Listo para ejecutar el dry-run."
              : "Sube un archivo válido para habilitar la ejecución."}
          </span>
          <Button
            data-testid="macrocac-ejecutar"
            disabled={!upload || runMutation.isPending}
            onClick={handleEjecutar}
          >
            {runMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />}
            Ejecutar (dry-run)
          </Button>
        </div>

        {run && (
          <div
            className="flex items-center gap-2 rounded-lg border border-blue-600/30 bg-blue-600/5 px-3 py-2 text-sm"
            data-testid="macrocac-run-status"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
            <span>
              Run <span className="font-mono">{run.run_id}</span> — {run.status}
            </span>
          </div>
        )}

        {runError && <RunErrorDetail error={runError.body} />}
      </div>
    </div>
  )
}

function UploadErrorDetail({ error }: { error: MacrocacUploadError }) {
  if (error.error === "missing_columns") {
    return (
      <div
        className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        data-testid="macrocac-missing-columns"
      >
        <div className="flex items-center gap-2 font-medium">
          <XCircle className="h-4 w-4 shrink-0" />
          Faltan columnas obligatorias
        </div>
        <p>{error.missing_columns.join(", ")}</p>
      </div>
    )
  }
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      data-testid="macrocac-upload-error"
    >
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error.message}</span>
    </div>
  )
}

function RunErrorDetail({ error }: { error: MacrocacRunError }) {
  if (error.error === "run_in_progress") {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-sm text-amber-700"
        data-testid="macrocac-run-conflict"
      >
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {error.message} Run activo: <span className="font-mono">{error.run_id}</span>
        </span>
      </div>
    )
  }
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      data-testid="macrocac-run-error"
    >
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error.message}</span>
    </div>
  )
}

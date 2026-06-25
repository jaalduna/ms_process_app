import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
  Pencil,
} from "lucide-react"
import { useUploadUniverso, usePublishUniverso } from "./hooks"
import type { ServerValidationError, UniversoUploadResponse } from "./types"

/**
 * UniversoUploadWizard — subir .xlsx → validar → previsualizar diff → publicar
 * (JAA-583), contra POST /weighting/params/{pais}/universo/{upload,publish}
 * (contrato JAA-580). Reemplaza la edición a mano del Excel del Universo: la
 * validación vive en el backend, el diff se muestra antes de escribir nada y
 * "Publicar" queda bloqueado mientras la carga sea inválida.
 */
export function UniversoUploadWizard({
  pais,
  country,
  open,
  onOpenChange,
}: {
  pais: string
  country: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<UniversoUploadResponse | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const upload = useUploadUniverso(pais)
  const publish = usePublishUniverso(pais)

  const reset = () => {
    setResult(null)
    setFileName(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    upload.mutate(file, {
      onSuccess: (data) => setResult(data),
      onError: () => {
        toast.error("Error al subir el Excel del Universo")
        setFileName(null)
      },
    })
  }

  const handlePublish = () => {
    if (!result?.upload_token) return
    publish.mutate(result.upload_token, {
      onSuccess: (data) => {
        toast.success(`Universo · ${country} publicado`, {
          description: `Nueva versión v${data.version.version} · ${data.row_count} filas.`,
        })
        handleOpenChange(false)
      },
      onError: () => toast.error("No se pudo publicar el Universo"),
    })
  }

  const canPublish = !!result?.valid && !!result.upload_token
  const isInvalid = result != null && !result.valid

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="universo-upload-dialog">
        <DialogHeader>
          <DialogTitle>Actualizar Universo desde Excel — {country}</DialogTitle>
          <DialogDescription>
            Sube el <span className="font-mono">.xlsx</span> del Universo. Se valida y se previsualiza
            el diff antes de publicar; nada se escribe hasta que confirmes.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {/* 1. Drop zone */}
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-5 transition-colors hover:border-muted-foreground/50"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter") fileInputRef.current?.click()
            }}
            role="button"
            tabIndex={0}
          >
            {upload.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : fileName ? (
              <FileSpreadsheet className="h-6 w-6 text-emerald-600" />
            ) : (
              <Upload className="h-6 w-6 text-muted-foreground" />
            )}
            <span className="text-center text-xs text-muted-foreground">
              {upload.isPending
                ? "Validando…"
                : fileName
                  ? fileName
                  : "Arrastra el Universo.xlsx o haz clic para seleccionar"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              data-testid="universo-file-input"
              onChange={handleFile}
              disabled={upload.isPending}
            />
          </div>

          {/* 2. Invalid → row/column errors */}
          {isInvalid && (
            <section className="space-y-2" data-testid="universo-upload-errors">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">Validación</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
                  <XCircle className="h-3 w-3" />
                  {result!.errors.length} error{result!.errors.length !== 1 && "es"}
                </span>
              </div>
              <ul className="space-y-1.5">
                {result!.errors.map((err, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  >
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      <span className="font-mono text-xs font-medium">{locationOf(err)}</span> — {err.message}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Corrige el Excel y vuelve a subirlo. No se publicará mientras haya errores.
              </p>
            </section>
          )}

          {/* 3. Valid → preview diff */}
          {result?.valid && (
            <section className="space-y-2" data-testid="universo-preview">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">Previsualización del cambio</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">
                  <CheckCircle2 className="h-3 w-3" />
                  Válido
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <PreviewStat
                  label="Agregadas"
                  value={result.preview.added}
                  testid="preview-added"
                  icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
                />
                <PreviewStat
                  label="Eliminadas"
                  value={result.preview.removed}
                  testid="preview-removed"
                  icon={<ArrowDownRight className="h-4 w-4 text-destructive" />}
                />
                <PreviewStat
                  label="Modificadas"
                  value={result.preview.changed}
                  testid="preview-changed"
                  icon={<Pencil className="h-4 w-4 text-amber-600" />}
                />
              </div>
            </section>
          )}
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {isInvalid
              ? "Carga inválida — corrige el Excel para habilitar la publicación."
              : canPublish
                ? "Listo para publicar la nueva versión."
                : "Sube un archivo para previsualizar el cambio."}
          </span>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              data-testid="universo-publish"
              disabled={!canPublish || publish.isPending}
              onClick={handlePublish}
            >
              {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Publicar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewStat({
  label,
  value,
  testid,
  icon,
}: {
  label: string
  value: number
  testid: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2 text-center shadow-sm" data-testid={testid}>
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className="font-mono text-lg font-semibold">{value}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

/** Human label for a structured validation error: "fila N · columna" or just
 *  the field when the error is not row-scoped. */
function locationOf(err: ServerValidationError): string {
  return err.row != null ? `fila ${err.row + 1} · ${err.field}` : err.field
}

import { useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  DatabaseZap,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  useCreateMacrocacRun,
  useDownloadPlantilla,
  useDownloadReporte,
  useMacrocacRun,
  useMotivos,
  useTablas,
  useUploadMacrocac,
  useVistaPrevia,
} from "../hooks"
import {
  esProduccion,
  MacrocacApiError,
  MACROCAC_COUNTRIES,
  MACROCAC_COUNTRY_LABELS,
  motivoCambioLabel,
  verificarFormato,
} from "../types"
import type {
  MacrocacFormatoCheck,
  MacrocacMotivoResumen,
  MacrocacRun,
  MacrocacRunError,
  MacrocacUpload,
  MacrocacUploadError,
  MacrocacVistaPreviaError,
  MacrocacVistaPreviaItem,
} from "../types"

/** Bolivia: es donde viven las tablas de prueba con las que se está validando. */
const PAIS_POR_DEFECTO = "BO"

/**
 * MacrocacPage — flujo de correcciones puntuales: elegir país/tabla y motivo,
 * subir el Excel, verificar su formato, confirmar, aplicar y descargar el
 * reporte que genera el motor.
 *
 * El país va primero porque manda: la lista de tablas sale de la base de ese
 * país (`GET /macrocac/tablas`). Antes la tabla era una constante del frontend
 * y había que fijar el país a mano para no ofrecer un par imposible; ahora el
 * par imposible no existe, porque una tabla solo aparece si está en esa base.
 */
export function MacrocacPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [tabla, setTabla] = useState<string>("")
  const [pais, setPais] = useState<string>(PAIS_POR_DEFECTO)
  const [motivoCambio, setMotivoCambio] = useState<string>("")
  const [auxiliar, setAuxiliar] = useState("")
  const [archivoPendiente, setArchivoPendiente] = useState<File | null>(null)
  const [upload, setUpload] = useState<MacrocacUpload | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [archivoRechazado, setArchivoRechazado] = useState<string | null>(null)

  const uploadMutation = useUploadMacrocac()
  const runMutation = useCreateMacrocacRun()
  const downloadMutation = useDownloadReporte()
  const descargarPlantilla = useDownloadPlantilla()
  const runQuery = useMacrocacRun(runId)

  // El run que se muestra: el poll manda en cuanto responde, porque el POST solo
  // devuelve el estado inicial ("running").
  const run: MacrocacRun | null = runQuery.data ?? runMutation.data ?? null

  const uploadError = uploadMutation.error instanceof MacrocacApiError ? uploadMutation.error : null
  const runError = runMutation.error instanceof MacrocacApiError ? runMutation.error : null
  const downloadError =
    downloadMutation.error instanceof MacrocacApiError ? downloadMutation.error : null

  // Tablas de la base del país, expandidas desde los patrones de la planilla.
  const tablasQuery = useTablas(pais)
  const tablas = useMemo(() => tablasQuery.data?.items ?? [], [tablasQuery.data])

  // Elección por defecto: la primera copia de trabajo (`Test*`). Se deriva en vez de
  // guardarse por efecto, así el formulario nunca muestra una tabla que no está
  // en la base del país elegido (aunque sea por un render).
  const tablaEfectiva = useMemo(() => {
    if (tablas.some((t) => t.tabla === tabla)) return tabla
    return tablas.find((t) => !esProduccion(t.tabla))?.tabla ?? tablas[0]?.tabla ?? ""
  }, [tablas, tabla])

  const sandbox = tablaEfectiva !== "" && !esProduccion(tablaEfectiva)

  // El nombre de la tabla es el dato. La base solo se muestra cuando hay más de
  // una en juego: repetir "BO_KWP" en cada fila no desambigua nada y le come
  // ancho justamente al nombre, que es lo que hay que leer.
  const opcionesTabla = useMemo(() => {
    const variasBases = new Set(tablas.map((t) => t.base)).size > 1
    return tablas.map((t) => ({
      value: t.tabla,
      label: t.tabla,
      hint: variasBases ? t.base : undefined,
    }))
  }, [tablas])

  const tablasError =
    tablasQuery.error instanceof MacrocacApiError ? tablasQuery.error : null
  const tablaPlaceholder = tablasQuery.isPending
    ? "Cargando tablas…"
    : tablasError
      ? "No disponible"
      : opcionesTabla.length === 0
        ? "Sin tablas para este país"
        : "Selecciona una tabla"

  // Catálogo de motivos del país elegido (cacheado en el backend y acá).
  const motivosQuery = useMotivos(pais)

  const formato: MacrocacFormatoCheck | null = useMemo(
    () => (upload ? verificarFormato(upload.columnas, upload.filas_sin_motivo) : null),
    [upload],
  )

  const resetFileInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const limpiarResultado = () => {
    setUpload(null)
    setRunId(null)
    runMutation.reset()
    downloadMutation.reset()
  }

  const subir = (file: File, motivo: string) => {
    uploadMutation.mutate(
      { pais, tabla: tablaEfectiva, motivo: motivo || undefined, auxiliar, file },
      {
        onSuccess: (data) => setUpload(data),
        onError: () => resetFileInput(),
      },
    )
  }

  /**
   * El archivo se sube apenas se elige, con o sin motivo de formulario: desde
   * JAA-1110 el motivo manda por fila, y el backend solo lo exige si alguna
   * celda viene vacía. Si lo exige responde `motivo_requerido`, y elegir el
   * motivo reintenta la subida sola (ver handleMotivoChange).
   */
  const procesarArchivo = (file: File) => {
    // El `accept` del input filtra el diálogo, pero no lo que se arrastra.
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setArchivoRechazado(file.name)
      return
    }
    setArchivoRechazado(null)
    limpiarResultado()
    setArchivoPendiente(file)
    subir(file, motivoCambio)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  // Sin tabla destino no hay adónde subir el archivo.
  const subidaDeshabilitada = uploadMutation.isPending || tablaEfectiva === ""

  /**
   * QA 2026-09 (Jorge): el recuadro decía "Arrastra el .xlsx" pero no tenía
   * handlers de drop, así que soltar el archivo no hacía nada (o el navegador
   * lo abría). `preventDefault` en dragover es lo que habilita el drop.
   */
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = subidaDeshabilitada ? "none" : "copy"
    if (!subidaDeshabilitada) setArrastrando(true)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setArrastrando(false)
    if (subidaDeshabilitada) return
    const file = e.dataTransfer.files?.[0]
    if (file) procesarArchivo(file)
  }

  const handleMotivoChange = (motivo: string) => {
    setMotivoCambio(motivo)
    // Reintento: el archivo ya está elegido y el backend lo rechazó por filas
    // sin motivo. El usuario no debería tener que volver a seleccionarlo.
    if (archivoPendiente && !upload) subir(archivoPendiente, motivo)
  }

  const motivos = motivosQuery.data?.items ?? []
  const motivosPlaceholder = motivosQuery.isPending
    ? "Cargando motivos…"
    : motivos.length === 0
      ? "Catálogo no disponible"
      : "Selecciona un motivo"

  const handleRemoveUpload = () => {
    limpiarResultado()
    setArchivoPendiente(null)
    uploadMutation.reset()
    resetFileInput()
  }

  const handleConfirmar = () => {
    if (!upload) return
    setConfirmOpen(false)
    runMutation.mutate(upload.upload_id, {
      onSuccess: (data) => setRunId(data.run_id),
    })
  }

  const puedeAplicar = upload !== null && formato?.ok === true && !runMutation.isPending
  const enCurso = run !== null && run.status === "running"
  const exitoso = run?.status === "succeeded"

  return (
    <div className="space-y-6">
      {/* En wp-pythoncac-app el título lo pone el AppShell (la app tiene una
          sola vista); acá cada módulo rinde el suyo, como los hermanos. */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">PythonCac</h1>
        <p className="text-muted-foreground max-w-xl text-sm">
          Correcciones puntuales sobre tablas de compras. Sube el Excel de correcciones, revisa el
          formato detectado y aplica los cambios; al terminar puedes descargar el reporte.
        </p>
      </div>

      <div className="max-w-xl space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-1.5 sm:max-w-56">
            <span className="text-sm font-medium">País</span>
            <Select value={pais} onValueChange={setPais}>
              <SelectTrigger className="w-full" aria-label="País" data-testid="macrocac-pais-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* El value sigue siendo el código (es lo que espera el backend);
                    lo que se muestra es el nombre del país. */}
                {/* El nombre ocupa el resto del ancho para que los códigos queden en
                    una columna recta: la lista se escanea por código. El
                    `*:[span]:last:flex-1` es para
                    el `ItemText` con que shadcn envuelve los children, que si no ajusta
                    al contenido y deja los códigos en zigzag. */}
                {MACROCAC_COUNTRIES.map((p) => (
                  <SelectItem key={p} value={p} className="*:[span]:last:flex-1">
                    <span className="flex-1">{MACROCAC_COUNTRY_LABELS[p]}</span>
                    <span className="text-muted-foreground font-mono text-xs">{p}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Fila completa, no media: `Test_J_atoscompra_new_Pythoncac`
              no entra en media columna ni cerrado ni desplegado. */}
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Tabla</span>
            <Combobox
              value={tablaEfectiva}
              onValueChange={setTabla}
              options={opcionesTabla}
              aria-label="Tabla"
              data-testid="macrocac-tabla-combobox"
              disabled={tablasQuery.isPending || opcionesTabla.length === 0}
              placeholder={tablaPlaceholder}
              searchPlaceholder="Escribe para filtrar…"
              emptyMessage="Ninguna tabla coincide"
            />
          </div>
        </div>

        {tablasError ? (
          <div
            className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            data-testid="macrocac-tablas-error"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No se pudo listar las tablas de {pais}: {tablasError.body.message} Sin esa lista no se
              puede elegir destino.
            </span>
          </div>
        ) : null}

        {!tablasError && !tablasQuery.isPending && opcionesTabla.length === 0 ? (
          <p className="text-muted-foreground text-xs" data-testid="macrocac-tablas-vacio">
            Ninguna tabla de {pais} coincide con los patrones configurados. Se consultaron:{" "}
            <span className="font-mono">
              {(tablasQuery.data?.patrones ?? []).map((p) => p.patron).join(", ") || "—"}
            </span>
            .
          </p>
        ) : null}

        {tablaEfectiva === "" ? null : sandbox ? (
          <p className="text-muted-foreground text-xs" data-testid="macrocac-sandbox-hint">
            Copia de trabajo (<span className="font-mono">Test*</span>): los cambios no tocan la
            tabla productiva.
          </p>
        ) : (
          <div
            className="flex items-start gap-2 rounded-lg border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-sm text-amber-700"
            data-testid="macrocac-produccion-warning"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Tabla productiva. Los cambios se escriben de verdad sobre las compras del panel.
            </span>
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-sm font-medium">
            Motivo por defecto{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          {/* JAA-1110: el motivo lo trae cada fila del Excel. Este solo cubre
              las filas que dejen la celda vacía, así que el rótulo tiene que
              decir eso — antes decía "Motivo del cambio" y se leía como si
              pisara al archivo. */}
          <p className="text-muted-foreground text-xs" data-testid="macrocac-motivo-ayuda">
            Se usa solo en las filas cuya columna <code>MotivoCambio</code> venga vacía. Si el
            archivo trae motivo en todas, no hace falta. En el Excel puedes escribir el número o
            el nombre exacto del motivo.
          </p>
          <Select
            value={motivoCambio}
            onValueChange={handleMotivoChange}
            disabled={motivos.length === 0}
          >
            <SelectTrigger
              className="w-full"
              aria-label="Motivo por defecto"
              data-testid="macrocac-motivo-select"
            >
              <SelectValue placeholder={motivosPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {/* El número (Flg_Motivo del catálogo) es el que usa el equipo para
                  referirse al motivo ("el 3"), así que se muestra junto al texto. */}
              {motivos.map((m) => (
                <SelectItem
                  key={m.flg_motivo}
                  value={m.descricao}
                  className="*:[span]:last:flex-1"
                >
                  <span className="text-muted-foreground font-mono text-xs">{m.flg_motivo}.-</span>
                  <span className="flex-1">{m.descricao}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {motivosQuery.isError && (
            <p
              className="text-destructive text-xs"
              role="alert"
              data-testid="macrocac-motivos-error"
            >
              No se pudo leer el catálogo de motivos (A_FlgMotivo) para {pais}. Sin él no se
              puede subir el archivo: no hay contra qué validar los motivos de las filas.
            </p>
          )}
          {motivosQuery.data?.stale && (
            <p
              className="text-muted-foreground text-xs"
              role="status"
              data-testid="macrocac-motivos-stale"
            >
              Catálogo servido desde caché: no se pudo refrescar contra SQL.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="macrocac-auxiliar" className="text-sm font-medium">
            Auxiliar{" "}
            <span className="font-normal text-muted-foreground">(detalle adicional por defecto)</span>{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <Input
            id="macrocac-auxiliar"
            data-testid="macrocac-auxiliar-input"
            placeholder="Ej: ticket JAA-1234, contexto del ajuste"
            value={auxiliar}
            onChange={(e) => setAuxiliar(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">Excel de correcciones</span>
            {/* La plantilla vive al lado del campo que hay que llenar: es donde
                el usuario se da cuenta de que no sabe qué formato usar. */}
            <button
              type="button"
              onClick={() => descargarPlantilla.mutate()}
              disabled={descargarPlantilla.isPending}
              className="text-primary inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
              data-testid="macrocac-descargar-plantilla"
            >
              <FileDown className="h-3.5 w-3.5" />
              Descargar plantilla
            </button>
          </div>

          {descargarPlantilla.isError && (
            <p className="text-destructive text-xs" role="alert">
              No se pudo descargar la plantilla. Reintenta; si insiste, vuelve a
              iniciar sesión.
            </p>
          )}

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
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-5 transition-colors ${
                arrastrando
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              }`}
              data-testid="macrocac-dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={() => setArrastrando(false)}
              onDrop={handleDrop}
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
                {uploadMutation.isPending
                  ? "Subiendo…"
                  : archivoPendiente
                    ? archivoPendiente.name
                    : "Arrastra el .xlsx o haz clic para seleccionar"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                data-testid="macrocac-file-input"
                onChange={handleFile}
                disabled={subidaDeshabilitada}
              />
            </div>
          )}

          {archivoRechazado && (
            <p className="text-destructive text-xs" role="alert" data-testid="macrocac-archivo-rechazado">
              <span className="font-mono">{archivoRechazado}</span> no es un .xlsx. Sube el Excel
              de correcciones.
            </p>
          )}
          {uploadError && <UploadErrorDetail error={uploadError.body} />}
          {upload && <MotivosResumen upload={upload} />}
          {formato && <FormatoDetail check={formato} />}
          {upload && formato?.ok && <VistaPrevia key={upload.upload_id} uploadId={upload.upload_id} />}
        </div>

        <div className="flex items-center justify-between border-t border-border pt-4">
          <span className="text-xs text-muted-foreground">
            {upload ? "Listo para aplicar los cambios." : "Sube un archivo válido para habilitar la ejecución."}
          </span>
          <Button
            data-testid="macrocac-aplicar"
            disabled={!puedeAplicar}
            onClick={() => setConfirmOpen(true)}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DatabaseZap className="h-4 w-4" />
            )}
            Aplicar cambios
          </Button>
        </div>

        {run && (
          <RunStatus
            run={run}
            enCurso={enCurso}
            exitoso={exitoso}
            descargando={downloadMutation.isPending}
            onDescargar={() => downloadMutation.mutate({ runId: run.run_id, pais: run.pais })}
          />
        )}

        {runError && <RunErrorDetail error={runError.body} />}
        {downloadError && (
          <div
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            data-testid="macrocac-download-error"
          >
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>No se pudo descargar el reporte. {downloadError.body.message}</span>
          </div>
        )}
      </div>

      <ConfirmacionDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        sandbox={sandbox}
        tabla={tablaEfectiva}
        pais={pais}
        motivosResumen={upload?.motivos_resumen ?? []}
        auxiliar={auxiliar}
        filasConAuxiliar={upload?.filas_con_auxiliar ?? 0}
        filas={upload?.filas ?? 0}
        onConfirmar={handleConfirmar}
      />
    </div>
  )
}

/**
 * "5.- Calibración". El id lo resuelve el backend contra `A_FlgMotivo` al subir
 * el archivo, así que la etiqueta no depende de tener el catálogo cargado acá.
 */
function etiquetaResumen(r: MacrocacMotivoResumen): string {
  return motivoCambioLabel({ flg_motivo: r.flg_motivo, descricao: r.motivo })
}

/**
 * Desglose de motivos detectados en el archivo (JAA-1110).
 *
 * Es la señal de que la app entendió el archivo: con motivos por fila, ver "3
 * motivos en 14 filas" es lo que separa un lote bien armado de uno donde media
 * planilla quedó con el motivo equivocado.
 */
function MotivosResumen({ upload }: { upload: MacrocacUpload }) {
  const resumen = upload.motivos_resumen
  if (resumen.length === 0) return null

  const distintos = new Set(resumen.map((r) => r.flg_motivo)).size
  return (
    <div
      className="space-y-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
      data-testid="macrocac-motivos-resumen"
    >
      <div className="font-medium">
        {distintos === 1 ? "1 motivo" : `${distintos} motivos`} en {upload.filas}{" "}
        {upload.filas === 1 ? "fila" : "filas"}
      </div>
      <ul className="text-muted-foreground space-y-0.5 text-xs">
        {resumen.map((r) => (
          <li key={`${r.flg_motivo}-${r.desde_formulario}`}>
            {etiquetaResumen(r)} ({r.filas})
            {r.desde_formulario && " — por defecto, esas filas no traen motivo"}
          </li>
        ))}
      </ul>
      {upload.filas_con_auxiliar > 0 && (
        <p className="text-muted-foreground text-xs" data-testid="macrocac-detalle-propio">
          {upload.filas_con_auxiliar}{" "}
          {upload.filas_con_auxiliar === 1 ? "fila trae" : "filas traen"} su propio detalle
          (Auxiliar); en esas no se usa el del formulario.
        </p>
      )}
    </div>
  )
}

/**
 * Confirmación antes de aplicar. Repite en seco lo que va a pasar — destino,
 * país, filas y motivos — porque una vez aplicado no hay vuelta atrás sobre la
 * tabla productiva.
 */
function ConfirmacionDialog({
  open,
  onOpenChange,
  sandbox,
  tabla,
  pais,
  motivosResumen,
  auxiliar,
  filasConAuxiliar,
  filas,
  onConfirmar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sandbox: boolean
  tabla: string
  pais: string
  /** JAA-1110 — el archivo puede traer varios motivos; se listan todos. */
  motivosResumen: MacrocacMotivoResumen[]
  auxiliar: string
  filasConAuxiliar: number
  filas: number
  onConfirmar: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="macrocac-confirm-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar aplicación de cambios</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Se van a aplicar <strong>{filas}</strong>{" "}
                {filas === 1 ? "corrección" : "correcciones"} sobre:
              </p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Tabla</dt>
                <dd className="font-mono">{tabla}</dd>
                <dt className="text-muted-foreground">País</dt>
                <dd className="font-mono">{pais}</dd>
                <dt className="text-muted-foreground">
                  {motivosResumen.length === 1 ? "Motivo" : "Motivos"}
                </dt>
                <dd data-testid="macrocac-confirm-motivos">
                  <ul className="space-y-0.5">
                    {motivosResumen.map((r) => (
                      <li key={`${r.flg_motivo}-${r.desde_formulario}`}>
                        {etiquetaResumen(r)}{" "}
                        <span className="text-muted-foreground">
                          ({r.filas} {r.filas === 1 ? "fila" : "filas"}
                          {r.desde_formulario && ", por defecto"})
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
                {auxiliar.trim() !== "" && (
                  <>
                    <dt className="text-muted-foreground">Detalle</dt>
                    <dd>
                      {auxiliar}
                      {filasConAuxiliar > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          — no aplica a las {filasConAuxiliar} filas con detalle propio
                        </span>
                      )}
                    </dd>
                  </>
                )}
              </dl>
              {sandbox ? (
                <p className="text-muted-foreground">
                  Es la tabla de pruebas, no afecta datos productivos.
                </p>
              ) : (
                <p className="font-medium text-amber-700" data-testid="macrocac-confirm-produccion">
                  Esta es la tabla productiva. Los cambios quedan escritos en las compras del
                  panel y no se pueden deshacer desde la aplicación.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="macrocac-confirm-cancelar">Cancelar</AlertDialogCancel>
          <AlertDialogAction data-testid="macrocac-confirm-aceptar" onClick={onConfirmar}>
            Aplicar cambios
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Estado del run, y la descarga del reporte cuando termina bien. */
function RunStatus({
  run,
  enCurso,
  exitoso,
  descargando,
  onDescargar,
}: {
  run: MacrocacRun
  enCurso: boolean
  exitoso: boolean
  descargando: boolean
  onDescargar: () => void
}) {
  if (enCurso) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-blue-600/30 bg-blue-600/5 px-3 py-2 text-sm"
        data-testid="macrocac-run-status"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
        <span>
          Run <span className="font-mono">{run.run_id}</span> — aplicando cambios…
        </span>
      </div>
    )
  }

  if (exitoso) {
    const filas = run.resultado_lote ?? []
    const conError = filas.filter((f) => !f.ok).length
    return (
      <div
        className="space-y-2 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm"
        data-testid="macrocac-run-status"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>
            Cambios aplicados — {filas.length} {filas.length === 1 ? "fila" : "filas"}
            {conError > 0 && `, ${conError} con error`}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          data-testid="macrocac-descargar-reporte"
          disabled={descargando}
          onClick={onDescargar}
        >
          {descargando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Descargar reporte
        </Button>
      </div>
    )
  }

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
      data-testid="macrocac-run-status"
    >
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>La ejecución falló. {run.error_message ?? ""}</span>
    </div>
  )
}

/** Columnas de contexto que se muestran siempre, en este orden. */
const CONTEXTO_VISTA: { col: string; label: string }[] = [
  { col: "IdDomicilio", label: "Hogar" },
  { col: "Data_Compra", label: "Fecha" },
  { col: "IdArtigo", label: "Artículo" },
  { col: "IdProduto", label: "Producto" },
  { col: "IdCanal", label: "Canal" },
]

const ACCION_LABEL: Record<string, string> = {
  M: "Modificar",
  E: "Eliminar",
  X: "Excluir",
}

function fmt(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v)
}

/**
 * Vista previa del lote (QA 2026-09, Jorge): los actos que se van a tocar, con
 * su estado actual en la tabla destino y el valor que pide el Excel.
 *
 * Se abre a pedido porque consulta el SQL del país. No simula el motor: los
 * recálculos derivados (COEF, VALUE_PM, Semana…) salen en el reporte del run.
 */
function VistaPrevia({ uploadId }: { uploadId: string }) {
  const [abierta, setAbierta] = useState(false)
  const query = useVistaPrevia(uploadId, abierta)
  const error = query.error instanceof MacrocacApiError
    ? (query.error.body as MacrocacVistaPreviaError)
    : null

  return (
    <div className="rounded-lg border border-border text-sm" data-testid="macrocac-vista-previa">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        data-testid="macrocac-vista-previa-toggle"
      >
        {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Eye className="h-4 w-4 text-muted-foreground" />
        Ver actos a modificar
        {query.data && (
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {query.data.total} {query.data.total === 1 ? "acto" : "actos"}
            {query.data.no_encontrados > 0 && ` · ${query.data.no_encontrados} no encontrados`}
          </span>
        )}
      </button>

      {abierta && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {query.isPending && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo los actos en la tabla destino…
            </p>
          )}
          {query.isError && (
            <p className="text-destructive text-xs" role="alert" data-testid="macrocac-vista-previa-error">
              No se pudo leer la vista previa. {error?.message ?? ""}
            </p>
          )}
          {query.data && (
            <>
              <p className="text-muted-foreground text-xs">
                Estado actual en <span className="font-mono">{query.data.tabla}</span> y el valor
                pedido. Los recálculos (COEF, VALUE_PM, semana…) los hace el motor al aplicar y
                salen en el reporte.
                {query.data.mostrados < query.data.total &&
                  ` Se muestran los primeros ${query.data.mostrados} de ${query.data.total}.`}
              </p>
              <div className="max-h-80 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs" data-testid="macrocac-vista-previa-tabla">
                  <thead className="sticky top-0 bg-muted text-left">
                    <tr>
                      <th className="px-2 py-1 font-medium">IdAto</th>
                      <th className="px-2 py-1 font-medium">Acción</th>
                      {/* Cambios va antes del contexto: es lo que hay que revisar,
                          y la tabla no cabe entera en el ancho de la tarjeta. */}
                      <th className="px-2 py-1 font-medium">Cambios</th>
                      {CONTEXTO_VISTA.map((c) => (
                        <th key={c.col} className="px-2 py-1 font-medium">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {query.data.items.map((item) => (
                      <FilaVistaPrevia key={item.IdAto} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FilaVistaPrevia({ item }: { item: MacrocacVistaPreviaItem }) {
  const accion = ACCION_LABEL[item.flg] ?? item.flg
  if (!item.encontrado || item.actual === null) {
    return (
      <tr className="border-t border-border text-destructive" data-testid="macrocac-vista-previa-fila">
        <td className="px-2 py-1 font-mono">{item.IdAto}</td>
        <td className="px-2 py-1">{accion}</td>
        <td className="px-2 py-1" colSpan={CONTEXTO_VISTA.length + 1}>
          No existe en la tabla destino; el motor lo rechazará.
        </td>
      </tr>
    )
  }
  const actual = item.actual
  const cambios = Object.entries(item.cambios)
  return (
    <tr className="border-t border-border align-top" data-testid="macrocac-vista-previa-fila">
      <td className="px-2 py-1 font-mono">{item.IdAto}</td>
      <td className="px-2 py-1">{accion}</td>
      <td className="px-2 py-1">
        {item.flg === "E" ? (
          <span className="text-destructive">Se borra el acto</span>
        ) : item.flg === "X" ? (
          <span className="whitespace-nowrap">FACTOR_RW1: {fmt(actual.FACTOR_RW1)} → 0</span>
        ) : cambios.length === 0 ? (
          <span className="text-muted-foreground">Sin cambios</span>
        ) : (
          <ul className="space-y-0.5">
            {cambios.map(([col, nuevo]) => (
              <li key={col} className="whitespace-nowrap">
                <span className="text-muted-foreground">{col}:</span>{" "}
                <span className="font-mono">{fmt(actual[col])}</span> →{" "}
                <span className="font-mono font-medium">{fmt(nuevo)}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
      {CONTEXTO_VISTA.map((c) => (
        <td key={c.col} className="px-2 py-1 font-mono whitespace-nowrap">{fmt(actual[c.col])}</td>
      ))}
    </tr>
  )
}

/**
 * Verificación del formato del archivo contra lo que entiende el motor.
 *
 * Solo mira nombres de columnas: las reglas de negocio (precio vs promoción,
 * pack/granel, etc.) las valida el motor por fila y salen en el reporte.
 */
function FormatoDetail({ check }: { check: MacrocacFormatoCheck }) {
  if (!check.ok) {
    return (
      <div
        className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        data-testid="macrocac-formato-invalido"
      >
        <div className="flex items-center gap-2 font-medium">
          <XCircle className="h-4 w-4 shrink-0" />
          Faltan columnas obligatorias
        </div>
        <p>{check.faltantesObligatorias.map((f) => f.key).join(", ")}</p>
      </div>
    )
  }

  return (
    <div
      className="space-y-1 rounded-lg border border-emerald-600/30 bg-emerald-600/5 px-3 py-2 text-sm"
      data-testid="macrocac-formato-ok"
    >
      <div className="flex items-center gap-2 font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        Formato válido — {check.reconocidas.length} columnas reconocidas
      </div>
      {check.faltantesOpcionales.length > 0 && (
        <p className="text-muted-foreground text-xs" data-testid="macrocac-formato-opcionales">
          Sin columna (no se modifican esos campos):{" "}
          {check.faltantesOpcionales.map((f) => f.key).join(", ")}
        </p>
      )}
      {check.noReconocidas.length > 0 && (
        <p className="text-muted-foreground text-xs" data-testid="macrocac-formato-ignoradas">
          El motor ignora: {check.noReconocidas.join(", ")}
        </p>
      )}
      {check.motivoParcial && (
        <p className="text-amber-700 text-xs" data-testid="macrocac-formato-motivo-parcial">
          El archivo trae la columna MotivoCambio pero con celdas vacías: esas filas se auditan
          con el motivo por defecto del formulario.
        </p>
      )}
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
  // JAA-1110 — motivos por fila. Se rechaza el archivo entero, así que el error
  // tiene que decir qué valor y en qué filas: sin eso no se puede ir a corregir.
  if (error.error === "motivo_invalido") {
    return (
      <div
        className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        data-testid="macrocac-motivo-invalido"
      >
        <div className="flex items-center gap-2 font-medium">
          <XCircle className="h-4 w-4 shrink-0" />
          Motivos desconocidos en el archivo
        </div>
        <ul className="space-y-0.5 text-xs">
          {error.invalidos.map((inv) => (
            <li key={inv.motivo}>
              <span className="font-mono">{inv.motivo}</span> —{" "}
              {inv.filas.length === 1 ? "fila" : "filas"} {inv.filas.join(", ")}
            </li>
          ))}
        </ul>
        <p className="text-xs">
          Tienen que coincidir exactamente con un motivo del catálogo. No se aplicó ninguna fila.
        </p>
      </div>
    )
  }
  if (error.error === "motivo_requerido") {
    return (
      <div
        className="space-y-1 rounded-lg border border-amber-600/30 bg-amber-600/5 px-3 py-2 text-sm text-amber-700"
        data-testid="macrocac-motivo-requerido"
      >
        <div className="flex items-center gap-2 font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Faltan motivos en {error.filas.length === 1 ? "una fila" : `${error.filas.length} filas`}
        </div>
        <p className="text-xs">
          {error.filas.length === 1 ? "Fila" : "Filas"} {error.filas.join(", ")}. Elige un motivo
          por defecto arriba y el archivo se sube solo, o complétalo en el Excel.
        </p>
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

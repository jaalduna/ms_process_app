import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MacrocacApiError } from "../types"

// Mock the macrocac API module — the wiring under test.
const mockUpload = vi.fn()
const mockCreateRun = vi.fn()
const mockGetRun = vi.fn()
const mockDownload = vi.fn()
const mockGetMotivos = vi.fn()
const mockDownloadPlantilla = vi.fn()
const mockGetTablas = vi.fn()
const mockGetVistaPrevia = vi.fn()

vi.mock("../api", () => ({
  uploadMacrocacFile: (...a: unknown[]) => mockUpload(...a),
  createMacrocacRun: (...a: unknown[]) => mockCreateRun(...a),
  getMacrocacRun: (...a: unknown[]) => mockGetRun(...a),
  downloadMacrocacReporte: (...a: unknown[]) => mockDownload(...a),
  getMotivos: (...a: unknown[]) => mockGetMotivos(...a),
  downloadPlantilla: (...a: unknown[]) => mockDownloadPlantilla(...a),
  getTablas: (...a: unknown[]) => mockGetTablas(...a),
  getVistaPrevia: (...a: unknown[]) => mockGetVistaPrevia(...a),
}))


/** Las 9 filas reales de dbo.A_FlgMotivo (verificadas en BO_KWP/CL_KWP/AR_KWP). */
const MOTIVOS = [
  { flg_motivo: 1, descricao: "EVA" },
  { flg_motivo: 2, descricao: "SmartQuality" },
  { flg_motivo: 3, descricao: "Críticas" },
  { flg_motivo: 4, descricao: "Elegibilidad" },
  { flg_motivo: 5, descricao: "Calibración" },
  { flg_motivo: 6, descricao: "Cuestionamientos" },
  { flg_motivo: 7, descricao: "Reprocesos" },
  { flg_motivo: 8, descricao: "Cambios/Reestructuras MF" },
  { flg_motivo: 9, descricao: "Otros" },
]
const CATALOGO = { items: MOTIVOS, pais: "BO", stale: false, age_seconds: 0 }

/**
 * Lo que devuelve `GET /macrocac/tablas` para BO: los patrones ya expandidos
 * contra sys.tables. Incluye dos backups con el mismo prefijo para poder probar
 * que el combobox se busca en vez de recorrerse.
 */
const TABLAS = [
  { base: "BO_KWP", esquema: "dbo", tabla: "_test_J_AtosCompra_New_v1", patron: "_test_*" },
  { base: "BO_KWP", esquema: "dbo", tabla: "_test_J_AtosCompra_New_v2", patron: "_test_*" },
  { base: "BO_KWP", esquema: "dbo", tabla: "_test_J_AtosCompra_New_v3", patron: "_test_*" },
  { base: "BO_KWP", esquema: "dbo", tabla: "J_AtosCompra_New", patron: "j_atoscompra_new" },
]
const TABLAS_RESP = { items: TABLAS, pais: "BO", patrones: [] }

/** Una entrada de `motivos_resumen`: el backend ya resolvió el id del catálogo. */
function resumen(m: (typeof MOTIVOS)[number], filas: number, desde_formulario = false) {
  return { flg_motivo: m.flg_motivo, motivo: m.descricao, filas, desde_formulario }
}

const UPLOAD_RESP = {
  upload_id: "upl_macrocac_1",
  filename: "correcciones_bo.xlsx",
  pais: "BO",
  tabla: "_test_J_AtosCompra_New_v1",
  motivo: MOTIVOS[0]!.descricao,
  flg_motivo: MOTIVOS[0]!.flg_motivo,
  auxiliar: null,
  filas: 14,
  columnas: ["IdAto", "Flg", "NewQuantidade"],
  // Sin columna MotivoCambio: las 14 filas caen al motivo del formulario.
  motivos_resumen: [resumen(MOTIVOS[0]!, 14, true)],
  filas_sin_motivo: 14,
  filas_con_auxiliar: 0,
}

/** JAA-1110 — archivo con motivos por fila: 8 Críticas, 4 Calibración, 2 del formulario. */
const UPLOAD_VARIOS_MOTIVOS = {
  ...UPLOAD_RESP,
  columnas: ["IdAto", "Flg", "MotivoCambio"],
  motivos_resumen: [
    resumen(MOTIVOS[2]!, 8),
    resumen(MOTIVOS[4]!, 4),
    resumen(MOTIVOS[0]!, 2, true),
  ],
  filas_sin_motivo: 2,
  filas_con_auxiliar: 0,
}

const RUN_RUNNING = {
  run_id: "run_macrocac_abc123",
  status: "running",
  dry_run: true,
  simular: false,
  pais: "BO",
  tabla: "_test_J_AtosCompra_New_v1",
  upload_id: "upl_macrocac_1",
  per_ini: null,
  per_fin: null,
  created_at: "2026-07-28T12:00:00.000Z",
  completed_at: null,
  resultado_lote: null,
}

const RUN_SUCCEEDED = {
  ...RUN_RUNNING,
  status: "succeeded",
  completed_at: "2026-07-28T12:00:05.000Z",
  resultado_lote: [
    { IdAto: 900001, ok: true, mensaje: "ACTUALIZADO", accion: "M" },
    { IdAto: 900002, ok: false, mensaje: "No se encontró el acto", accion: "M" },
  ],
}

function createClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
}

async function renderPage() {
  const { MacrocacPage } = await import("./MacrocacPage")
  return render(
    <QueryClientProvider client={createClient()}>
      <MacrocacPage />
    </QueryClientProvider>,
  )
}

function makeFile(name = "correcciones_bo.xlsx") {
  return new File(["contenido"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Elige el motivo por defecto (fallback de las filas sin MotivoCambio propio). */
async function elegirMotivo(user: ReturnType<typeof userEvent.setup>, motivo?: string) {
  // El select arranca deshabilitado hasta que llega el catálogo desde el backend.
  await waitFor(() => expect(screen.getByTestId("macrocac-motivo-select")).toBeEnabled())
  await user.click(screen.getByTestId("macrocac-motivo-select"))
  // El nombre accesible lleva el número delante ("1.- Proceso de críticas").
  const texto = motivo ?? MOTIVOS[0]!.descricao
  await user.click(await screen.findByRole("option", { name: new RegExp(escapeRegExp(texto)) }))
}

/**
 * Sube el archivo. Desde JAA-1110 no hace falta elegir motivo antes: manda el
 * de cada fila, y el backend solo exige el del formulario si alguna viene vacía.
 */
async function subirArchivo(user: ReturnType<typeof userEvent.setup>, file = makeFile()) {
  const input = screen.getByTestId("macrocac-file-input") as HTMLInputElement
  // El input está deshabilitado hasta que llega la lista de tablas: sin destino
  // no hay adónde subir. Sobre un input deshabilitado, `upload` no hace nada.
  await waitFor(() => expect(input).toBeEnabled())
  await user.upload(input, file)
}

describe("MacrocacPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRun.mockResolvedValue(RUN_RUNNING)
    mockGetMotivos.mockResolvedValue(CATALOGO)
    mockGetTablas.mockResolvedValue(TABLAS_RESP)
  })

  it("ac1: muestra el formulario (tabla/país, motivo, detalle, archivo) y aplicar deshabilitado", async () => {
    await renderPage()

    expect(screen.queryByText("Próximamente")).not.toBeInTheDocument()
    expect(await screen.findByTestId("macrocac-tabla-combobox")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-pais-select")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-motivo-select")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-auxiliar-input")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-file-input")).toBeInTheDocument()
    expect(screen.getByTestId("macrocac-aplicar")).toBeDisabled()
  })

  it("parte en Bolivia y elige sola la primera copia de trabajo", async () => {
    await renderPage()

    expect(screen.getByTestId("macrocac-pais-select")).toHaveTextContent("Bolivia")
    // Por defecto una `_test*`, nunca la productiva: es el destino seguro.
    expect(await screen.findByTestId("macrocac-tabla-combobox")).toHaveValue(
      "_test_J_AtosCompra_New_v1",
    )
    expect(screen.getByTestId("macrocac-sandbox-hint")).toBeInTheDocument()
    expect(screen.queryByTestId("macrocac-produccion-warning")).not.toBeInTheDocument()
  })

  it("la lista de tablas se pide para el país elegido", async () => {
    const user = userEvent.setup()
    await renderPage()
    await waitFor(() => expect(mockGetTablas).toHaveBeenCalledWith("BO"))

    await user.click(screen.getByTestId("macrocac-pais-select"))
    await user.click(await screen.findByRole("option", { name: /Chile/ }))

    await waitFor(() => expect(mockGetTablas).toHaveBeenCalledWith("CL"))
  })

  it("la tabla se puede buscar escribiendo, no solo desplegando", async () => {
    const user = userEvent.setup()
    await renderPage()
    const combo = await screen.findByTestId("macrocac-tabla-combobox")

    await user.click(combo)
    await user.type(combo, "new_v3")

    // Filtra a la única que coincide; las otras tres desaparecen.
    const opciones = screen.getAllByRole("option")
    expect(opciones).toHaveLength(1)
    expect(opciones[0]).toHaveTextContent("_test_J_AtosCompra_New_v3")

    await user.click(opciones[0]!)
    expect(combo).toHaveValue("_test_J_AtosCompra_New_v3")
  })

  it("no repite la base en cada fila cuando todas salen de la misma", async () => {
    // El nombre es lo que hay que leer; "BO_KWP" en las 4 filas no desambigua
    // nada y le come el ancho justo al prefijo largo que sí las distingue.
    const user = userEvent.setup()
    await renderPage()

    await user.click(await screen.findByTestId("macrocac-tabla-combobox"))
    const opciones = screen.getAllByRole("option")
    expect(opciones).toHaveLength(TABLAS.length)
    expect(opciones.map((o) => o.textContent)).toEqual(TABLAS.map((t) => t.tabla))
  })

  it("sí muestra la base cuando los patrones traen tablas de bases distintas", async () => {
    mockGetTablas.mockResolvedValue({
      ...TABLAS_RESP,
      items: [
        TABLAS[0]!,
        { base: "CAM_KWP", esquema: "dbo", tabla: "J_AtosCompra_New_RD", patron: "j_atoscompra_new_rd" },
      ],
    })
    const user = userEvent.setup()
    await renderPage()

    await user.click(await screen.findByTestId("macrocac-tabla-combobox"))
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "_test_J_AtosCompra_New_v1BO_KWP",
      "J_AtosCompra_New_RDCAM_KWP",
    ])
  })

  it("elegir la tabla productiva muestra la advertencia", async () => {
    const user = userEvent.setup()
    await renderPage()
    const combo = await screen.findByTestId("macrocac-tabla-combobox")

    await user.click(combo)
    await user.click(await screen.findByRole("option", { name: /^J_AtosCompra_New/ }))

    expect(screen.getByTestId("macrocac-produccion-warning")).toBeInTheDocument()
    expect(screen.queryByTestId("macrocac-sandbox-hint")).not.toBeInTheDocument()
  })

  it("si no se puede listar las tablas se dice, y no se puede subir archivo", async () => {
    mockGetTablas.mockRejectedValue(
      new MacrocacApiError(503, {
        error: "tablas_no_disponibles",
        message: "No se pudo consultar sys.tables para BO.",
      }),
    )
    await renderPage()

    expect(await screen.findByTestId("macrocac-tablas-error")).toHaveTextContent("sys.tables")
    expect(screen.getByTestId("macrocac-file-input")).toBeDisabled()
  })

  it("el archivo se sube sin elegir motivo: manda el de cada fila", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    await waitFor(() => expect(mockUpload).toHaveBeenCalled())
    // Sin motivo elegido no se manda ninguno: el backend decide si hace falta.
    expect(mockUpload.mock.calls[0]![0]).toMatchObject({ motivo: undefined })
    expect(await screen.findByTestId("macrocac-upload-chip")).toBeInTheDocument()
  })

  it("motivo_requerido: pide el motivo por defecto y reintenta al elegirlo", async () => {
    mockUpload.mockRejectedValueOnce(
      new MacrocacApiError(400, {
        error: "motivo_requerido",
        message: "Las filas 3 y 5 no traen MotivoCambio.",
        filas: [3, 5],
      }),
    )
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    const aviso = await screen.findByTestId("macrocac-motivo-requerido")
    expect(aviso).toHaveTextContent("3, 5")
    expect(screen.queryByTestId("macrocac-upload-chip")).not.toBeInTheDocument()

    // El archivo ya elegido no hay que volver a seleccionarlo: al elegir el
    // motivo la subida se reintenta sola.
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    await elegirMotivo(user)
    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(2))
    expect(await screen.findByTestId("macrocac-upload-chip")).toBeInTheDocument()
  })

  it("motivo_invalido: dice qué valor y en qué filas, y no se aplica nada", async () => {
    mockUpload.mockRejectedValue(
      new MacrocacApiError(400, {
        error: "motivo_invalido",
        message: "Motivo desconocido 'Calibracion' en las filas 4, 9 y 12.",
        invalidos: [{ motivo: "Calibracion", filas: [4, 9, 12] }],
      }),
    )
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    const detalle = await screen.findByTestId("macrocac-motivo-invalido")
    expect(detalle).toHaveTextContent("Calibracion")
    expect(detalle).toHaveTextContent("4, 9, 12")
    expect(screen.getByTestId("macrocac-aplicar")).toBeDisabled()
  })

  it("muestra el desglose de motivos detectados en el archivo", async () => {
    mockUpload.mockResolvedValue(UPLOAD_VARIOS_MOTIVOS)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    const resumen = await screen.findByTestId("macrocac-motivos-resumen")
    expect(resumen).toHaveTextContent("3 motivos en 14 filas")
    expect(resumen).toHaveTextContent(`3.- ${MOTIVOS[2]!.descricao} (8)`)
    expect(resumen).toHaveTextContent(`5.- ${MOTIVOS[4]!.descricao} (4)`)
    // Las 2 filas sin motivo propio se marcan como fallback del formulario.
    expect(resumen).toHaveTextContent("por defecto")
  })

  it("avisa cuando la columna MotivoCambio viene con celdas vacías", async () => {
    mockUpload.mockResolvedValue(UPLOAD_VARIOS_MOTIVOS)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    expect(await screen.findByTestId("macrocac-formato-motivo-parcial")).toBeInTheDocument()
  })

  it("no avisa de celdas vacías cuando todas las filas traen motivo", async () => {
    mockUpload.mockResolvedValue({
      ...UPLOAD_VARIOS_MOTIVOS,
      motivos_resumen: [resumen(MOTIVOS[2]!, 14)],
      filas_sin_motivo: 0,
    })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    await screen.findByTestId("macrocac-motivos-resumen")
    expect(screen.queryByTestId("macrocac-formato-motivo-parcial")).not.toBeInTheDocument()
  })

  it("el motivo se lista y se muestra con su número", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByTestId("macrocac-motivo-select"))
    for (const motivo of MOTIVOS) {
      const option = await screen.findByRole("option", {
        name: new RegExp(escapeRegExp(motivo.descricao)),
      })
      // El número es el Flg_Motivo del catálogo, no la posición en la lista.
      expect(option).toHaveTextContent(`${motivo.flg_motivo}.-`)
    }

    // Y el número sigue visible en el trigger una vez elegido.
    await user.click(screen.getByRole("option", { name: /Calibración/ }))
    expect(screen.getByTestId("macrocac-motivo-select")).toHaveTextContent("5.-")
  })

  it("el motivo elegido y el detalle viajan al backend", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    const user = userEvent.setup()
    await renderPage()

    await user.type(screen.getByTestId("macrocac-auxiliar-input"), "JAA-1234")
    await elegirMotivo(user, MOTIVOS[1]!.descricao)
    await subirArchivo(user)

    await waitFor(() => expect(mockUpload).toHaveBeenCalled())
    expect(mockUpload.mock.calls[0]![0]).toMatchObject({
      pais: "BO",
      tabla: "_test_J_AtosCompra_New_v1",
      motivo: MOTIVOS[1]!.descricao,
      auxiliar: "JAA-1234",
    })
  })

  it("ac2: subir un archivo (201) muestra el chip con filename/filas/columnas", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    const chip = await screen.findByTestId("macrocac-upload-chip")
    expect(chip).toHaveTextContent("correcciones_bo.xlsx")
    expect(chip).toHaveTextContent("14 filas")
    expect(chip).toHaveTextContent("3 columnas")
    expect(screen.getByTestId("macrocac-aplicar")).toBeEnabled()
  })

  it("verifica el formato: reconoce las columnas y lista las que faltan", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    const ok = await screen.findByTestId("macrocac-formato-ok")
    expect(ok).toHaveTextContent("3 columnas reconocidas")
    // El archivo solo trae 3 de los campos opcionales, el resto se avisa.
    expect(screen.getByTestId("macrocac-formato-opcionales")).toHaveTextContent("NewPreco")
  })

  it("verifica el formato: avisa de columnas que el motor ignora", async () => {
    mockUpload.mockResolvedValue({
      ...UPLOAD_RESP,
      columnas: ["IdAto", "Flg", "ColumnaInventada"],
    })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    expect(await screen.findByTestId("macrocac-formato-ignoradas")).toHaveTextContent(
      "ColumnaInventada",
    )
  })

  it("verifica el formato: sin columnas obligatorias no deja aplicar", async () => {
    mockUpload.mockResolvedValue({ ...UPLOAD_RESP, columnas: ["NewPreco"] })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    expect(await screen.findByTestId("macrocac-formato-invalido")).toHaveTextContent("IdAto")
    expect(screen.getByTestId("macrocac-aplicar")).toBeDisabled()
  })

  it("ac2: 422 missing_columns muestra las columnas faltantes", async () => {
    mockUpload.mockRejectedValue(
      new MacrocacApiError(422, { error: "missing_columns", missing_columns: ["IdAto", "Flg"] }),
    )
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user, makeFile("sin-idato.xlsx"))

    const detail = await screen.findByTestId("macrocac-missing-columns")
    expect(detail).toHaveTextContent("IdAto")
    expect(detail).toHaveTextContent("Flg")
    expect(screen.getByTestId("macrocac-aplicar")).toBeDisabled()
  })

  it("ac2: 400 bad_request muestra el mensaje del backend", async () => {
    mockUpload.mockRejectedValue(
      new MacrocacApiError(400, { error: "bad_request", message: "País desconocido: 'XX'." }),
    )
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)

    expect(await screen.findByTestId("macrocac-upload-error")).toHaveTextContent(
      "País desconocido: 'XX'.",
    )
  })

  it("aplicar pide confirmación y no ejecuta nada hasta confirmar", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))

    const dialog = await screen.findByTestId("macrocac-confirm-dialog")
    expect(dialog).toHaveTextContent("14")
    expect(dialog).toHaveTextContent("_test_J_AtosCompra_New_v1")
    expect(dialog).toHaveTextContent(MOTIVOS[0]!.descricao)
    // Lo importante: mientras no se confirme, no se disparó el run.
    expect(mockCreateRun).not.toHaveBeenCalled()
  })

  it("la confirmación lista todos los motivos del archivo, no uno solo", async () => {
    mockUpload.mockResolvedValue(UPLOAD_VARIOS_MOTIVOS)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))

    const motivos = await screen.findByTestId("macrocac-confirm-motivos")
    expect(motivos).toHaveTextContent(`3.- ${MOTIVOS[2]!.descricao} (8 filas)`)
    expect(motivos).toHaveTextContent(`5.- ${MOTIVOS[4]!.descricao} (4 filas)`)
    expect(motivos).toHaveTextContent(`1.- ${MOTIVOS[0]!.descricao} (2 filas, por defecto)`)
  })

  it("cancelar la confirmación no ejecuta el run", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))
    await user.click(await screen.findByTestId("macrocac-confirm-cancelar"))

    await waitFor(() =>
      expect(screen.queryByTestId("macrocac-confirm-dialog")).not.toBeInTheDocument(),
    )
    expect(mockCreateRun).not.toHaveBeenCalled()
  })

  it("la confirmación advierte cuando el destino es la tabla productiva", async () => {
    mockUpload.mockResolvedValue({ ...UPLOAD_RESP, tabla: "j_atoscompra_new" })
    const user = userEvent.setup()
    await renderPage()

    await user.click(await screen.findByTestId("macrocac-tabla-combobox"))
    await user.click(await screen.findByRole("option", { name: /^J_AtosCompra_New/ }))
    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))

    expect(await screen.findByTestId("macrocac-confirm-produccion")).toBeInTheDocument()
  })

  it("ac3: al confirmar se ejecuta el run y se muestra en curso", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue(RUN_RUNNING)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))
    await user.click(await screen.findByTestId("macrocac-confirm-aceptar"))

    await waitFor(() =>
      expect(mockCreateRun.mock.calls[0]?.[0]).toEqual({ uploadId: "upl_macrocac_1" }),
    )
    const status = await screen.findByTestId("macrocac-run-status")
    expect(status).toHaveTextContent("run_macrocac_abc123")
    expect(status).toHaveTextContent("aplicando cambios")
  })

  it("al terminar ofrece descargar el reporte", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue(RUN_RUNNING)
    mockGetRun.mockResolvedValue(RUN_SUCCEEDED)
    mockDownload.mockResolvedValue(undefined)
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))
    await user.click(await screen.findByTestId("macrocac-confirm-aceptar"))

    await screen.findByTestId("macrocac-descargar-reporte")
    expect(screen.getByTestId("macrocac-run-status")).toHaveTextContent("2 filas, 1 con error")

    // Confirmar cierra el diálogo.
    await waitFor(() =>
      expect(screen.queryByTestId("macrocac-confirm-dialog")).not.toBeInTheDocument(),
    )

    await user.click(screen.getByTestId("macrocac-descargar-reporte"))
    // Se compara solo el primer argumento: react-query le agrega el contexto de
    // la mutación como segundo parámetro del mutationFn.
    await waitFor(() =>
      expect(mockDownload.mock.calls[0]?.[0]).toEqual({
        runId: "run_macrocac_abc123",
        pais: "BO",
      }),
    )
  })

  it("un run fallido muestra el error y no ofrece descarga", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue(RUN_RUNNING)
    mockGetRun.mockResolvedValue({
      ...RUN_RUNNING,
      status: "failed",
      error_message: "no se pudo conectar a SQL Server",
    })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))
    await user.click(await screen.findByTestId("macrocac-confirm-aceptar"))

    await waitFor(() =>
      expect(screen.getByTestId("macrocac-run-status")).toHaveTextContent(
        "no se pudo conectar a SQL Server",
      ),
    )
    expect(screen.queryByTestId("macrocac-descargar-reporte")).not.toBeInTheDocument()
  })

  it("ac3: 409 run_in_progress muestra el run_id existente", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockRejectedValue(
      new MacrocacApiError(409, {
        error: "run_in_progress",
        message: "Ya hay un run activo para BO/_test_J_AtosCompra_New_v1.",
        run_id: "run_macrocac_existing",
      }),
    )
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))
    await user.click(await screen.findByTestId("macrocac-confirm-aceptar"))

    const conflict = await screen.findByTestId("macrocac-run-conflict")
    expect(conflict).toHaveTextContent("run_macrocac_existing")
    expect(screen.queryByTestId("macrocac-run-status")).not.toBeInTheDocument()
  })

  it("ofrece descargar la plantilla junto al campo de archivo", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByTestId("macrocac-descargar-plantilla"))

    expect(mockDownloadPlantilla).toHaveBeenCalledOnce()
  })
})

describe("esProduccion — convención de nombres de las copias de trabajo", () => {
  it("reconoce la convención acordada con TI (_test_<tabla>_<version>)", async () => {
    const { esProduccion } = await import("../types")

    expect(esProduccion("_test_j_atoscompra_new_v1")).toBe(false)
    expect(esProduccion("_TEST_J_AtosCompra_New_v2")).toBe(false)
  })

  it("la convención anterior (_BKP*) ya no cuenta como copia de trabajo", async () => {
    const { esProduccion } = await import("../types")

    // Se sacó de los patrones habilitados, así que esas tablas ni se ofrecen.
    // Si alguna reapareciera, se trata como productiva — el lado seguro del
    // error: muestra la advertencia en vez de callarse.
    expect(esProduccion("_bkp_j_atoscompra_new_1")).toBe(true)
    expect(esProduccion("_BKP_J_Atos_Nini_Simulada")).toBe(true)
  })

  it("una productiva no se cuela por parecerse", async () => {
    const { esProduccion } = await import("../types")

    expect(esProduccion("j_atoscompra_new")).toBe(true)
    // El sufijo _RD no la vuelve de prueba: es oficial (pedido de Jorge).
    expect(esProduccion("J_AtosCompra_New_RD")).toBe(true)
    // El prefijo tiene que ir al principio.
    expect(esProduccion("algo__test_j_atoscompra_new")).toBe(true)
  })
})


describe("MacrocacPage — observaciones QA 2026-09", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRun.mockResolvedValue(RUN_RUNNING)
    mockGetMotivos.mockResolvedValue(CATALOGO)
    mockGetTablas.mockResolvedValue(TABLAS_RESP)
  })

  it("se puede soltar el .xlsx sobre el recuadro (antes el drop no hacía nada)", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    await renderPage()
    await waitFor(() => expect(screen.getByTestId("macrocac-file-input")).toBeEnabled())

    const file = makeFile()
    fireEvent.drop(screen.getByTestId("macrocac-dropzone"), { dataTransfer: { files: [file] } })

    await waitFor(() => expect(mockUpload).toHaveBeenCalledTimes(1))
    expect(mockUpload.mock.calls[0]![0]).toMatchObject({ file, tabla: "_test_J_AtosCompra_New_v1" })
    expect(await screen.findByTestId("macrocac-upload-chip")).toBeInTheDocument()
  })

  it("soltar algo que no es .xlsx no sube nada y lo dice", async () => {
    await renderPage()
    await waitFor(() => expect(screen.getByTestId("macrocac-file-input")).toBeEnabled())

    const pdf = new File(["x"], "notas.pdf", { type: "application/pdf" })
    fireEvent.drop(screen.getByTestId("macrocac-dropzone"), { dataTransfer: { files: [pdf] } })

    expect(await screen.findByTestId("macrocac-archivo-rechazado")).toHaveTextContent("notas.pdf")
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it("muestra los actos a modificar con su valor actual y el nuevo, antes de aplicar", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockGetVistaPrevia.mockResolvedValue({
      upload_id: "upl_macrocac_1",
      pais: "BO",
      tabla: "_test_J_AtosCompra_New_v1",
      total: 3,
      mostrados: 3,
      no_encontrados: 1,
      items: [
        {
          IdAto: 111, flg: "M", encontrado: true,
          actual: { IdDomicilio: 5, Data_Compra: "2026-08-15", IdArtigo: 9, IdProduto: 7, IdCanal: 3, Preco: 1500, Acceso_Canal: 1 },
          cambios: { Preco: 2000, Acceso_Canal: 2 },
        },
        {
          IdAto: 222, flg: "X", encontrado: true,
          actual: { IdDomicilio: 6, FACTOR_RW1: 1.25 },
          cambios: {},
        },
        { IdAto: 333, flg: "M", encontrado: false, actual: null, cambios: { Preco: 10 } },
      ],
    })
    const user = userEvent.setup()
    await renderPage()
    await subirArchivo(user)

    // No se consulta SQL hasta que el usuario la abre.
    await screen.findByTestId("macrocac-vista-previa")
    expect(mockGetVistaPrevia).not.toHaveBeenCalled()
    await user.click(screen.getByTestId("macrocac-vista-previa-toggle"))

    await waitFor(() => expect(mockGetVistaPrevia).toHaveBeenCalledWith("upl_macrocac_1"))
    const filas = await screen.findAllByTestId("macrocac-vista-previa-fila")
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent("Preco: 1500 → 2000")
    expect(filas[0]).toHaveTextContent("Acceso_Canal: 1 → 2")
    expect(filas[1]).toHaveTextContent("FACTOR_RW1: 1.25 → 0")
    expect(filas[2]).toHaveTextContent("No existe en la tabla destino")
    expect(screen.getByTestId("macrocac-vista-previa-toggle")).toHaveTextContent("1 no encontrados")
  })

  it("si la vista previa falla lo muestra y no bloquea aplicar", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockGetVistaPrevia.mockRejectedValue(
      new MacrocacApiError(503, { error: "sql_not_configured", message: "Sin credenciales SQL." }),
    )
    const user = userEvent.setup()
    await renderPage()
    await subirArchivo(user)
    await user.click(await screen.findByTestId("macrocac-vista-previa-toggle"))

    expect(await screen.findByTestId("macrocac-vista-previa-error")).toHaveTextContent(
      "Sin credenciales SQL.",
    )
    expect(screen.getByTestId("macrocac-aplicar")).toBeEnabled()
  })

  // ------------------------------------------------- QA 2026-09-28: validar y confirmar
  const FILAS_CON_ADVERTENCIA = [
    {
      IdAto: 900001, ok: true, mensaje: "SE ACTUALIZARÍA", accion: "M",
      observacion: "Se actualizó Preco", advertencias: "Ajuste histórico: período 202607 cerrado",
    },
    {
      IdAto: 900002, ok: false, mensaje: "Validación de negocio no superada", accion: "M",
      observacion: "CAMBIO RECHAZADO. Canal: IdCanal=8 está inactivo", advertencias: null,
    },
  ]

  it("validar sin aplicar lanza un run simulado y dice que no escribió nada", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue({ ...RUN_RUNNING, simular: true })
    mockGetRun.mockResolvedValue({
      ...RUN_SUCCEEDED, simular: true, resultado_lote: FILAS_CON_ADVERTENCIA,
    })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-validar"))

    await waitFor(() =>
      expect(mockCreateRun.mock.calls[0]?.[0]).toEqual({ uploadId: "upl_macrocac_1", simular: true }),
    )
    const resumen = await screen.findByTestId("macrocac-run-resumen")
    expect(resumen).toHaveTextContent("1 se aplicarían, 1 rechazadas, 1 con advertencia")
    expect(resumen).toHaveTextContent("No se escribió nada")
    // Validar no abre la confirmación de aplicar.
    expect(screen.queryByTestId("macrocac-confirm-dialog")).not.toBeInTheDocument()
  })

  it("el detalle muestra el motivo del rechazo y la advertencia", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue({ ...RUN_RUNNING, simular: true })
    mockGetRun.mockResolvedValue({
      ...RUN_SUCCEEDED, simular: true, resultado_lote: FILAS_CON_ADVERTENCIA,
    })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-validar"))
    await user.click(await screen.findByTestId("macrocac-detalle-toggle"))

    const detalle = screen.getByTestId("macrocac-detalle")
    expect(detalle).toHaveTextContent("CAMBIO RECHAZADO. Canal: IdCanal=8 está inactivo")
    expect(detalle).toHaveTextContent("Ajuste histórico: período 202607 cerrado")
  })

  it("con advertencias sin confirmar no aplica y deja confirmar", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue(RUN_RUNNING)
    mockGetRun.mockResolvedValue({
      ...RUN_SUCCEEDED, status: "requiere_confirmacion", resultado_lote: FILAS_CON_ADVERTENCIA,
    })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))
    await user.click(await screen.findByTestId("macrocac-confirm-aceptar"))

    const aviso = await screen.findByTestId("macrocac-requiere-confirmacion")
    expect(aviso).toHaveTextContent("1 acto tiene advertencias")
    expect(aviso).toHaveTextContent("No se aplicó ningún cambio")

    mockGetRun.mockResolvedValue(RUN_SUCCEEDED)
    await user.click(screen.getByTestId("macrocac-confirmar-advertencias"))
    await waitFor(() =>
      expect(mockCreateRun.mock.calls[1]?.[0]).toEqual({
        uploadId: "upl_macrocac_1", confirmarAdvertencias: true,
      }),
    )
  })

  it("cancelar las advertencias descarta el run sin aplicar", async () => {
    mockUpload.mockResolvedValue(UPLOAD_RESP)
    mockCreateRun.mockResolvedValue(RUN_RUNNING)
    mockGetRun.mockResolvedValue({
      ...RUN_SUCCEEDED, status: "requiere_confirmacion", resultado_lote: FILAS_CON_ADVERTENCIA,
    })
    const user = userEvent.setup()
    await renderPage()

    await subirArchivo(user)
    await screen.findByTestId("macrocac-upload-chip")
    await user.click(screen.getByTestId("macrocac-aplicar"))
    await user.click(await screen.findByTestId("macrocac-confirm-aceptar"))
    await user.click(await screen.findByTestId("macrocac-cancelar-advertencias"))

    await waitFor(() =>
      expect(screen.queryByTestId("macrocac-run-status")).not.toBeInTheDocument(),
    )
    expect(mockCreateRun).toHaveBeenCalledTimes(1)
  })
})

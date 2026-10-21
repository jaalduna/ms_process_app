import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type {
  Escenarios,
  Parametros,
  Preparacion,
  Publicacion,
  Simulacion,
} from "@/modules/iteracion/types"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const h = vi.hoisted(() => ({
  getPaises: vi.fn(),
  getPreparacion: vi.fn(),
  prepararDatos: vi.fn(),
  getParametros: vi.fn(),
  simular: vi.fn(),
  getEscenarios: vi.fn(),
  crearEscenario: vi.fn(),
  elegirEscenario: vi.fn(),
  getPublicacion: vi.fn(),
  enviarPublicacion: vi.fn(),
  aprobarPublicacion: vi.fn(),
  devolverPublicacion: vi.fn(),
}))
vi.mock("@/modules/iteracion/api", () => h)

import { IteracionWorkspace } from "@/modules/iteracion/components/IteracionWorkspace"
import { ELEGIBILIDAD } from "@/modules/iteracion/config"

function preparacion(estado: Preparacion["estado"]): Preparacion {
  return {
    proceso: "elegibilidad", pais: "brasil", periodo: "202609", engine: "simulated", estado,
    preparado_en: estado === "lista" ? "2026-10-19T10:42:00Z" : null, version_silver: estado === "lista" ? "v3" : null,
    fuente: "Snapshot bronze prd",
    tablas: [{ nombre: "J_AtosCompra_New", filas: 3412880, estado: estado === "lista" ? "lista" : "pendiente" }],
    validaciones: [{ id: "variables", titulo: "Variables completas", detalle: "ok", nivel: "ok" }],
    dependencias: [],
  }
}

const PARAMETROS: Parametros = {
  definiciones: [
    { clave: "f_ok", etiqueta: "Llenado mínimo para región OK", ayuda: "déficit", tipo: "rango", min: 0.8, max: 1, paso: 0.01, formato: "pct" },
  ],
  valores: { f_ok: 0.9 },
  referencia: { etiqueta: "Mes pasado (202608)", valores: { f_ok: 0.9 } },
}

function simulacion(cerradas: string[]): Simulacion {
  return {
    engine: "simulated", duracion_ms: 2100, generado_en: "2026-10-19T10:50:00Z",
    kpis: [{ id: "imputados", etiqueta: "Hogares imputados", valor: cerradas.length ? 900 : 1180, formato: "num" }],
    resultado: {
      tipo: "elegibilidad", f_ok: 0.9,
      regiones: [
        { id: "NE", nombre: "Nordeste", ideal: 2480, natural: 2188, imputados: cerradas.includes("NE") ? 0 : 260, final: 2448, cumplimiento: 0.98, estado: cerradas.includes("NE") ? "cerrada" : "ok" },
      ],
      revision: { hogares_imputar: cerradas.length ? 900 : 1180, regiones_con_imputacion: 7 },
      tendencia: [{ periodo: "202608", pct_imputado: 0.07, actual: false }, { periodo: "202609", pct_imputado: 0.073, actual: true }],
      comparaciones: [{ etiqueta: "vs mes pasado", delta_pp: 0.3 }],
      donantes: [{ usos: 1, hogares: 700 }],
    },
  }
}

const ESCENARIOS: Escenarios = {
  elegido_id: "e1",
  escenarios: [{
    id: "e1", nombre: "Mes pasado", es_referencia: true, creado_por: "sistema", creado_en: "2026-10-19T10:00:00Z",
    parametros: { f_ok: 0.9 }, ajustes: { regiones_cerradas: [] },
    resumen: [{ id: "imputados", etiqueta: "Hogares imputados", valor: 1180, formato: "num" }],
  }],
}

function publicacion(over: Partial<Publicacion>): Publicacion {
  return {
    estado: "borrador", engine: "simulated", escenario_id: null, destino: null,
    plan: [{ paso: 1, tabla: "J_AtosCompra_New", cambio: "+48.380 actos" }],
    chequeos: [{ texto: "Prueba sin escribir: sin errores", nivel: "ok" }],
    enviado_por: null, aprobado_por: null, puede_enviar: true, puede_aprobar: false, bitacora: [],
    ...over,
  }
}

function renderAt(search: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/elegibilidad${search}`]}>
        <IteracionWorkspace config={ELEGIBILIDAD} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getPaises.mockResolvedValue([
    { id: "brasil", label: "Brasil", panel: "hogares" },
    { id: "chile", label: "Chile", panel: "hogares" },
  ])
  h.getParametros.mockResolvedValue(PARAMETROS)
  h.simular.mockImplementation((_p, _pais, _per, body) => Promise.resolve(simulacion(body.ajustes.regiones_cerradas)))
  h.getEscenarios.mockResolvedValue(ESCENARIOS)
  h.getPublicacion.mockResolvedValue(publicacion({}))
})

describe("IteracionWorkspace (Elegibilidad)", () => {
  it("sin preparar: muestra el aviso de datos simulados y bloquea los pasos siguientes", async () => {
    h.getPreparacion.mockResolvedValue(preparacion("sin_preparar"))
    renderAt("?periodo=202609")
    expect(await screen.findByTestId("it-aviso-simulado")).toBeInTheDocument()
    expect(screen.getByTestId("it-paso-iterar")).toBeDisabled()
    expect(screen.getByTestId("it-paso-publicar")).toBeDisabled()
    expect(screen.getByTestId("it-pais-brasil")).toHaveAttribute("aria-pressed", "true")
  })

  it("preparar lanza la preparación del cierre elegido", async () => {
    h.getPreparacion.mockResolvedValue(preparacion("sin_preparar"))
    h.prepararDatos.mockResolvedValue(preparacion("preparando"))
    renderAt("?periodo=202609&pais=chile")
    await userEvent.click(await screen.findByTestId("it-preparar"))
    expect(h.prepararDatos).toHaveBeenCalledWith("elegibilidad", "chile", "202609")
    expect(await screen.findByText(/Preparando/)).toBeInTheDocument()
  })

  it("preparar: el avance se ve en la tarjeta de tablas, fila por fila", async () => {
    h.getPreparacion.mockResolvedValue({
      ...preparacion("preparando"),
      tablas: [
        { nombre: "J_AtosCompra_New", filas: null, estado: "pendiente" },
        { nombre: "RG_Panelis", filas: null, estado: "pendiente" },
      ],
      progreso: {
        segundos: 95,
        pasos: [
          { id: "J_AtosCompra_New", titulo: "Leer J_AtosCompra_New", estado: "listo", filas: 224988, segundos: 12 },
          { id: "RG_Panelis", titulo: "Leer RG_Panelis", estado: "en_curso", filas: 40000, segundos: 7 },
          { id: "guardar", titulo: "Guardar los datos preparados", estado: "pendiente", filas: null, segundos: null },
        ],
      },
    })
    renderAt("?periodo=202609")
    expect(within(await screen.findByTestId("it-tabla-J_AtosCompra_New")).getByText("Lista · 0:12")).toBeInTheDocument()
    const enCurso = screen.getByTestId("it-tabla-RG_Panelis")
    expect(within(enCurso).getByText("40.000")).toBeInTheDocument()
    expect(within(enCurso).getByText("Leyendo · 0:07")).toBeInTheDocument()
    expect(within(screen.getByTestId("it-tabla-guardar")).getByText("En cola")).toBeInTheDocument()
    expect(screen.getByText("Preparando · 1:35")).toBeInTheDocument()
  })

  it("iterar: cerrar una región vuelve a simular con ese ajuste", async () => {
    h.getPreparacion.mockResolvedValue(preparacion("lista"))
    renderAt("?periodo=202609&paso=iterar")
    // Las regiones OK parten plegadas: primero se ven las que requieren atención.
    await userEvent.click(await screen.findByTestId("it-regiones-ok"))
    const fila = await screen.findByTestId("it-region-NE")
    expect(within(fila).getByText("OK")).toBeInTheDocument()
    await userEvent.click(within(fila).getByRole("button", { name: "No imputar en Nordeste" }))
    await waitFor(() =>
      expect(h.simular).toHaveBeenLastCalledWith("elegibilidad", "brasil", "202609", {
        parametros: { f_ok: 0.9 },
        ajustes: { regiones_cerradas: ["NE"], muestra_ideal: {} },
      }, expect.any(Function)),
    )
    expect(await within(screen.getByTestId("it-region-NE")).findByText("Sin imputar")).toBeInTheDocument()
  })

  it("publicar: el analista envía el escenario elegido", async () => {
    h.getPreparacion.mockResolvedValue(preparacion("lista"))
    h.enviarPublicacion.mockResolvedValue(publicacion({ estado: "pendiente", escenario_id: "e1", puede_enviar: false, enviado_por: "ana" }))
    renderAt("?periodo=202609&paso=publicar")
    await userEvent.click(await screen.findByTestId("it-enviar"))
    expect(h.enviarPublicacion).toHaveBeenCalledWith("elegibilidad", "brasil", "202609", { escenario_id: "e1", destino: undefined })
    expect(await screen.findByText("Pendiente de aprobación")).toBeInTheDocument()
    expect(screen.queryByTestId("it-aprobar")).not.toBeInTheDocument()
  })

  it("publicar: el responsable ve aprobar y devolver; devolver exige comentario", async () => {
    h.getPreparacion.mockResolvedValue(preparacion("lista"))
    h.getPublicacion.mockResolvedValue(publicacion({ estado: "pendiente", escenario_id: "e1", puede_enviar: false, puede_aprobar: true, enviado_por: "ana" }))
    h.devolverPublicacion.mockResolvedValue(publicacion({ estado: "borrador" }))
    renderAt("?periodo=202609&paso=publicar")
    expect(await screen.findByTestId("it-aprobar")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Devolver con comentario" }))
    await userEvent.click(screen.getByRole("button", { name: "Devolver" }))
    expect(h.devolverPublicacion).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText("¿Qué hay que revisar?"), "revisar Nordeste")
    await userEvent.click(screen.getByRole("button", { name: "Devolver" }))
    expect(h.devolverPublicacion).toHaveBeenCalledWith("elegibilidad", "brasil", "202609", "revisar Nordeste")
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const h = vi.hoisted(() => ({
  getPaises: vi.fn(),
  getPreparacion: vi.fn(),
}))
vi.mock("@/modules/iteracion/api", () => ({
  ...h,
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
// La pestaña de configuración del país tiene sus propias pruebas (PesajeParametrosTab.test.tsx).
vi.mock("@/modules/pesaje/components/PesajeParametrosTab", () => ({
  PesajeParametrosTab: () => <div>configuración del país</div>,
}))

import { PesajePage } from "@/modules/pesaje/pages/PesajePage"

function renderPage(search = "") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/pesaje${search}`]}>
        <PesajePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  h.getPaises.mockResolvedValue([
    { id: "brasil", label: "Brasil", panel: "hogares" },
    { id: "brasil_ooh", label: "Brasil OOH", panel: "ooh" },
  ])
  h.getPreparacion.mockResolvedValue({
    proceso: "pesaje", pais: "brasil", periodo: "202609", engine: "simulated", estado: "sin_preparar",
    preparado_en: null, version_silver: null, fuente: "Snapshot bronze prd", tablas: [], validaciones: [],
    dependencias: [{ proceso: "elegibilidad", estado: "pendiente", detalle: "Elegibilidad brasil 202609 sin publicar" }],
  })
})

describe("PesajePage", () => {
  it("abre en la pestaña Cierre con los paneles de hogares y OOH separados", async () => {
    renderPage()
    expect(await screen.findByRole("heading", { name: "Pesaje" })).toBeInTheDocument()
    expect(await screen.findByText("OOH · individuos")).toBeInTheDocument()
    expect(screen.getByTestId("it-pais-brasil_ooh")).toBeInTheDocument()
  })

  it("no deja preparar mientras Elegibilidad del mismo cierre no esté publicada", async () => {
    renderPage()
    expect(await screen.findByTestId("it-preparar")).toBeDisabled()
    expect(screen.getByText(/Se habilita cuando Elegibilidad/)).toBeInTheDocument()
  })

  it("la configuración del país sigue en su pestaña", async () => {
    renderPage()
    await userEvent.click(screen.getByRole("tab", { name: "Configuración del país" }))
    expect(await screen.findByText("configuración del país")).toBeInTheDocument()
  })
})

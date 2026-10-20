import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { Hilo } from "@/modules/iteracion/types"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const h = vi.hoisted(() => ({
  getConversaciones: vi.fn(),
  crearConversacion: vi.fn(),
  responderConversacion: vi.fn(),
  cambiarEstadoConversacion: vi.fn(),
}))
vi.mock("@/modules/iteracion/api", () => h)

import { BotonConversaciones, ConversacionesProvider } from "@/modules/iteracion/components/Conversaciones"
import { Seccion } from "@/modules/iteracion/components/piezas"

const hilo = (over: Partial<Hilo>): Hilo => ({
  id: "q1", proceso: "pesaje", ancla: "iterar.celdas", pais: null, tipo: "pregunta", titulo: "Reglas de alerta",
  texto: "¿Les sirven?", propuesta: "Partir con estas", estado: "abierta",
  autor: { email: "dev", nombre: "Equipo de desarrollo" }, creado: "2026-10-20T20:00:00+00:00",
  actualizado: "2026-10-20T20:00:00+00:00", mensajes: [], ...over,
})

function ver(onIr = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ConversacionesProvider proceso="pesaje" pais="brasil" onIr={onIr}>
        <BotonConversaciones />
        <Seccion ancla="iterar.celdas" titulo="Celdas del Universo">contenido</Seccion>
        <Seccion ancla="iterar.revision" titulo="Revisión">contenido</Seccion>
      </ConversacionesProvider>
    </QueryClientProvider>,
  )
  return onIr
}

describe("conversaciones ancladas", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.getConversaciones.mockResolvedValue([
      hilo({}),
      hilo({ id: "q2", ancla: "iterar.celdas", estado: "resuelta", titulo: "Segmentos" }),
      hilo({ id: "q3", ancla: "iterar.idpeso", pais: "argentina", titulo: "Solo Argentina" }),
    ])
  })

  it("la burbuja cuenta lo abierto de su sección y del país; sin nada abierto invita a comentar", async () => {
    ver()
    await waitFor(() => expect(screen.getByTestId("it-burbuja-iterar.celdas")).toHaveTextContent("1"))
    expect(screen.getByRole("button", { name: "Comentar Iterar · Revisión contra la historia" })).toBeInTheDocument()
    // la pregunta de Argentina no cuenta en Brasil
    expect(screen.getByTestId("it-boton-conversaciones")).toHaveTextContent("1")
  })

  it("abre el panel en la sección, muestra la propuesta y responde con lo escrito", async () => {
    h.responderConversacion.mockResolvedValue(
      hilo({ mensajes: [{ id: "m1", texto: "De acuerdo", creado: "2026-10-21T10:00:00+00:00", autor: { email: "j", nombre: "José" } }] }),
    )
    ver()
    await userEvent.click(await screen.findByTestId("it-burbuja-iterar.celdas"))
    const panel = await screen.findByTestId("it-conversaciones")
    const tarjeta = within(panel).getByTestId("it-hilo-q1")
    expect(within(tarjeta).getByText("Partir con estas")).toBeInTheDocument()
    expect(within(panel).queryByTestId("it-hilo-q2")).not.toBeInTheDocument() // resuelta: oculta por defecto
    await userEvent.type(within(tarjeta).getByRole("textbox"), "De acuerdo")
    await userEvent.click(within(tarjeta).getByRole("button", { name: "Responder" }))
    expect(h.responderConversacion).toHaveBeenCalledWith("pesaje", "q1", "De acuerdo")
    expect(await within(panel).findByText("José")).toBeInTheDocument()
  })

  it("desde el panel general, «Ir a» lleva a la sección del hilo", async () => {
    const onIr = ver()
    await userEvent.click(await screen.findByTestId("it-boton-conversaciones"))
    const panel = await screen.findByTestId("it-conversaciones")
    await userEvent.click(within(within(panel).getByTestId("it-hilo-q1")).getByRole("button", { name: /^Ir a/ }))
    expect(onIr).toHaveBeenCalledWith("iterar.celdas")
  })

  it("publica un problema nuevo en la sección abierta, para el país si se marca", async () => {
    h.crearConversacion.mockResolvedValue(hilo({ id: "h-1", tipo: "problema", titulo: "No cuadra" }))
    ver()
    await userEvent.click(await screen.findByTestId("it-burbuja-iterar.celdas"))
    const panel = await screen.findByTestId("it-conversaciones")
    await userEvent.selectOptions(within(panel).getByLabelText("Tipo"), "problema")
    await userEvent.click(within(panel).getByLabelText("solo brasil"))
    await userEvent.type(within(panel).getByLabelText("Nuevo comentario"), "No cuadra")
    await userEvent.click(within(panel).getByRole("button", { name: "Publicar" }))
    expect(h.crearConversacion).toHaveBeenCalledWith("pesaje", {
      ancla: "iterar.celdas", tipo: "problema", texto: "No cuadra", pais: "brasil",
    })
  })
})

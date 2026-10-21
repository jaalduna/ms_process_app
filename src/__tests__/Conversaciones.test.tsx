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
  subirAdjunto: vi.fn(),
  descargarAdjunto: vi.fn(),
}))
vi.mock("@/modules/iteracion/api", () => h)

import { BotonConversaciones, ConversacionesProvider } from "@/modules/iteracion/components/Conversaciones"
import { Seccion } from "@/modules/iteracion/components/piezas"

const hilo = (over: Partial<Hilo>): Hilo => ({
  id: "q1", proceso: "pesaje", ancla: "iterar.celdas", pais: null, tipo: "pregunta", titulo: "Reglas de alerta",
  texto: "¿Les sirven?", propuesta: "Partir con estas", estado: "abierta",
  autor: { email: "dev", nombre: "Equipo de desarrollo" }, creado: "2026-10-20T20:00:00+00:00",
  actualizado: "2026-10-20T20:00:00+00:00", mensajes: [], adjuntos: [], ...over,
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
    URL.createObjectURL = vi.fn(() => "blob:local")
    URL.revokeObjectURL = vi.fn()
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
      hilo({ mensajes: [{ id: "m1", texto: "De acuerdo", creado: "2026-10-21T10:00:00+00:00", autor: { email: "j", nombre: "José" }, adjuntos: [] }] }),
    )
    ver()
    await userEvent.click(await screen.findByTestId("it-burbuja-iterar.celdas"))
    const panel = await screen.findByTestId("it-conversaciones")
    const tarjeta = within(panel).getByTestId("it-hilo-q1")
    expect(within(tarjeta).getByText("Partir con estas")).toBeInTheDocument()
    expect(within(panel).queryByTestId("it-hilo-q2")).not.toBeInTheDocument() // resuelta: oculta por defecto
    await userEvent.type(within(tarjeta).getByRole("textbox"), "De acuerdo")
    await userEvent.click(within(tarjeta).getByRole("button", { name: "Responder" }))
    expect(h.responderConversacion).toHaveBeenCalledWith("pesaje", "q1", "De acuerdo", [])
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
      ancla: "iterar.celdas", tipo: "problema", texto: "No cuadra", pais: "brasil", adjuntos: [],
    })
  })

  it("pegar un pantallazo lo sube, se ve antes de enviar y se publica con el comentario", async () => {
    h.subirAdjunto.mockResolvedValue({ id: "a-1", nombre: "pantallazo.png", tipo: "image/png", tamano: 2048, imagen: true })
    h.crearConversacion.mockResolvedValue(hilo({ id: "h-2" }))
    ver()
    await userEvent.click(await screen.findByTestId("it-burbuja-iterar.celdas"))
    const panel = await screen.findByTestId("it-conversaciones")
    const caja = within(panel).getByLabelText("Nuevo comentario")
    const img = new File([new Uint8Array([137, 80, 78, 71])], "image.png", { type: "image/png" })
    caja.focus()
    await userEvent.paste({ files: [img], getData: () => "", types: ["Files"] } as unknown as DataTransfer)
    await waitFor(() => expect(h.subirAdjunto).toHaveBeenCalledTimes(1))
    // un pantallazo pegado se renombra para que se entienda
    expect((h.subirAdjunto.mock.calls[0][1] as File).name).toMatch(/^pantallazo \d\d-\d\d-\d\d\.png$/)
    expect(within(panel).getAllByTestId("it-adjunto-borrador")).toHaveLength(1)
    await userEvent.type(caja, "Mira esto")
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Publicar" })).toBeEnabled())
    await userEvent.click(within(panel).getByRole("button", { name: "Publicar" }))
    expect(h.crearConversacion).toHaveBeenCalledWith("pesaje", expect.objectContaining({ adjuntos: ["a-1"] }))
    await waitFor(() => expect(within(panel).queryAllByTestId("it-adjunto-borrador")).toHaveLength(0))
  })

  it("en el hilo, la imagen se ve en miniatura y el archivo se descarga con su nombre y tamaño", async () => {
    h.getConversaciones.mockResolvedValue([
      hilo({
        adjuntos: [
          { id: "a-img", nombre: "error.png", tipo: "image/png", tamano: 2048, imagen: true },
          { id: "a-xls", nombre: "regiones.xlsx", tipo: "application/vnd.ms-excel", tamano: 3 * 1024 * 1024, imagen: false },
        ],
      }),
    ])
    h.descargarAdjunto.mockResolvedValue(new Blob(["x"], { type: "image/png" }))
    ver()
    await userEvent.click(await screen.findByTestId("it-burbuja-iterar.celdas"))
    const panel = await screen.findByTestId("it-conversaciones")
    expect(await within(panel).findByAltText("error.png")).toBeInTheDocument()
    expect(h.descargarAdjunto).toHaveBeenCalledWith("pesaje", "a-img")
    const xls = within(panel).getByTestId("it-adjunto-a-xls")
    expect(xls).toHaveTextContent("regiones.xlsx")
    expect(xls).toHaveTextContent("3 MB")
    await userEvent.click(xls)
    await waitFor(() => expect(h.descargarAdjunto).toHaveBeenCalledWith("pesaje", "a-xls"))
  })
})

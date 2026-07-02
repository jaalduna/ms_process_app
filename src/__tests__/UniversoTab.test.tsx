import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

const mockGetUniverso = vi.fn()
const mockDownloadUniversoExcel = vi.fn<(pais: string, template: boolean) => Promise<void>>()

vi.mock("@/modules/pesaje/params/api", () => ({
  getUniverso: (...a: unknown[]) => mockGetUniverso(...a),
  downloadUniversoExcel: (...a: [string, boolean]) => mockDownloadUniversoExcel(...a),
}))

const UNIVERSO_RESPONSE = {
  country: "chile",
  rows: [
    {
      categoria: "TOTAL Hogares",
      expresion: "[ALL]",
      jerarquia: 0,
      secuencia: 0,
      marginales: 0,
      marginales_por_periodo: { "Q3-25": 6240000, "Q4-25": 6255000, "Q1-26": 6270000, "Q2-26": 6285000 },
    },
  ],
  version: { hash: "deadbeefcafe", modified_at: "2026-06-01T00:00:00Z", row_count: 1 },
}

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
}

async function renderTab() {
  const { UniversoTab } = await import("@/modules/pesaje/params/UniversoTab")
  return render(
    <QueryClientProvider client={createClient()}>
      <UniversoTab pais="chile" country="Chile" />
    </QueryClientProvider>,
  )
}

describe("UniversoTab — Excel download (JAA-790)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUniverso.mockResolvedValue(UNIVERSO_RESPONSE)
    mockDownloadUniversoExcel.mockResolvedValue(undefined)
  })

  it("ac1: renders the download button + template toggle next to the upload button", async () => {
    await renderTab()
    expect(await screen.findByTestId("download-excel-btn")).toBeVisible()
    expect(screen.getByTestId("download-template-toggle")).toBeVisible()
    expect(screen.getByTestId("universo-upload-open")).toBeVisible()
  })

  it("ac2: downloads current values by default and the template after toggling", async () => {
    const user = userEvent.setup()
    await renderTab()
    await screen.findByTestId("download-excel-btn")

    await user.click(screen.getByTestId("download-excel-btn"))
    expect(mockDownloadUniversoExcel).toHaveBeenLastCalledWith("chile", false)

    await user.click(screen.getByTestId("download-template-toggle"))
    expect(screen.getByTestId("download-mode-label")).toHaveTextContent(/template vacío/i)
    await user.click(screen.getByTestId("download-excel-btn"))
    expect(mockDownloadUniversoExcel).toHaveBeenLastCalledWith("chile", true)
  })
})

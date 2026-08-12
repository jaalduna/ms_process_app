import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

// La página lee el rol para decidir si el botón de ejecutar va habilitado.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ roles: ["admin"] }),
}))


// Mock sonner toast
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}))

const h = vi.hoisted(() => ({
  getCountries: vi.fn(),
  getDataAvailability: vi.fn(),
  getLastSync: vi.fn(),
  getLastCalibration: vi.fn(),
  getProcessConfig: vi.fn(),
  putProcessConfig: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  getCountries: h.getCountries,
  getDataAvailability: h.getDataAvailability,
  getLastSync: h.getLastSync,
  getLastCalibration: h.getLastCalibration,
  getProcessConfig: h.getProcessConfig,
  putProcessConfig: h.putProcessConfig,
  setTokenProvider: vi.fn(),
  api: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

async function renderCalibrationPage() {
  const { CalibrationPage } = await import("@/modules/calibracion/pages/CalibrationPage")
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CalibrationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function configResponse(config: Record<string, unknown>, editable: boolean) {
  return { process: "calibration", scope: "default", config, editable }
}

describe("CalibrationConfigDialog — shared config wiring (JAA-645)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No country cards needed — keep the test focused on the config dialog.
    h.getCountries.mockResolvedValue({ countries: [] })
    h.getDataAvailability.mockResolvedValue({ period: "202602", countries: {} })
    h.getLastSync.mockResolvedValue({ countries: {} })
    h.getLastCalibration.mockResolvedValue({ countries: {} })
  })

  it("ac2: hydrates lookback_months from GET and PUTs the full config on save", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse({ aggregations: { region: false, nivel_2: true }, lookback_months: 24 }, true),
    )
    h.putProcessConfig.mockResolvedValue(
      configResponse({ aggregations: { region: false, nivel_2: true }, lookback_months: 48 }, true),
    )

    await renderCalibrationPage()

    // GET fired for the calibration process.
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("calibration"))

    // Open the settings dialog.
    await user.click(await screen.findByRole("button", { name: /Calibration settings/i }))
    const dialog = await screen.findByRole("dialog")

    // Hydrated value is shown (24 from GET, not the 36 default).
    const lookback = within(dialog).getByRole("spinbutton")
    expect(lookback).toHaveValue(24)

    // Edit lookback to 48 and save.
    await user.clear(lookback)
    await user.type(lookback, "48")
    await user.click(within(dialog).getByRole("button", { name: /^Guardar$/i }))

    // PUT carries the FULL config object (edited lookback + the hydrated aggregations).
    await waitFor(() =>
      expect(h.putProcessConfig).toHaveBeenCalledWith("calibration", {
        aggregations: { region: false, nivel_2: true },
        lookback_months: 48,
      }),
    )
  })

  it("ac3: editable=false renders read-only controls and no Guardar button", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse({ aggregations: { region: true, nivel_2: false }, lookback_months: 36 }, false),
    )

    await renderCalibrationPage()
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("calibration"))

    await user.click(await screen.findByRole("button", { name: /Calibration settings/i }))
    const dialog = await screen.findByRole("dialog")

    // Lookback input + aggregation checkboxes are disabled and there is NO save button.
    expect(within(dialog).getByRole("spinbutton")).toBeDisabled()
    for (const cb of within(dialog).getAllByRole("checkbox")) {
      expect(cb).toBeDisabled()
    }
    expect(within(dialog).queryByRole("button", { name: /^Guardar$/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: /Restore defaults/i })).not.toBeInTheDocument()
    expect(h.putProcessConfig).not.toHaveBeenCalled()
  })

  it("ac3: editable=true exposes an enabled Guardar button and editable controls", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse({ aggregations: { region: true, nivel_2: true }, lookback_months: 36 }, true),
    )

    await renderCalibrationPage()
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("calibration"))

    await user.click(await screen.findByRole("button", { name: /Calibration settings/i }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByRole("button", { name: /^Guardar$/i })).toBeEnabled()
    expect(within(dialog).getByRole("spinbutton")).not.toBeDisabled()
    for (const cb of within(dialog).getAllByRole("checkbox")) {
      expect(cb).not.toBeDisabled()
    }
  })
})

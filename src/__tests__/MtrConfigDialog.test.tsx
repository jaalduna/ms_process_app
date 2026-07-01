import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

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
  getLastMtr: vi.fn(),
  getProcessConfig: vi.fn(),
  putProcessConfig: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  getCountries: h.getCountries,
  getLastMtr: h.getLastMtr,
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

async function renderMtrPage() {
  const { MtrPage } = await import("@/modules/mtr/pages/MtrPage")
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MtrPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function configResponse(config: Record<string, unknown>, editable: boolean) {
  return { process: "mtr", scope: "default", config, editable }
}

describe("MtrConfigDialog — shared config wiring (JAA-644)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No country cards needed — keep the test focused on the config dialog.
    h.getCountries.mockResolvedValue({ countries: [] })
    h.getLastMtr.mockResolvedValue({ countries: {} })
  })

  it("ac2: hydrates target_threshold from GET and PUTs the full config on save", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse({ target_threshold: 0.95, imputation_method: "regression", quality_min: 0.7 }, true),
    )
    h.putProcessConfig.mockResolvedValue(
      configResponse({ target_threshold: 0.9, imputation_method: "regression", quality_min: 0.7 }, true),
    )

    await renderMtrPage()

    // GET fired for the mtr process.
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("mtr"))

    // Open the settings dialog.
    await user.click(await screen.findByRole("button", { name: /MTR settings/i }))
    const dialog = await screen.findByRole("dialog")

    // Hydrated value is shown (0.95 from GET, not the 0.85 default).
    const numberInputs = within(dialog).getAllByRole("spinbutton")
    expect(numberInputs[0]).toHaveValue(0.95)

    // Edit target_threshold to 0.9 and save.
    await user.clear(numberInputs[0])
    await user.type(numberInputs[0], "0.9")
    await user.click(within(dialog).getByRole("button", { name: /^Guardar$/i }))

    // PUT carries the FULL params object (edited threshold + the rest).
    await waitFor(() =>
      expect(h.putProcessConfig).toHaveBeenCalledWith("mtr", {
        target_threshold: 0.9,
        imputation_method: "regression",
        quality_min: 0.7,
      }),
    )
  })

  it("ac3: editable=false renders read-only controls and no Guardar button", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse({ target_threshold: 0.88, imputation_method: "weighted_average", quality_min: 0.8 }, false),
    )

    await renderMtrPage()
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("mtr"))

    await user.click(await screen.findByRole("button", { name: /MTR settings/i }))
    const dialog = await screen.findByRole("dialog")

    // Number inputs are disabled and there is NO save button.
    for (const input of within(dialog).getAllByRole("spinbutton")) {
      expect(input).toBeDisabled()
    }
    expect(within(dialog).queryByRole("button", { name: /^Guardar$/i })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: /Restore defaults/i })).not.toBeInTheDocument()
    expect(h.putProcessConfig).not.toHaveBeenCalled()
  })

  it("ac3: editable=true exposes an enabled Guardar button", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse({ target_threshold: 0.85, imputation_method: "weighted_average", quality_min: 0.8 }, true),
    )

    await renderMtrPage()
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("mtr"))

    await user.click(await screen.findByRole("button", { name: /MTR settings/i }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByRole("button", { name: /^Guardar$/i })).toBeEnabled()
    for (const input of within(dialog).getAllByRole("spinbutton")) {
      expect(input).not.toBeDisabled()
    }
  })
})

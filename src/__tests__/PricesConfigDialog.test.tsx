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
  getLastPrices: vi.fn(),
  getProcessConfig: vi.fn(),
  putProcessConfig: vi.fn(),
}))

vi.mock("@/lib/api", () => ({
  getCountries: h.getCountries,
  getLastPrices: h.getLastPrices,
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

async function renderPreciosPage() {
  const { PreciosPage } = await import("@/modules/precios/pages/PreciosPage")
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PreciosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function configResponse(config: Record<string, unknown>, editable: boolean) {
  return { process: "prices", scope: "default", config, editable }
}

describe("PricesConfigDialog — shared config wiring (JAA-646)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // No country cards needed — keep the test focused on the config dialog.
    h.getCountries.mockResolvedValue({ countries: [] })
    h.getLastPrices.mockResolvedValue({ countries: {} })
  })

  it("ac2: hydrates placeholder_param_1 from GET and PUTs the full config on save", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse(
        { placeholder_param_1: 7, placeholder_param_2: "hello", notes: "n" },
        true,
      ),
    )
    h.putProcessConfig.mockResolvedValue(
      configResponse(
        { placeholder_param_1: 42, placeholder_param_2: "hello", notes: "n" },
        true,
      ),
    )

    await renderPreciosPage()

    // GET fired for the prices process.
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("prices"))

    // Open the settings dialog.
    await user.click(await screen.findByRole("button", { name: /Prices settings/i }))
    const dialog = await screen.findByRole("dialog")

    // Hydrated value is shown (7 from GET, not the 0 default).
    const param1 = within(dialog).getByRole("spinbutton")
    expect(param1).toHaveValue(7)

    // Edit placeholder_param_1 to 42 and save.
    await user.clear(param1)
    await user.type(param1, "42")
    await user.click(within(dialog).getByRole("button", { name: /^Guardar$/i }))

    // PUT carries the FULL config object (edited param + the hydrated rest).
    await waitFor(() =>
      expect(h.putProcessConfig).toHaveBeenCalledWith("prices", {
        placeholder_param_1: 42,
        placeholder_param_2: "hello",
        notes: "n",
      }),
    )
  })

  it("ac3: editable=false renders read-only controls and no Guardar button", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse(
        { placeholder_param_1: 3, placeholder_param_2: "ro", notes: "" },
        false,
      ),
    )

    await renderPreciosPage()
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("prices"))

    await user.click(await screen.findByRole("button", { name: /Prices settings/i }))
    const dialog = await screen.findByRole("dialog")

    // All inputs are disabled and there is NO save/restore button.
    expect(within(dialog).getByRole("spinbutton")).toBeDisabled()
    for (const tb of within(dialog).getAllByRole("textbox")) {
      expect(tb).toBeDisabled()
    }
    expect(
      within(dialog).queryByRole("button", { name: /^Guardar$/i }),
    ).not.toBeInTheDocument()
    expect(
      within(dialog).queryByRole("button", { name: /Restore defaults/i }),
    ).not.toBeInTheDocument()
    expect(h.putProcessConfig).not.toHaveBeenCalled()
  })

  it("ac3: editable=true exposes an enabled Guardar button and editable controls", async () => {
    const user = userEvent.setup()
    h.getProcessConfig.mockResolvedValue(
      configResponse(
        { placeholder_param_1: 1, placeholder_param_2: "x", notes: "y" },
        true,
      ),
    )

    await renderPreciosPage()
    await waitFor(() => expect(h.getProcessConfig).toHaveBeenCalledWith("prices"))

    await user.click(await screen.findByRole("button", { name: /Prices settings/i }))
    const dialog = await screen.findByRole("dialog")

    expect(within(dialog).getByRole("button", { name: /^Guardar$/i })).toBeEnabled()
    expect(within(dialog).getByRole("spinbutton")).not.toBeDisabled()
    for (const tb of within(dialog).getAllByRole("textbox")) {
      expect(tb).not.toBeDisabled()
    }
  })
})

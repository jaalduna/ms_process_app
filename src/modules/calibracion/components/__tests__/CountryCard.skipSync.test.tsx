import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

// --- Mocks at the hook boundary ---------------------------------------------
const mockStartCalibration = vi.fn().mockResolvedValue(undefined)

vi.mock("../../hooks/useCalibration", () => ({
  useCalibration: () => ({
    job: undefined,
    isPending: false,
    isCancelling: false,
    startCalibration: mockStartCalibration,
    cancelCalibration: vi.fn(),
  }),
}))

vi.mock("@/hooks/useProcessStatus", () => ({
  useProcessStatus: () => ({ data: undefined }),
  useProcessEntry: () => ({ isClosed: false }),
  useSetProcessStatus: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

import { CountryCard } from "../CountryCard"
import type { CountryInfo } from "@/types/api"
import type { DataAvailability, CalibrationConfig } from "../../types"

const country: CountryInfo = { code: "bolivia", queries: [], queries_count: 0, type: "country" }
const availability: DataAvailability = { elegibilidad: true, pesaje: true }
const calibrationConfig: CalibrationConfig = {
  aggregations: { region: false, nivel_2: false },
  lookback_months: 12,
}

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return render(
    <Wrapper>
      <CountryCard
        country={country}
        period="202605"
        availability={availability}
        availabilityLoading={false}
        calibrationConfig={calibrationConfig}
        lastSyncDate={null}
        lastCalibrationDate={null}
      />
    </Wrapper>,
  )
}

describe("CountryCard — skip_sync toggle", () => {
  beforeEach(() => mockStartCalibration.mockClear())

  it("defaults skip_sync to false (sync runs) when confirming without toggling", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole("button", { name: /calibrar/i }))
    await user.click(screen.getByRole("button", { name: /^confirm$/i }))

    expect(mockStartCalibration).toHaveBeenCalledTimes(1)
    expect(mockStartCalibration.mock.calls[0][0]).toMatchObject({ skip_sync: false })
  })

  it("sends skip_sync true after enabling the toggle", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole("button", { name: /calibrar/i }))
    await user.click(screen.getByRole("switch", { name: /saltar sincronización/i }))
    await user.click(screen.getByRole("button", { name: /^confirm$/i }))

    expect(mockStartCalibration).toHaveBeenCalledTimes(1)
    expect(mockStartCalibration.mock.calls[0][0]).toMatchObject({ skip_sync: true })
  })

  it("does not render any internal group_by config string or control (JAA-761)", async () => {
    const user = userEvent.setup()
    renderCard()
    await user.click(screen.getByRole("button", { name: /calibrar/i }))

    const dialog = screen.getByRole("alertdialog")
    expect(dialog).not.toHaveTextContent(/group by/i)
    expect(dialog).not.toHaveTextContent(/IdProduto_Calib/i)
    expect(screen.queryByRole("button", { name: /group.?by|agrupaci[oó]n/i })).not.toBeInTheDocument()
  })
})

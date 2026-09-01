import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { WeightingDetailModal } from "../WeightingDetailModal"
import type { JVersion } from "@/types/api"

vi.mock("@/lib/api", () => ({
  getProcessSnapshots: vi.fn(),
  downloadWeightingCSV: vi.fn(),
}))
import { getProcessSnapshots } from "@/lib/api"

vi.mock("../../hooks/useWeighting", () => ({
  useWeightingRun: () => ({ data: undefined }),
  useCancelWeighting: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock("../../params/hooks", () => ({
  useExecutionParams: () => ({ data: undefined }),
  usePublishWeightingParams: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function version(tag: string): JVersion {
  return {
    tag, country: "bolivia", period: "202605",
    table_fqn: "000-sql-databricks-bridge.bolivia.mordom",
    delta_version: 7, delta_timestamp: "2026-06-02T08:15:00.000Z",
    row_count: 42000, period_min: "202101", period_max: "202605",
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-02T08:15:00.000Z",
  }
}

const SNAPSHOTS: JVersion[] = [version("bolivia-202605-1a2b3c4d")]

function setup() {
  const onRun = vi.fn()
  const onOpenChange = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <WeightingDetailModal
        run={null}
        open
        onOpenChange={onOpenChange}
        onRun={onRun}
        countryCode="bolivia"
        period="202605"
      />
    </QueryClientProvider>,
  )
  return { onRun }
}

describe("WeightingDetailModal · fuente de datos (JAA-1179/JAA-1183)", () => {
  beforeEach(() => {
    vi.mocked(getProcessSnapshots).mockResolvedValue({ items: SNAPSHOTS })
  })

  it("lanza sincronizando por defecto", async () => {
    const { onRun } = setup()
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }))
    const buttons = await screen.findAllByRole("button", { name: "Ejecutar" })
    await userEvent.click(buttons[buttons.length - 1])
    expect(onRun).toHaveBeenCalledWith(expect.any(Object), "sync")
  })

  it("con una versión elegida, envía su tag como j_source", async () => {
    const { onRun } = setup()
    await userEvent.click(await screen.findByLabelText("Usar una versión guardada"))
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }))
    const buttons = await screen.findAllByRole("button", { name: "Ejecutar" })
    await userEvent.click(buttons[buttons.length - 1])
    expect(onRun).toHaveBeenCalledWith(expect.any(Object), "bolivia-202605-1a2b3c4d")
  })

  it("pide las versiones bronze del país", async () => {
    setup()
    await screen.findByLabelText("Usar una versión guardada")
    expect(getProcessSnapshots).toHaveBeenCalledWith("pesaje", { country: "bolivia" })
  })
})

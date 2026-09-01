import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { EligibilityCountryRow } from "../EligibilityCountryRow"
import { DEFAULT_ELIGIBILITY_PARAMS } from "../EligibilityConfigDialog"
import type { JVersion } from "@/types/api"

vi.mock("@/lib/api", () => ({
  getProcessSnapshots: vi.fn(),
  downloadEligibilityFile: vi.fn(),
  downloadEligibilityZip: vi.fn(),
}))
import { getProcessSnapshots } from "@/lib/api"

vi.mock("@/hooks/usePipelineDeps", () => ({
  usePipelineDeps: () => ({ dependencies: [], allMet: true }),
}))
vi.mock("@/hooks/useProcessStatus", () => ({
  useProcessEntry: () => ({ isClosed: false }),
  useProcessStatus: () => ({ data: undefined }),
  useSetProcessStatus: () => ({ mutate: vi.fn(), isPending: false }),
}))

const executeMutate = vi.fn()
const createMutate = vi.fn((_vars: unknown, opts?: { onSuccess?: (run: { run_id: string }) => void }) => {
  opts?.onSuccess?.({ run_id: "run-1" })
})

vi.mock("../../hooks/useEligibility", () => ({
  useEligibilityRuns: () => ({ data: [], isLoading: false }),
  useEligibilityHistory: () => ({ data: [], isLoading: false }),
  useEligibilityRun: () => ({ data: undefined }),
  useCreateEligibilityRun: () => ({ mutate: createMutate, isPending: false }),
  useUpdateEligibilityRun: () => ({ mutate: vi.fn(), isPending: false }),
  useExecuteEligibility: () => ({ mutate: executeMutate, isPending: false }),
  useApproveEligibility: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadEligibilityFiles: () => ({ mutate: vi.fn(), isPending: false }),
  useApplyMordom: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelEligibility: () => ({ mutate: vi.fn(), isPending: false }),
}))

function version(tag: string): JVersion {
  return {
    tag, country: "bolivia", period: "202605",
    table_fqn: "000-sql-databricks-bridge.bolivia.j_atoscompra_new_full",
    delta_version: 9, delta_timestamp: "2026-06-02T09:00:00.000Z",
    row_count: 5200000, period_min: "202101", period_max: "202605",
    created_by: "backfill@wp.numerator.com", created_at: "2026-06-02T09:00:00.000Z",
  }
}

const SNAPSHOTS: JVersion[] = [version("bolivia-202605-b2c4f890")]

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <table>
        <tbody>
          <EligibilityCountryRow
            countryCode="bolivia"
            period="202605"
            eligibilityParams={DEFAULT_ELIGIBILITY_PARAMS}
            lastFinalizedDate={null}
          />
        </tbody>
      </table>
    </QueryClientProvider>,
  )
}

describe("EligibilityCountryRow · fuente de datos (JAA-1179/JAA-1183)", () => {
  beforeEach(() => {
    executeMutate.mockClear()
    createMutate.mockClear()
    vi.mocked(getProcessSnapshots).mockResolvedValue({ items: SNAPSHOTS })
  })

  it("ejecuta sincronizando por defecto", async () => {
    setup()
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }))
    await userEvent.click(await screen.findByRole("button", { name: "Confirmar" }))
    expect(executeMutate).toHaveBeenCalledWith(
      { runId: "run-1", jSource: "sync" },
      expect.any(Object),
    )
  })

  it("con una versión elegida, envía su tag como j_source", async () => {
    setup()
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }))
    await userEvent.click(await screen.findByLabelText("Usar una versión guardada"))
    await userEvent.click(screen.getByRole("button", { name: "Confirmar" }))
    expect(executeMutate).toHaveBeenCalledWith(
      { runId: "run-1", jSource: "bolivia-202605-b2c4f890" },
      expect.any(Object),
    )
  })

  it("pide las versiones bronze de elegibilidad del país", async () => {
    setup()
    await userEvent.click(screen.getByRole("button", { name: "Ejecutar" }))
    await screen.findByLabelText("Usar una versión guardada")
    expect(getProcessSnapshots).toHaveBeenCalledWith("elegibilidad", { country: "bolivia" })
  })
})

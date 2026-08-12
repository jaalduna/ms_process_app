import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { WeightingRun } from "@/modules/pesaje/types"

const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: (...a: unknown[]) => mockToastSuccess(...a),
    error: (...a: unknown[]) => mockToastError(...a),
    info: vi.fn(),
  }),
}))

const mockDownloadWeightingCSV = vi.fn()
vi.mock("@/lib/api", () => ({
  downloadWeightingCSV: (...a: unknown[]) => mockDownloadWeightingCSV(...a),
}))

const mockCancelMutate = vi.fn()
vi.mock("@/modules/pesaje/hooks/useWeighting", () => ({
  useWeightingRun: () => ({ data: undefined }),
  useCancelWeighting: () => ({ mutate: mockCancelMutate, isPending: false }),
}))

let publishedState: { params: Record<string, unknown> }
const mockPublishMutateAsync = vi.fn()
vi.mock("@/modules/pesaje/params/hooks", () => ({
  useExecutionParams: () => ({ data: { country: "chile", params: publishedState.params, version: null } }),
  usePublishWeightingParams: () => ({ mutateAsync: mockPublishMutateAsync, isPending: false }),
}))

import { WeightingDetailModal } from "@/modules/pesaje/components/WeightingDetailModal"

const PUBLISHED_DEFAULTS = {
  N_PERIODOS_OUTLIERS: 12,
  MAX_ROUNDS_COLAPSO: 50,
  JERARQUIA_MIN_COLAPSO: 1,
  CORRECAO_BOUNDS: true,
  METODO_BOUNDS: "percentile",
  P_BOUNDS: 2,
  F_BOUNDS: 1.1,
  AGREGACAO_BOUNDS: "union",
  MAX_ERR_RATIO_BOUNDS: 2.0,
}

/** Click the "Ejecutar"/"Re-ejecutar" trigger, then confirm inside the nested
 *  AlertDialog — both buttons share the same accessible name, so the confirm
 *  click must be scoped to the alertdialog to avoid an ambiguous match. */
async function launchAndConfirm(user: ReturnType<typeof userEvent.setup>, label: "Ejecutar" | "Re-ejecutar" = "Ejecutar") {
  await user.click(screen.getByRole("button", { name: label }))
  const dialog = await screen.findByRole("alertdialog")
  await user.click(within(dialog).getByRole("button", { name: label }))
}

function completedRun(overrides: Partial<WeightingRun> = {}): WeightingRun {
  return {
    run_id: "run-1",
    country: "chile",
    period: 202607,
    status: "completed",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:05:00Z",
    started_at: "2026-07-01T00:00:00Z",
    completed_at: "2026-07-01T00:05:00Z",
    parameters_json: { MAX_ROUNDS_COLAPSO: 77, CORRECAO_BOUNDS: false, P_BOUNDS: 3, F_BOUNDS: 1.3 },
    ...overrides,
  }
}

describe("WeightingDetailModal — editable execution params (iterate-and-relaunch)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    publishedState = { params: { ...PUBLISHED_DEFAULTS } }
    mockPublishMutateAsync.mockResolvedValue({ unchanged: false, version: { version: 2 } })
  })

  it("brand-new launch seeds the published default and lets you edit it", async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(
      <WeightingDetailModal
        run={null}
        open={true}
        onOpenChange={() => {}}
        onRun={onRun}
        countryCode="chile"
        period="202607"
      />,
    )

    const maxRounds = await screen.findByLabelText("MAX_ROUNDS_COLAPSO")
    expect(maxRounds).toHaveValue(50)

    await user.clear(maxRounds)
    await user.type(maxRounds, "80")
    await launchAndConfirm(user)

    await waitFor(() => expect(mockPublishMutateAsync).toHaveBeenCalled())
    const publishArg = mockPublishMutateAsync.mock.calls[0][0]
    expect(publishArg.params.MAX_ROUNDS_COLAPSO).toBe(80)
    // Advanced params must survive untouched in the publish payload.
    expect(publishArg.params.METODO_BOUNDS).toBe("percentile")

    await waitFor(() => expect(onRun).toHaveBeenCalled())
    expect(onRun.mock.calls[0][0]).toMatchObject({ MAX_ROUNDS_COLAPSO: 80 })
  })

  it("does not publish when nothing was edited", async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(
      <WeightingDetailModal
        run={null}
        open={true}
        onOpenChange={() => {}}
        onRun={onRun}
        countryCode="chile"
        period="202607"
      />,
    )

    await screen.findByLabelText("MAX_ROUNDS_COLAPSO")
    await launchAndConfirm(user)

    await waitFor(() => expect(onRun).toHaveBeenCalled())
    expect(mockPublishMutateAsync).not.toHaveBeenCalled()
  })

  it("re-run seeds from the run's OWN parameters_json, not the currently published default", async () => {
    render(
      <WeightingDetailModal
        run={completedRun()}
        open={true}
        onOpenChange={() => {}}
        onRun={vi.fn()}
      />,
    )

    // Published default is 50; this run actually used 77 — the re-run editor
    // must show what ran, not the (possibly since-changed) published default.
    expect(await screen.findByLabelText("MAX_ROUNDS_COLAPSO")).toHaveValue(77)
  })

  it("a validation error disables the run button", async () => {
    const user = userEvent.setup()
    render(
      <WeightingDetailModal
        run={null}
        open={true}
        onOpenChange={() => {}}
        onRun={vi.fn()}
        countryCode="chile"
        period="202607"
      />,
    )

    // P_BOUNDS must satisfy 0 < P_BOUNDS < 50 — 100 is a clean invalid value
    // that avoids typing a "-" into a number input (flaky under jsdom).
    const pBounds = await screen.findByLabelText("P_BOUNDS")
    await user.clear(pBounds)
    await user.type(pBounds, "100")

    expect(screen.getByRole("button", { name: "Ejecutar" })).toBeDisabled()
    expect(screen.getByText(/0 < P_BOUNDS < 50/)).toBeInTheDocument()
  })

  it("Restaurar publicados resets an edited field back to the published default", async () => {
    const user = userEvent.setup()
    render(
      <WeightingDetailModal
        run={null}
        open={true}
        onOpenChange={() => {}}
        onRun={vi.fn()}
        countryCode="chile"
        period="202607"
      />,
    )

    const maxRounds = await screen.findByLabelText("MAX_ROUNDS_COLAPSO")
    await user.clear(maxRounds)
    await user.type(maxRounds, "80")
    expect(maxRounds).toHaveValue(80)

    await user.click(screen.getByRole("button", { name: /Restaurar publicados/ }))
    expect(maxRounds).toHaveValue(50)
  })

  it("aborts the launch when publishing the edited params fails", async () => {
    mockPublishMutateAsync.mockRejectedValue(new Error("boom"))
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(
      <WeightingDetailModal
        run={null}
        open={true}
        onOpenChange={() => {}}
        onRun={onRun}
        countryCode="chile"
        period="202607"
      />,
    )

    const maxRounds = await screen.findByLabelText("MAX_ROUNDS_COLAPSO")
    await user.clear(maxRounds)
    await user.type(maxRounds, "80")
    await launchAndConfirm(user)

    await waitFor(() => expect(mockToastError).toHaveBeenCalled())
    expect(onRun).not.toHaveBeenCalled()
  })

  it("the read-only history view (no onRun) shows plain values, not editable inputs", () => {
    render(
      <WeightingDetailModal
        run={completedRun()}
        open={true}
        onOpenChange={() => {}}
      />,
    )

    expect(screen.getByText("MAX_ROUNDS_COLAPSO")).toBeInTheDocument()
    expect(screen.getByText("77")).toBeInTheDocument()
    expect(screen.queryByLabelText("MAX_ROUNDS_COLAPSO")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Ejecutar|Re-ejecutar/ })).not.toBeInTheDocument()
  })
})

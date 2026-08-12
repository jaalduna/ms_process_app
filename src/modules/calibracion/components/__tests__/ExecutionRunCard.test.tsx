import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ExecutionRunCard } from "../ExecutionRunCard"
import { formatDuration } from "../../format"
import type { EventSummary } from "@/types/api"

// El link "Ver en Databricks" es solo-admin: los usuarios finales no tienen
// acceso al workspace. Los tests controlan el rol vía este mock.
const mockRoles = { current: ["admin"] }
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ roles: mockRoles.current }),
}))

const mockDownload = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/api", () => ({
  downloadCalibrationReport: (...args: unknown[]) => mockDownload(...args),
}))

function makeRun(overrides: Partial<EventSummary> = {}): EventSummary {
  return {
    job_id: "job-1",
    status: "running",
    country: "bolivia",
    stage: "calibracion",
    tag: "bolivia-calibracion-1",
    period: "202606",
    queries_total: 2,
    queries_completed: 1,
    queries_failed: 0,
    created_at: "2026-07-28T10:00:00Z",
    started_at: "2026-07-28T10:00:05Z",
    completed_at: null,
    triggered_by: "dev-user",
    error: null,
    current_query: null,
    failed_queries: [],
    running_queries: [],
    queries_running: 0,
    total_rows_extracted: 0,
    current_step: "merge_data",
    steps: [
      { name: "copy_to_calibration", status: "completed", started_at: "2026-07-28T10:00:05Z", completed_at: "2026-07-28T10:01:00Z", error: null },
      { name: "merge_data", status: "running", started_at: "2026-07-28T10:01:00Z", completed_at: null, error: null },
      { name: "simulate_kpis", status: "pending", started_at: null, completed_at: null, error: null },
    ],
    ...overrides,
  }
}

const noop = () => {}

describe("ExecutionRunCard", () => {
  it("shows cancel (not retry) while running, and step pipeline with progress", () => {
    render(
      <ExecutionRunCard run={makeRun()} onCancel={noop} onRetry={noop} cancelling={false} retrying={false} />,
    )
    expect(screen.getByText("Ejecutando")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Reintentar/ })).not.toBeInTheDocument()
    expect(screen.getByText("Merge Data")).toBeInTheDocument()
    // 1 of 3 steps completed → 33%
    expect(screen.getByText("33%")).toBeInTheDocument()
  })

  it("shows retry (not cancel) when failed, and fires onRetry with the run", async () => {
    const onRetry = vi.fn()
    const failed = makeRun({
      status: "failed",
      error: "merge_data failed",
      steps: [
        { name: "copy_to_calibration", status: "completed", started_at: "2026-07-28T10:00:05Z", completed_at: "2026-07-28T10:01:00Z", error: null },
        { name: "merge_data", status: "failed", started_at: "2026-07-28T10:01:00Z", completed_at: null, error: "boom" },
      ],
    })
    render(
      <ExecutionRunCard run={failed} onCancel={noop} onRetry={onRetry} cancelling={false} retrying={false} />,
    )
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /Reintentar/ }))
    expect(onRetry).toHaveBeenCalledWith(failed)
    expect(screen.getByText(/merge_data failed/)).toBeInTheDocument()
  })

  it("shows only the download action when completed, renders 100%, and downloads the zip", async () => {
    const done = makeRun({
      status: "completed",
      completed_at: "2026-07-28T10:05:00Z",
      steps: [
        { name: "copy_to_calibration", status: "completed", started_at: "2026-07-28T10:00:05Z", completed_at: "2026-07-28T10:01:00Z", error: null },
      ],
    })
    render(
      <ExecutionRunCard run={done} onCancel={noop} onRetry={noop} cancelling={false} retrying={false} />,
    )
    expect(screen.getByText("Completado")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Reintentar/ })).not.toBeInTheDocument()
    expect(screen.getByText("100%")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: /Descargar resultados/ }))
    expect(mockDownload).toHaveBeenCalledWith(done.tag, done.country)
  })

  it("renders the Databricks link only for admins AND when run_page_url is present (JAA-1056)", () => {
    const url = "https://adb-2125673683576002.2.azuredatabricks.net/#job/9210250/run/424242"
    const withUrl = { ...makeRun(), run_page_url: url } as EventSummary

    mockRoles.current = ["admin"]
    const first = render(
      <ExecutionRunCard run={withUrl} onCancel={noop} onRetry={noop} cancelling={false} retrying={false} />,
    )
    const link = screen.getByRole("link", { name: /Ver en Databricks/ })
    expect(link).toHaveAttribute("href", url)
    expect(link).toHaveAttribute("target", "_blank")
    first.unmount()

    // Admin pero sin URL → sin link.
    const second = render(
      <ExecutionRunCard run={makeRun()} onCancel={noop} onRetry={noop} cancelling={false} retrying={false} />,
    )
    expect(screen.queryByRole("link", { name: /Ver en Databricks/ })).not.toBeInTheDocument()
    second.unmount()

    // Usuario final (calibracion_specialist, sin acceso a Databricks) → sin link aunque haya URL.
    mockRoles.current = ["calibracion_specialist"]
    render(
      <ExecutionRunCard run={withUrl} onCancel={noop} onRetry={noop} cancelling={false} retrying={false} />,
    )
    expect(screen.queryByRole("link", { name: /Ver en Databricks/ })).not.toBeInTheDocument()
    mockRoles.current = ["admin"]
  })
})

describe("formatDuration", () => {
  it("formats sub-minute and minute durations from ISO bounds", () => {
    expect(formatDuration("2026-07-28T10:00:00Z", "2026-07-28T10:00:42Z")).toBe("42 s")
    expect(formatDuration("2026-07-28T10:00:00Z", "2026-07-28T10:05:07Z")).toBe("5 min 07 s")
    expect(formatDuration(null, null)).toBe("—")
  })
})

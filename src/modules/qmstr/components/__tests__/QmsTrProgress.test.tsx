import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { QmsTrProgress } from "../QmsTrProgress"

const steps = [
  { name: "run_sync", status: "cancelled" },
  { name: "run_bronze_copy", status: "running" },
  { name: "silver_builder", status: "pending" },
  { name: "kpis_batch", status: "pending" },
  { name: "export_zip", status: "pending" },
]

describe("QmsTrProgress — skipped step (JAA-1003, ac3)", () => {
  it("gives the cancelled/skipped step a distinct title from pending and failed", () => {
    render(<QmsTrProgress steps={steps} />)
    const dots = screen.getAllByTitle(/Run Sync|Run Bronze Copy|Silver Builder|Kpis Batch|Export Zip/)
    const runSyncDot = dots.find((d) => d.title.startsWith("Run Sync"))
    const bronzeCopyDot = dots.find((d) => d.title.startsWith("Run Bronze Copy"))
    const pendingDot = dots.find((d) => d.title.startsWith("Silver Builder"))

    expect(runSyncDot?.title).toBe("Run Sync — Omitido")
    expect(bronzeCopyDot?.title).toBe("Run Bronze Copy — Ejecutando")
    expect(pendingDot?.title).toBe("Silver Builder — Pendiente")
    expect(runSyncDot?.title).not.toBe(pendingDot?.title)
  })

  it("counts a cancelled (skipped) step toward completion percent", () => {
    const allButRunSyncDone = steps.map((s) =>
      s.name === "run_sync" ? s : { ...s, status: "completed" },
    )
    render(<QmsTrProgress steps={allButRunSyncDone} />)
    expect(screen.getByText("100%")).toBeInTheDocument()
  })
})

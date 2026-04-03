import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { DependencyIndicator } from "@/components/DependencyIndicator"
import type { DependencyStatus } from "@/hooks/usePipelineDeps"

describe("DependencyIndicator", () => {
  it("renders nothing when dependencies array is empty", () => {
    const { container } = render(<DependencyIndicator dependencies={[]} />)
    expect(container.innerHTML).toBe("")
  })

  it("renders a completed pill with green check icon and correct aria-label", () => {
    const deps: DependencyStatus[] = [
      {
        stage: "prices",
        label: "Precios",
        status: "completed",
        completed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
      },
    ]
    render(<DependencyIndicator dependencies={deps} />)

    const pill = screen.getByRole("status")
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveAttribute("aria-label", expect.stringContaining("Precios: completed"))
    expect(pill).toHaveClass("text-green-600")
    expect(screen.getByText("Precios")).toBeInTheDocument()
  })

  it("renders a not_run pill with grey icon and correct aria-label", () => {
    const deps: DependencyStatus[] = [
      { stage: "prices", label: "Precios", status: "not_run" },
    ]
    render(<DependencyIndicator dependencies={deps} />)

    const pill = screen.getByRole("status")
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveAttribute("aria-label", "Precios: not yet run")
    expect(pill).toHaveClass("text-muted-foreground")
  })

  it("renders an unknown pill with grey icon and correct aria-label", () => {
    const deps: DependencyStatus[] = [
      { stage: "prices", label: "Precios", status: "unknown" },
    ]
    render(<DependencyIndicator dependencies={deps} />)

    const pill = screen.getByRole("status")
    expect(pill).toBeInTheDocument()
    expect(pill).toHaveAttribute("aria-label", "Precios: status unknown")
    expect(pill).toHaveClass("text-muted-foreground")
  })

  it("renders multiple pills in correct order", () => {
    const deps: DependencyStatus[] = [
      { stage: "prices", label: "Precios", status: "completed", completed_at: new Date().toISOString() },
      { stage: "elegibilidad", label: "Elegibilidad", status: "not_run" },
      { stage: "weighting", label: "Pesaje", status: "unknown" },
    ]
    render(<DependencyIndicator dependencies={deps} />)

    const pills = screen.getAllByRole("status")
    expect(pills).toHaveLength(3)
    expect(pills[0]).toHaveAttribute("aria-label", expect.stringContaining("Precios: completed"))
    expect(pills[1]).toHaveAttribute("aria-label", "Elegibilidad: not yet run")
    expect(pills[2]).toHaveAttribute("aria-label", "Pesaje: status unknown")
  })

  it("completed pill has a tooltip trigger (for completion date)", () => {
    const completedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const deps: DependencyStatus[] = [
      { stage: "prices", label: "Precios", status: "completed", completed_at: completedAt },
    ]
    render(<DependencyIndicator dependencies={deps} />)

    // The pill text is rendered inside a tooltip trigger
    expect(screen.getByText("Precios")).toBeInTheDocument()
    // Check the tooltip trigger wrapper exists (data-slot from radix)
    const trigger = screen.getByText("Precios").closest("[data-slot='tooltip-trigger']")
    expect(trigger).toBeInTheDocument()
  })
})

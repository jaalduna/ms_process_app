import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { Formato4Progress } from "../Formato4Progress"
import { FORMATO4_STEPS, FORMATO4_STEP_LABELS } from "../../types"
import type { Formato4Step } from "../../types"

describe("Formato4Progress", () => {
  it("renders one dot per formato4 step in order with ES labels", () => {
    render(<Formato4Progress steps={[]} />)
    const dots = screen.getAllByTestId("formato4-step-dot")
    expect(dots).toHaveLength(FORMATO4_STEPS.length)
    // Order + ES label exposed via the dot's data-step + title.
    FORMATO4_STEPS.forEach((stepName, i) => {
      expect(dots[i]).toHaveAttribute("data-step", stepName)
      expect(dots[i]).toHaveAttribute("title", FORMATO4_STEP_LABELS[stepName])
    })
    // Sanity-check the actual ES strings for the contract step list.
    expect(dots.map((d) => d.getAttribute("title"))).toEqual([
      "Sincronización",
      "Merge",
      "Simulación",
      "Formato 4",
      "Empaquetado",
    ])
  })

  it("reflects each step state and defaults missing steps to pending", () => {
    const steps: Formato4Step[] = [
      { name: "sync", status: "completed" },
      { name: "merge", status: "running" },
      { name: "simulate", status: "failed" },
      // format_4 + zip intentionally omitted → pending
    ]
    render(<Formato4Progress steps={steps} />)
    const byStep = (name: string) =>
      screen.getAllByTestId("formato4-step-dot").find((d) => d.getAttribute("data-step") === name)!

    expect(byStep("sync")).toHaveAttribute("data-status", "completed")
    expect(byStep("merge")).toHaveAttribute("data-status", "running")
    expect(byStep("simulate")).toHaveAttribute("data-status", "failed")
    expect(byStep("format_4")).toHaveAttribute("data-status", "pending")
    expect(byStep("zip")).toHaveAttribute("data-status", "pending")
  })

  it("shows the current running step label and percent in the header", () => {
    const steps: Formato4Step[] = [
      { name: "sync", status: "completed" },
      { name: "merge", status: "completed" },
      { name: "simulate", status: "running" },
    ]
    render(<Formato4Progress steps={steps} currentStep="simulate" />)
    // 2 of 5 steps completed → 40%
    expect(screen.getByText("40%")).toBeInTheDocument()
    expect(screen.getByText(FORMATO4_STEP_LABELS.simulate)).toBeInTheDocument()
  })

  it("renders an error message when a step has failed", () => {
    const steps: Formato4Step[] = [
      { name: "sync", status: "completed" },
      { name: "merge", status: "failed", error: "merge boom" },
    ]
    render(<Formato4Progress steps={steps} />)
    const err = screen.getByTestId("formato4-progress-error")
    expect(within(err).getByText(/merge boom/)).toBeInTheDocument()
  })

  it("renders an error message when the error prop is set even without a failed step", () => {
    render(<Formato4Progress steps={[{ name: "sync", status: "running" }]} error="run cancelled by user" />)
    expect(screen.getByTestId("formato4-progress-error")).toHaveTextContent("run cancelled by user")
  })

  it("renders no error region on a clean run", () => {
    render(<Formato4Progress steps={[{ name: "sync", status: "completed" }]} />)
    expect(screen.queryByTestId("formato4-progress-error")).not.toBeInTheDocument()
  })
})

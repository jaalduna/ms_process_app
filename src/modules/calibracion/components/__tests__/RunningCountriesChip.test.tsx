import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { RunningCountriesChip } from "../RunningCountriesChip"

const mockUseRunningCalibrations = vi.fn()
vi.mock("../../hooks/useCalibration", () => ({
  useRunningCalibrations: (...args: unknown[]) => mockUseRunningCalibrations(...args),
}))

describe("RunningCountriesChip", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders nothing when no country is running", () => {
    mockUseRunningCalibrations.mockReturnValue({ data: [] })
    const { container } = render(<RunningCountriesChip period="202602" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing while data is undefined (loading)", () => {
    mockUseRunningCalibrations.mockReturnValue({ data: undefined })
    const { container } = render(<RunningCountriesChip period="202602" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("shows the count and flags of running countries", () => {
    mockUseRunningCalibrations.mockReturnValue({
      data: [
        { country: "mexico", status: "running" },
        { country: "brasil", status: "pending" },
      ],
    })
    render(<RunningCountriesChip period="202602" />)
    expect(screen.getByText(/2 en ejecución/)).toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { ErrorBoundary } from "@/components/ErrorBoundary"

const captureError = vi.fn()
vi.mock("@/lib/telemetry", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}))

function Boom(): never {
  throw new Error("render exploded")
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    captureError.mockClear()
    // React logs the caught error to console.error; silence it for clean output.
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>healthy</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText("healthy")).toBeTruthy()
  })

  it("shows the fallback and reports the error when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    // Fallback visible
    expect(screen.getByRole("alert")).toBeTruthy()
    expect(screen.getByText("Algo salió mal")).toBeTruthy()

    // Error reported to telemetry with kind "react"
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "render exploded", kind: "react" }),
    )
  })
})

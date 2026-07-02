import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RunStatusBadge } from "../RunStatusBadge"

describe("RunStatusBadge", () => {
  it("renders an animated 'Ejecutándose' badge for running", () => {
    render(<RunStatusBadge status="running" />)
    const badge = screen.getByText("Ejecutándose")
    expect(badge).toBeInTheDocument()
    expect(badge.parentElement?.querySelector(".animate-spin")).toBeInTheDocument()
  })

  it("renders an animated 'Ejecutándose' badge for pending", () => {
    render(<RunStatusBadge status="pending" />)
    const badge = screen.getByText("Ejecutándose")
    expect(badge).toBeInTheDocument()
    expect(badge.parentElement?.querySelector(".animate-spin")).toBeInTheDocument()
  })

  it("renders the Completed badge without a spinner", () => {
    render(<RunStatusBadge status="completed" />)
    const badge = screen.getByText("Completed")
    expect(badge).toBeInTheDocument()
    expect(badge.parentElement?.querySelector(".animate-spin")).not.toBeInTheDocument()
  })

  it("renders the Failed badge without a spinner", () => {
    render(<RunStatusBadge status="failed" />)
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument()
  })

  it("renders the Cancelled badge without a spinner", () => {
    render(<RunStatusBadge status="cancelled" />)
    expect(screen.getByText("Cancelled")).toBeInTheDocument()
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument()
  })

  it("renders nothing for undefined status", () => {
    const { container } = render(<RunStatusBadge status={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

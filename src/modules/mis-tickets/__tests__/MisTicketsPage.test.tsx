import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import type { FeedbackTicket } from "@/types/api"

// Mock the data hook so the page test is isolated from react-query/network.
const mockUseMyTickets = vi.fn()

vi.mock("../useMyTickets", () => ({
  useMyTickets: () => mockUseMyTickets(),
}))

import MisTicketsPage from "../pages/MisTicketsPage"

const TICKETS: FeedbackTicket[] = [
  {
    ticket_number: "FB-000002",
    message: "segundo ticket",
    category: "bug",
    status: "progreso",
    created_at: "2026-06-19T00:00:00.000Z",
    updated_at: "2026-06-19T00:00:00.000Z",
  },
  {
    ticket_number: "FB-000001",
    message: "primer ticket",
    category: "idea",
    status: "resuelto",
    created_at: "2026-06-18T00:00:00.000Z",
    updated_at: "2026-06-18T01:00:00.000Z",
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe("MisTicketsPage", () => {
  it("shows a skeleton list while loading", () => {
    mockUseMyTickets.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { container } = render(<MisTicketsPage />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("shows the empty-state message when there are no tickets", () => {
    mockUseMyTickets.mockReturnValue({ data: [], isLoading: false, error: null })
    render(<MisTicketsPage />)
    expect(screen.getByText("Todavía no enviaste ningún feedback.")).toBeInTheDocument()
  })

  it("renders ticket rows with status badges", () => {
    mockUseMyTickets.mockReturnValue({ data: TICKETS, isLoading: false, error: null })
    render(<MisTicketsPage />)

    expect(screen.getByText("FB-000001")).toBeInTheDocument()
    expect(screen.getByText("FB-000002")).toBeInTheDocument()
    expect(screen.getByText("primer ticket")).toBeInTheDocument()
    expect(screen.getByText("segundo ticket")).toBeInTheDocument()
    expect(screen.getByText("Resuelto")).toBeInTheDocument()
    expect(screen.getByText("En progreso")).toBeInTheDocument()
  })

  it("shows an inline destructive error box on error", () => {
    mockUseMyTickets.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom") })
    render(<MisTicketsPage />)
    expect(screen.getByText(/Error loading tickets: boom/)).toBeInTheDocument()
  })
})

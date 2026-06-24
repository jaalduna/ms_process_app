import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import type { CountriesResponse } from "@/types/api"

// Mock the data hooks so the page test is isolated from react-query/network.
const mockUseCountries = vi.fn()
const mockUseLastFormato4 = vi.fn()

vi.mock("@/hooks/useCountries", () => ({
  useCountries: () => mockUseCountries(),
}))
vi.mock("../../hooks/useLastFormato4", () => ({
  useLastFormato4: () => mockUseLastFormato4(),
}))

// Stub the card so we count one node per country without rendering its hooks.
vi.mock("../../components/Formato4CountryCard", () => ({
  Formato4CountryCard: ({ countryCode, period, lastFormato4Date }: { countryCode: string; period: string; lastFormato4Date: string | null }) => (
    <div data-testid="f4-card" data-country={countryCode} data-period={period} data-last={lastFormato4Date ?? ""} />
  ),
}))

import { Formato4Page } from "../Formato4Page"

const COUNTRIES: CountriesResponse = {
  countries: [
    { code: "chile", queries: [], queries_count: 0, type: "country" },
    { code: "colombia", queries: [], queries_count: 0, type: "country" },
    { code: "mexico", queries: [], queries_count: 0, type: "country" },
    { code: "latam_server", queries: [], queries_count: 0, type: "server" },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseLastFormato4.mockReturnValue({ data: undefined })
})

describe("Formato4Page", () => {
  it("renders the header h1 'Formato 4' and a PeriodSelector (ac1)", () => {
    mockUseCountries.mockReturnValue({ data: COUNTRIES, isLoading: false, error: null })
    render(<Formato4Page />)
    expect(screen.getByRole("heading", { name: "Formato 4" })).toBeInTheDocument()
    expect(screen.getByRole("combobox")).toBeInTheDocument()
  })

  it("shows a skeleton grid while loading and no country cards (ac1)", () => {
    mockUseCountries.mockReturnValue({ data: undefined, isLoading: true, error: null })
    const { container } = render(<Formato4Page />)
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(6)
    expect(screen.queryAllByTestId("f4-card")).toHaveLength(0)
  })

  it("shows an error banner on error (ac1)", () => {
    mockUseCountries.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom") })
    render(<Formato4Page />)
    expect(screen.getByText(/Error loading countries: boom/)).toBeInTheDocument()
  })

  it("renders one card per type==='country' (servers filtered out) in the responsive grid (ac1)", () => {
    mockUseCountries.mockReturnValue({ data: COUNTRIES, isLoading: false, error: null })
    const { container } = render(<Formato4Page />)
    const cards = screen.getAllByTestId("f4-card")
    expect(cards).toHaveLength(3) // 3 countries, the server is filtered out
    expect(cards.map((c) => c.getAttribute("data-country"))).toEqual(["chile", "colombia", "mexico"])

    const grid = container.querySelector(".grid.gap-5")
    expect(grid).not.toBeNull()
    expect(grid).toHaveClass("sm:grid-cols-2", "lg:grid-cols-3", "xl:grid-cols-4")
  })

  it("passes each country's last completion date to its card", () => {
    mockUseCountries.mockReturnValue({ data: COUNTRIES, isLoading: false, error: null })
    mockUseLastFormato4.mockReturnValue({
      data: { chile: { completed_at: "2026-06-01T00:00:00Z" } },
    })
    render(<Formato4Page />)
    const chile = screen.getAllByTestId("f4-card").find((c) => c.getAttribute("data-country") === "chile")
    expect(chile?.getAttribute("data-last")).toBe("2026-06-01T00:00:00Z")
  })
})

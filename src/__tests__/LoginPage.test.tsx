import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"

// Mock useAuth hook
const mockLogin = vi.fn()
const mockLogout = vi.fn()
const mockGetAccessToken = vi.fn()
let mockAuthState = {
  isAuthenticated: false,
  user: null as { email: string; name: string } | null,
  loading: false,
  login: mockLogin,
  logout: mockLogout,
  getAccessToken: mockGetAccessToken,
}

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
  AuthContext: {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  },
}))

import LoginPage from "@/pages/LoginPage"

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  )
}

function renderLoginWithRoutes() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<div>Dashboard Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Deterministic env: no bypass, default (Microsoft) provider. .env.local
    // sets VITE_AUTH_BYPASS=true for local dev, which would otherwise leak in.
    vi.stubEnv("VITE_AUTH_BYPASS", "false")
    vi.stubEnv("VITE_AUTH_PROVIDER", "")
    mockAuthState = {
      isAuthenticated: false,
      user: null,
      loading: false,
      login: mockLogin,
      logout: mockLogout,
      getAccessToken: mockGetAccessToken,
    }
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("renders the app title", () => {
    renderLogin()
    expect(screen.getByText("MS Process App")).toBeInTheDocument()
  })

  it("renders the description text", () => {
    renderLogin()
    expect(screen.getByText("Data sync operations for LATAM countries")).toBeInTheDocument()
  })

  it("renders the sign-in button", () => {
    renderLogin()
    expect(screen.getByRole("button", { name: /sign in with microsoft/i })).toBeInTheDocument()
  })

  it("calls login on button click", async () => {
    renderLogin()
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /sign in with microsoft/i }))
    expect(mockLogin).toHaveBeenCalled()
  })

  it("shows a GitHub label when the active provider is github", () => {
    vi.stubEnv("VITE_AUTH_PROVIDER", "github")
    renderLogin()
    expect(screen.getByRole("button", { name: /sign in with github/i })).toBeInTheDocument()
  })

  it("shows a dev label when auth bypass is enabled", () => {
    vi.stubEnv("VITE_AUTH_BYPASS", "true")
    renderLogin()
    expect(screen.getByRole("button", { name: /continue \(dev\)/i })).toBeInTheDocument()
  })

  it("redirects to dashboard when already authenticated", () => {
    mockAuthState = { ...mockAuthState, isAuthenticated: true, user: { email: "test@test.com", name: "Test" } }
    renderLoginWithRoutes()
    expect(screen.getByText("Dashboard Page")).toBeInTheDocument()
    expect(screen.queryByText("MS Process App")).not.toBeInTheDocument()
  })

  it("does not redirect when not authenticated", () => {
    mockAuthState = { ...mockAuthState, isAuthenticated: false }
    renderLoginWithRoutes()
    expect(screen.getByText("MS Process App")).toBeInTheDocument()
    expect(screen.queryByText("Dashboard Page")).not.toBeInTheDocument()
  })
})

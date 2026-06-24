import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"

const mockGetProcessStatus = vi.fn()

vi.mock("@/lib/api", () => ({
  getProcessStatus: (...args: unknown[]) => mockGetProcessStatus(...args),
  openProcess: vi.fn(),
  closeProcess: vi.fn(),
}))

import { useProcessStatus } from "@/hooks/useProcessStatus"

type AppConfigWindow = { __APP_CONFIG__?: { features?: Record<string, boolean> } }

function setProcessStatusFlag(value: boolean | undefined) {
  const win = window as unknown as AppConfigWindow
  if (value === undefined) {
    delete win.__APP_CONFIG__
  } else {
    win.__APP_CONFIG__ = { features: { processStatus: value } }
  }
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe("useProcessStatus feature guard", () => {
  beforeEach(() => {
    mockGetProcessStatus.mockReset()
    mockGetProcessStatus.mockResolvedValue({ countries: {} })
  })

  afterEach(() => {
    setProcessStatusFlag(undefined)
  })

  it("does not fetch when features.processStatus is false", async () => {
    setProcessStatusFlag(false)
    const { result } = renderHook(() => useProcessStatus(), { wrapper: createWrapper() })

    // Query is disabled: it never leaves the pending/idle state and never calls the API.
    await new Promise((r) => setTimeout(r, 20))
    expect(mockGetProcessStatus).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe("idle")
  })

  it("fetches when the flag is unset (default on)", async () => {
    setProcessStatusFlag(undefined)
    const { result } = renderHook(() => useProcessStatus(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockGetProcessStatus).toHaveBeenCalled()
  })
})

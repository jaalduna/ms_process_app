import type { ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { loopSinResponder } from "../../components/flujo/formato"
import { useFlujoEstado } from "../useQmsTrFlujo"
import { getFlujoEstado } from "../../api"

vi.mock("../../api", () => ({ getFlujoEstado: vi.fn() }))

const estado = (ultima_vuelta: string | null) => ({ enabled: true, intervalo_segundos: 300, ultima_vuelta })

describe("useFlujoEstado", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("relee cada 60 s e invalida las listas cuando cambia ultima_vuelta", async () => {
    vi.mocked(getFlujoEstado)
      .mockResolvedValueOnce(estado("2026-10-09T10:00:00Z") as never)
      .mockResolvedValue(estado("2026-10-09T10:05:00Z") as never)
    const qc = new QueryClient()
    const invalidar = vi.spyOn(qc, "invalidateQueries")
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    const { result } = renderHook(() => useFlujoEstado(), { wrapper })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.data?.ultima_vuelta).toBe("2026-10-09T10:00:00Z")
    expect(invalidar).not.toHaveBeenCalled()

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(getFlujoEstado).toHaveBeenCalledTimes(2)
    expect(result.current.data?.ultima_vuelta).toBe("2026-10-09T10:05:00Z")
    const llaves = invalidar.mock.calls.map((c) => (c[0]?.queryKey as string[])[1])
    expect(llaves).toEqual(["periodos", "tandas", "bases", "avisos"])
  })
})

describe("loopSinResponder", () => {
  const t0 = Date.parse("2026-10-09T10:00:00Z")
  it("false hasta 3 intervalos", () => expect(loopSinResponder("2026-10-09T10:00:00Z", 300, t0 + 900_000)).toBe(false))
  it("true pasados 3 intervalos", () => expect(loopSinResponder("2026-10-09T10:00:00Z", 300, t0 + 901_000)).toBe(true))
  it("false sin vueltas", () => expect(loopSinResponder(null, 300, t0)).toBe(false))
})

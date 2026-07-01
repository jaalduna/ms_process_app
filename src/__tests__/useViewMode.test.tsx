import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useViewMode } from "@/hooks/useViewMode"

// Map-backed localStorage stub (the test env does not provide one natively).
function installLocalStorageStub() {
  const store = new Map<string, string>()
  const mock: Storage = {
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }
  vi.stubGlobal("localStorage", mock)
}
installLocalStorageStub()

describe("useViewMode", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("defaults to 'cards' when nothing is persisted", () => {
    const { result } = renderHook(() => useViewMode("calibracion"))
    expect(result.current[0]).toBe("cards")
  })

  it("persists the chosen mode to localStorage and reflects it immediately", () => {
    const { result } = renderHook(() => useViewMode("calibracion"))

    act(() => result.current[1]("list"))

    expect(result.current[0]).toBe("list")
    expect(localStorage.getItem("view-mode:calibracion")).toBe("list")
  })

  it("reads back a persisted mode on mount", () => {
    localStorage.setItem("view-mode:calibracion", "list")
    const { result } = renderHook(() => useViewMode("calibracion"))
    expect(result.current[0]).toBe("list")
  })

  it("keeps preferences isolated per module", () => {
    const calibracion = renderHook(() => useViewMode("calibracion"))
    const pesaje = renderHook(() => useViewMode("pesaje"))

    act(() => calibracion.result.current[1]("list"))

    expect(calibracion.result.current[0]).toBe("list")
    expect(pesaje.result.current[0]).toBe("cards")
    expect(localStorage.getItem("view-mode:pesaje")).toBeNull()
  })
})

import { useCallback, useState } from "react"

export type ViewMode = "cards" | "list"

function storageKey(moduleKey: string): string {
  return `view-mode:${moduleKey}`
}

function readViewMode(moduleKey: string): ViewMode {
  try {
    return localStorage.getItem(storageKey(moduleKey)) === "list" ? "list" : "cards"
  } catch {
    return "cards"
  }
}

/** Per-module Tarjetas/Lista preference, persisted in localStorage (JAA-763). */
export function useViewMode(moduleKey: string): [ViewMode, (mode: ViewMode) => void] {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => readViewMode(moduleKey))

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode)
      try {
        localStorage.setItem(storageKey(moduleKey), mode)
      } catch {
        // ignore storage access errors
      }
    },
    [moduleKey],
  )

  return [viewMode, setViewMode]
}

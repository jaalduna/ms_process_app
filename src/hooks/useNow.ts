import { useEffect, useState } from "react"

/**
 * Current time that ticks every `intervalMs` while `active` — forces re-render
 * so live durations (formatDuration with open end) keep counting. React Query's
 * structural sharing skips re-renders when the server payload is unchanged, so
 * without this tick an open run's timer freezes until something else re-renders.
 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return now
}

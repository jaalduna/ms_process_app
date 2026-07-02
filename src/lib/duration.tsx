import { useEffect, useState } from "react"

/**
 * Parse a timestamp string as UTC (backend sends naive UTC without a 'Z'
 * suffix sometimes). Only assume UTC when there is no timezone designator —
 * otherwise the string already carries an offset and is valid as-is.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared helper co-exported with LiveDuration
export function parseUTC(ts: string): number {
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(ts)
  return new Date(hasTz ? ts : ts + "Z").getTime()
}

/**
 * Format the elapsed time between `start` and `end` (or `now` when `end` is
 * null/undefined, i.e. the run is still in progress). Canonical output:
 * `Xs`, `Xm Ys`, `Xh Ym`.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared helper co-exported with LiveDuration
export function formatDuration(
  start: string | null | undefined,
  end: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!start) return "-"
  const s = parseUTC(start)
  const e = end ? parseUTC(end) : now
  const totalSeconds = Math.max(0, Math.round((e - s) / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60)
    const sec = totalSeconds % 60
    return `${m}m ${sec}s`
  }
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  return `${h}h ${m}m`
}

/**
 * Returns `Date.now()`, re-rendering the caller every `intervalMs` while
 * `enabled` is true. Used to drive live-ticking duration displays without a
 * per-component setInterval/useState pair at every call site.
 */
// eslint-disable-next-line react-refresh/only-export-components -- shared hook co-exported with LiveDuration
export function useNow(intervalMs: number, enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])

  return now
}

/**
 * Renders the elapsed duration between `start` and `end`. Self-updates every
 * second while the run is in progress (`end` is null/undefined); renders a
 * static value with no timer once `end` is set.
 */
export function LiveDuration({
  start,
  end,
  className,
}: {
  start: string | null | undefined
  end: string | null | undefined
  className?: string
}) {
  const running = !!start && !end
  const now = useNow(1000, running)
  return <span className={className}>{formatDuration(start, end, now)}</span>
}

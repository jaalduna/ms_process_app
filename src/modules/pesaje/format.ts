/**
 * Wall-clock duration between two ISO timestamps, formatted for compact
 * display ("42s", "3m 12s", "1h 04m 30s"). `end` falling back to `null`/omitted
 * reads as "still open" only where the caller passes `Date.now()` explicitly —
 * this function itself is a pure formatter.
 */
export function formatDuration(start?: string | null, end?: string | null): string {
  if (!start) return "-"
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const totalSeconds = Math.max(0, Math.round((e - s) / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60)
    const sec = totalSeconds % 60
    return `${m}m ${sec}s`
  }
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const sec = totalSeconds % 60
  return `${h}h ${m}m ${sec}s`
}

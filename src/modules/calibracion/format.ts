/** Human duration between two ISO timestamps ("5 min 07 s"); open runs use now. */
export function formatDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso) return "—"
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const s = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1000))
  const m = Math.floor(s / 60)
  return m ? `${m} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`
}

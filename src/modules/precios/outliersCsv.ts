import type { PricesRun } from "./types"

/**
 * Build and trigger a client-side CSV download of a run's price outliers.
 * Shared by PricesDetailModal and PricesHistoryModal so both produce an
 * identical file. Returns false (no-op) when the run has no outliers.
 */
export function downloadOutliersCSV(run: Pick<PricesRun, "country" | "period" | "outliers">): boolean {
  if (!run.outliers || run.outliers.length === 0) return false
  const headers = ["Product", "Declared Price", "Historical Avg", "Deviation %", "Reason", "Household ID"]
  const rows = run.outliers.map((o) => [
    `"${o.product}"`,
    o.declared_price,
    o.historical_avg,
    o.deviation_pct,
    `"${o.reason}"`,
    o.household_id,
  ])
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `prices_outliers_${run.country}_${run.period}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return true
}

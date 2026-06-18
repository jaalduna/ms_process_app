import type { MtrRun } from "../types"

/**
 * Generate and download a CSV file from an MTR run's results_summary.
 * This is a client-side implementation using Blob + URL.createObjectURL.
 * When the real backend provides a download endpoint, this can be swapped.
 */
export function downloadMtrCsv(run: MtrRun): void {
  const summary = run.results_summary
  if (!summary) {
    throw new Error("No results summary available for this run")
  }

  const headers = ["metric", "value"]
  const rows = [
    ["country", run.country],
    ["period", String(run.period)],
    ["run_id", run.run_id],
    ["status", run.status],
    ["total_targets", String(summary.total_targets)],
    ["targets_achieved", String(summary.targets_achieved)],
    ["achievement_rate", summary.total_targets > 0
      ? (summary.targets_achieved / summary.total_targets * 100).toFixed(1) + "%"
      : "N/A"],
    ["total_imputations", String(summary.total_imputations)],
    ["quality_score", summary.quality_score != null ? String(summary.quality_score) : "N/A"],
    ["started_at", run.started_at ?? ""],
    ["completed_at", run.completed_at ?? ""],
  ]

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(",")),
  ].join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", `mtr_${run.country}_${run.period}_${run.run_id.slice(0, 8)}.csv`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

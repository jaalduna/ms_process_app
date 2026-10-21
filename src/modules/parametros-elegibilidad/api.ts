// JAA-547 — eligibility-params API client. Talks to the JAA-546 endpoints
// (mock-server in dev/e2e, real FastAPI in prod) via the shared axios instance.

import { api } from "@/lib/api"
import type { ImportResult, ParamRow, ParamsTableData, PublishResult } from "./types"

export async function getParamsTable(table: string, country: string): Promise<ParamsTableData> {
  const { data } = await api.get<ParamsTableData>(`/params/${table}/${country}`)
  return data
}

/** La API publica lo guardado: primero se guardan las filas y después se publican. */
export async function publishParams(table: string, country: string, rows: ParamRow[]): Promise<PublishResult> {
  await api.put(`/params/${table}/${country}`, { rows })
  const { data } = await api.post<PublishResult>(`/params/${table}/${country}/publish`, { rows })
  return data
}

// JAA-628 — Excel round-trip against the JAA-614 backend contract.

/**
 * Download the per-country params workbook (all tables, one sheet each + an
 * Instrucciones sheet). `template=true` yields an empty template (headers + one
 * example row) instead of the current values. Streams the server blob and
 * anchor-clicks it (same pattern as downloadWeightingCSV/downloadFormato4).
 */
export async function downloadParamsExcel(country: string, template = false): Promise<void> {
  const response = await api.get(`/params/${country}/export.xlsx`, {
    responseType: "blob",
    ...(template ? { params: { template: true } } : {}),
  })
  const url = URL.createObjectURL(new Blob([response.data]))
  const a = document.createElement("a")
  a.href = url
  const disposition = response.headers["content-disposition"] ?? ""
  const match = disposition.match(/filename="?([^";\n]+)"?/)
  a.download = match?.[1] ?? `params_${country}${template ? "_template" : ""}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Upload an edited workbook for validation. The backend parses every sheet,
 * runs the SAME contract validator the editor uses, and returns a validate-only
 * preview (diff + errors per table) WITHOUT publishing.
 */
export async function importParamsExcel(country: string, file: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append("file", file)
  const { data } = await api.post<ImportResult>(`/params/${country}/import`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })
  return data
}

// JAA-547 — eligibility-params API client. Talks to the JAA-546 endpoints
// (mock-server in dev/e2e, real FastAPI in prod) via the shared axios instance.

import { api } from "@/lib/api"
import type { ParamRow, ParamsTableData, PublishResult } from "./types"

export async function getParamsTable(table: string, country: string): Promise<ParamsTableData> {
  const { data } = await api.get<ParamsTableData>(`/params/${table}/${country}`)
  return data
}

export async function publishParams(table: string, country: string, rows: ParamRow[]): Promise<PublishResult> {
  const { data } = await api.post<PublishResult>(`/params/${table}/${country}/publish`, { rows })
  return data
}

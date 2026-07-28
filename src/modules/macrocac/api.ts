// JAA-1051 — macrocac API client. Talks to the JAA-1048 mock (in-repo, base
// /api/v1/macrocac) or the real ms-process-api (JAA-1052) once it lands.

import { api } from "@/lib/api"
import { MacrocacApiError } from "./types"
import type { MacrocacRun, MacrocacRunError, MacrocacUpload, MacrocacUploadError } from "./types"

/**
 * Upload a correction `.xlsx`. The mock has no multipart parser — `filename`,
 * `pais`, and `tabla` travel via query string (the same convention as
 * eligibility.js/weighting-params.js); the file itself still goes as
 * multipart form data for the real backend (JAA-1052) to read.
 */
export async function uploadMacrocacFile(params: {
  pais: string
  tabla: string
  motivo: string
  file: File
}): Promise<MacrocacUpload> {
  const { pais, tabla, motivo, file } = params
  const formData = new FormData()
  formData.append("file", file)

  const query = new URLSearchParams({ filename: file.name, pais, tabla })
  if (motivo) query.set("motivo", motivo)

  const response = await api.post(`/macrocac/uploads?${query.toString()}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    // Bypass the shared interceptor's {error,message}-only error transform
    // (see MacrocacApiError) so 422 missing_columns / 400 bad_request bodies
    // reach the caller intact.
    validateStatus: () => true,
  })
  if (response.status === 201) return response.data as MacrocacUpload
  throw new MacrocacApiError<MacrocacUploadError>(response.status, response.data)
}

/** Trigger a dry-run execution against a previously uploaded correction file. */
export async function createMacrocacRun(uploadId: string): Promise<MacrocacRun> {
  const response = await api.post(
    "/macrocac/runs",
    { upload_id: uploadId },
    { validateStatus: () => true },
  )
  if (response.status === 201) return response.data as MacrocacRun
  throw new MacrocacApiError<MacrocacRunError>(response.status, response.data)
}

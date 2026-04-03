import type { LastStageCompletionResponse } from "@/types/api"
import {
  getLastPrices,
  getLastElegibilidad,
  getLastWeighting,
  getLastCalibration,
  getLastMtr,
} from "@/lib/api"

export const PIPELINE_ORDER = ["prices", "elegibilidad", "weighting", "calibration", "mtr"] as const
export type PipelineStage = (typeof PIPELINE_ORDER)[number]

/** Direct upstream dependencies for each pipeline stage. */
export const STAGE_DEPENDENCIES: Record<PipelineStage, PipelineStage[]> = {
  prices: [],
  elegibilidad: ["prices"],
  weighting: ["elegibilidad"],
  calibration: ["weighting"],
  mtr: ["calibration"],
}

/** Display labels for each pipeline stage. */
export const STAGE_LABELS: Record<PipelineStage, string> = {
  prices: "Precios",
  elegibilidad: "Elegibilidad",
  weighting: "Pesaje",
  calibration: "Calibracion",
  mtr: "MTR",
}

/** Maps each pipeline stage to the API function that fetches its last-completion data.
 * The response shapes are compatible (all have `countries: Record<string, { country, completed_at, ... }>`). */
export const STAGE_FETCHERS: Record<PipelineStage, () => Promise<LastStageCompletionResponse>> = {
  prices: getLastPrices,
  elegibilidad: getLastElegibilidad as () => Promise<LastStageCompletionResponse>,
  weighting: getLastWeighting,
  calibration: getLastCalibration as () => Promise<LastStageCompletionResponse>,
  mtr: getLastMtr,
}

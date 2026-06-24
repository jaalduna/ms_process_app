// Runtime feature flags, read from `window.__APP_CONFIG__.features` (set by
// `config.js` on web, or `config.json` on Tauri — see main.tsx loadConfig()).
//
// These gate SPA features whose backend is not implemented in every
// environment. The real `ms-process-api` does not (yet) expose a telemetry sink
// (POST /telemetry/events -> 405) nor a process-status endpoint
// (GET /processes/status -> 404), so calling them against those backends spams
// the browser console with failed-request errors (JAA-558). The deploy configs
// for the real-API environments turn these off; the mock-server supports both,
// so the dev/mock default leaves them ON.
//
// Default ON: an unset flag preserves prior behaviour (mock + tests). Flip a
// flag on in the real-API config.js once the backend implements the endpoint.

export interface FeatureFlags {
  /** Usage/error telemetry client (POST /telemetry/events, /telemetry/errors). */
  telemetry: boolean
  /** Process open/close status poller (GET /processes/status). */
  processStatus: boolean
}

const DEFAULTS: FeatureFlags = {
  telemetry: true,
  processStatus: true,
}

export function getFeatureFlags(): FeatureFlags {
  const features = (
    window as unknown as { __APP_CONFIG__?: { features?: Partial<FeatureFlags> } }
  ).__APP_CONFIG__?.features
  return {
    telemetry: features?.telemetry ?? DEFAULTS.telemetry,
    processStatus: features?.processStatus ?? DEFAULTS.processStatus,
  }
}

export function isTelemetryEnabled(): boolean {
  return getFeatureFlags().telemetry
}

export function isProcessStatusEnabled(): boolean {
  return getFeatureFlags().processStatus
}

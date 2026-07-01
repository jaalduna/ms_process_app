// Runtime mode detection for the single self-contained executable.
//
// The shipped app bundles a mock backend (Tauri sidecar). At startup the Rust
// layer + main.tsx decide MOCK vs REAL based on whether an external config.json
// provided an `API_URL`:
//   - no API_URL  -> MOCK mode: talk to the bundled mock on :5000 + bypass auth
//   - API_URL set -> REAL mode: talk to the real backend + use the real auth provider
//
// `window.__MOCK_MODE__` is set by main.tsx after config.json is loaded (Tauri
// only). Outside Tauri (browser SPA) it stays undefined, so behavior is driven
// solely by VITE_AUTH_BYPASS — preserving the existing web/dev flow.

declare global {
  interface Window {
    __MOCK_MODE__?: boolean
  }
}

/** True when auth should be bypassed (DevAuthProvider): explicit dev flag or mock mode. */
export function authBypassed(): boolean {
  if (import.meta.env.VITE_AUTH_BYPASS === "true") return true
  return typeof window !== "undefined" && window.__MOCK_MODE__ === true
}

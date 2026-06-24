// =============================================================================
// ms-process-app — PRODUCTION runtime config (App Service, same-origin)
// =============================================================================
// Deployed to /home/site/spa/config.js (overwrites the dev public/config.js that
// the build bundles). config.js is read at runtime and can be edited without a
// rebuild. Deliberately does NOT set __BRIDGE_CONFIG__.API_URL: the API is
// same-origin and comes from the build (VITE_BRIDGE_API_URL=/api/v1), so the
// localhost dev value never wins here.

window.__APP_CONFIG__ = {
  // Entra ID (MSAL). Also forced at build time via VITE_AUTH_PROVIDER; kept here
  // for consistency if the build var is ever dropped.
  authProvider: "azure-ad",
  modules: {
    overview: true,
    sync: false,
    calibration: true,
    elegibilidad: true,
    prices: true,
    weighting: true,
    mtr: true,
    qmstr: true,
    macrocac: true,
    traceability: false,
  },
  // Feature flags (JAA-558). The real ms-process-api does not implement the
  // telemetry sink (POST /telemetry/events) nor the process-status endpoint
  // (GET /processes/status), so these are OFF here to avoid recurring 405/404
  // console errors. Flip a flag to true once the backend implements it.
  features: {
    telemetry: false,
    processStatus: false,
  },
};

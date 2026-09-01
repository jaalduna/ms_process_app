// =============================================================================
// ms-process-app — DEV App Service runtime config (same-origin)
// =============================================================================
// Uploaded to /home/site/spa/config.js on app-cl-prd-nmr-wp-msproc-dev (the
// IP-locked dev environment running the REAL ms-process-api). Overwrites the
// localhost public/config.js that `vite build` bundles. config.js is read at
// runtime and can be edited without a rebuild.
//
// Deliberately does NOT set __BRIDGE_CONFIG__.API_URL: the API is same-origin
// and baked into the build (VITE_BRIDGE_API_URL=/api/v1), so it wins here.
// Auth is bypassed at build time (VITE_AUTH_BYPASS=true -> DevAuthProvider),
// so authProvider below is informational only.

window.__APP_CONFIG__ = {
  authProvider: "azure-ad",
  modules: {
    overview: false,
    sync: false,
    calibration: true,
    elegibilidad: true,
    prices: false,
    weighting: true,
    mtr: false,
    formato4: false,
    qmstr: false,
    macrocac: true,
    traceability: false,
    parametros: false,
    // El módulo real es este; `parametros` arriba es un flag sin módulo detrás.
    "parametros-elegibilidad": false,
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

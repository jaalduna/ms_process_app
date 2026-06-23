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
    parametros: true,
  },
};

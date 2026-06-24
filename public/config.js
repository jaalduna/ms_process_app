// =============================================================================
// SQL-Databricks Bridge - Configuracion del Frontend
// =============================================================================
// Editar este archivo con la URL del servidor backend.
// NO es necesario reconstruir la app, solo editar y refrescar el navegador.

window.__BRIDGE_CONFIG__ = {
  // Update this URL when using a tunnel (e.g. localtunnel, ngrok).
  // sql-databricks-bridge default: http://localhost:8000/api/v1
  API_URL: "http://localhost:5000/api/v1",
};

window.__APP_CONFIG__ = {
  authProvider: "github",
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
  // Feature flags (JAA-558). The bundled mock-server implements both the
  // telemetry sink and /processes/status, so they stay ON for local/mock dev.
  // The real-API deploy configs (deploy/config.{dev,prod}.js) turn these OFF.
  features: {
    telemetry: true,
    processStatus: true,
  },
};

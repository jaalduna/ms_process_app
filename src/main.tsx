import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.tsx"
import { initTelemetry } from "./lib/telemetry"

async function installMocks() {
  if (import.meta.env.VITE_MOCK_API === "true") {
    const { installMockApi } = await import("./lib/mock-api")
    installMockApi()
  }
}

async function loadConfig() {
  if ("__TAURI_INTERNALS__" in window) {
    const { invoke } = await import("@tauri-apps/api/core")
    const configStr = await invoke<string>("read_config")
    try {
      const config = JSON.parse(configStr)

      type BridgeConfig = { API_URL?: string }
      type AppConfig = { modules?: Record<string, boolean>; authProvider?: string }
      type WindowGlobals = {
        __BRIDGE_CONFIG__?: BridgeConfig
        __APP_CONFIG__?: AppConfig
        __MOCK_MODE__?: boolean
      }
      const win = window as unknown as WindowGlobals

      // No external API_URL => MOCK mode: the bundled mock sidecar (on :5000) serves
      // the app and auth is bypassed. Any API_URL => REAL mode (real backend + auth).
      win.__MOCK_MODE__ = !config.API_URL

      // Apply API_URL to __BRIDGE_CONFIG__
      if (config.API_URL) {
        win.__BRIDGE_CONFIG__ = {
          ...win.__BRIDGE_CONFIG__,
          API_URL: config.API_URL,
        }
      }

      // Apply auth provider override (lets operators pick github/azure-builtin via config.json)
      if (config.authProvider) {
        win.__APP_CONFIG__ = {
          ...win.__APP_CONFIG__,
          authProvider: config.authProvider,
        }
      }

      // Apply modules to __APP_CONFIG__
      if (config.modules) {
        win.__APP_CONFIG__ = {
          ...win.__APP_CONFIG__,
          modules: {
            ...win.__APP_CONFIG__?.modules,
            ...config.modules,
          },
        }
      }
    } catch {
      console.warn("Failed to parse config.json, using defaults")
    }
  }
}

installMocks().then(() => loadConfig()).then(() => {
  // Install global error/usage telemetry before first render (JAA-429).
  initTelemetry()
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})

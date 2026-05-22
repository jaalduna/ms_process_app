/// <reference types="vitest/config" />
import fs from "fs"
import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))
const version = pkg.version ?? "0.0.0"

const isTauri = !!process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    APP_VERSION: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: isTauri ? "/" : (process.env.VITE_BASE_PATH ?? "/ms-process-app/"),
  server: {
    host: process.env.TAURI_DEV_HOST || false,
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.VITE_BRIDGE_PROXY_TARGET ?? "http://myworkspace.adds.wp.numerator.com:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          msal: ["@azure/msal-browser", "@azure/msal-react"],
          tanstack: ["@tanstack/react-query", "@tanstack/react-table"],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    css: true,
    pool: "threads",
    testTimeout: 30000,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
  },
})

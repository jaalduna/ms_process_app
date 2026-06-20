/// <reference types="vitest/config" />
import fs from "fs"
import path from "path"
import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "package.json"), "utf-8"))
const version = pkg.version ?? "0.0.0"

const isTauri = !!process.env.TAURI_ENV_PLATFORM

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Merge .env[.mode] files with real process.env (shell/CI still wins).
  // Lets the same-origin build be driven by .env.production (VITE_BASE_PATH=/)
  // instead of a fragile shell variable at deploy time.
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env }
  return {
  plugins: [react(), tailwindcss()],
  define: {
    APP_VERSION: JSON.stringify(version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: isTauri ? "/" : (env.VITE_BASE_PATH ?? "/ms-process-app/"),
  server: {
    host: process.env.TAURI_DEV_HOST || false,
    port: 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
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
  }
})

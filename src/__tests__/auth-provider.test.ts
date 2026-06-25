import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { loadAuthProvider } from "@/lib/auth-provider"
import { authBypassed } from "@/lib/runtime-mode"
import { DevAuthProvider } from "@/components/DevAuthProvider"
import { MsalAuthProvider } from "@/components/MsalAuthProvider"

// JAA-656: the remote dev app must serve a build that does NOT show the Entra
// login gate. The dev-noauth build bakes VITE_AUTH_BYPASS=true into import.meta.env
// (via `vite build --mode dev-noauth` reading .env.dev-noauth). These tests prove
// the resolution logic that flag drives: bypass => DevAuthProvider, beating any
// configured VITE_AUTH_PROVIDER; without bypass => the real provider (MSAL default).
describe("loadAuthProvider (JAA-656 dev-noauth build)", () => {
  beforeEach(() => {
    // Neutralize .env.local (which sets VITE_AUTH_BYPASS=true for local dev) and
    // any window runtime config so each case starts from a known baseline.
    vi.stubEnv("VITE_AUTH_BYPASS", "false")
    vi.stubEnv("VITE_AUTH_PROVIDER", "")
    delete (window as unknown as { __APP_CONFIG__?: unknown }).__APP_CONFIG__
    delete (window as unknown as { __MOCK_MODE__?: unknown }).__MOCK_MODE__
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("dev build (VITE_AUTH_BYPASS=true): authBypassed() is true and resolves DevAuthProvider", async () => {
    vi.stubEnv("VITE_AUTH_BYPASS", "true")
    expect(authBypassed()).toBe(true)
    const mod = await loadAuthProvider()
    expect(mod.default).toBe(DevAuthProvider)
  })

  it("dev bypass wins even when VITE_AUTH_PROVIDER=azure-ad is set (the prod default)", async () => {
    vi.stubEnv("VITE_AUTH_BYPASS", "true")
    vi.stubEnv("VITE_AUTH_PROVIDER", "azure-ad")
    expect(authBypassed()).toBe(true)
    const mod = await loadAuthProvider()
    expect(mod.default).toBe(DevAuthProvider)
    expect(mod.default).not.toBe(MsalAuthProvider)
  })

  it("no bypass + azure-ad provider: authBypassed() false and resolves MsalAuthProvider (login gate)", async () => {
    vi.stubEnv("VITE_AUTH_BYPASS", "false")
    vi.stubEnv("VITE_AUTH_PROVIDER", "azure-ad")
    expect(authBypassed()).toBe(false)
    const mod = await loadAuthProvider()
    expect(mod.default).toBe(MsalAuthProvider)
    expect(mod.default).not.toBe(DevAuthProvider)
  })
})

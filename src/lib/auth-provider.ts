import { authBypassed } from "@/lib/runtime-mode"

// Resolve the auth provider at render time (NOT module scope): in the bundled
// single-exe build, mock mode is only known after config.json is read in main.tsx,
// so authBypassed()/authProvider must be evaluated after that runs.
// Only the selected provider's chunk is fetched (keeps MSAL ~220KB out of the bundle).
//
// Priority: authBypassed() (dev flag / mock) > VITE_AUTH_PROVIDER (baked at build)
// > window.__APP_CONFIG__.authProvider (runtime config.js) > MSAL (default).
export function loadAuthProvider() {
  if (authBypassed()) {
    return import("@/components/DevAuthProvider").then((m) => ({ default: m.DevAuthProvider }))
  }
  const provider =
    import.meta.env.VITE_AUTH_PROVIDER ??
    (window as unknown as { __APP_CONFIG__?: { authProvider?: string } }).__APP_CONFIG__?.authProvider
  if (provider === "azure-builtin") {
    return import("@/components/AzureBuiltInAuthProvider").then((m) => ({ default: m.AzureBuiltInAuthProvider }))
  }
  if (provider === "github") {
    return import("@/components/GithubAuthProvider").then((m) => ({ default: m.GithubAuthProvider }))
  }
  return import("@/components/MsalAuthProvider").then((m) => ({ default: m.MsalAuthProvider }))
}

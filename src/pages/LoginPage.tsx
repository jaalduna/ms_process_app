import { Navigate } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { BrandMark } from "@/components/BrandMark"

// Mirror App.tsx provider selection so the button reflects the ACTIVE provider.
// Read env at call time (not module scope) so it stays testable via stubbed env.
function signInLabel(loading: boolean): string {
  if (loading) return "Signing in..."
  if (import.meta.env.VITE_AUTH_BYPASS === "true") return "Continue (dev)"
  const provider =
    import.meta.env.VITE_AUTH_PROVIDER ??
    (window as never as { __APP_CONFIG__?: { authProvider?: string } }).__APP_CONFIG__?.authProvider
  if (provider === "github") return "Sign in with GitHub"
  return "Sign in with Microsoft"
}

const PIPELINE_STAGES = ["sync", "calibración", "elegibilidad", "precios", "pesaje", "mtr"]

export default function LoginPage() {
  const { isAuthenticated, login, loading } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar text-sidebar-foreground">
      {/* Atmosphere: blueprint grid + teal glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[60vh] w-[80vw] -translate-x-1/2 rounded-full bg-sidebar-primary/15 blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-sm px-6 animate-fade-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark className="mb-5 h-12 w-12 drop-shadow-[0_0_24px_oklch(0.75_0.1_190_/_35%)]" />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-sidebar-accent-foreground">
            MS Process App
          </h1>
          <p className="mt-2 text-sm text-sidebar-foreground/70">
            Data sync operations for LATAM countries
          </p>
        </div>

        <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-6 shadow-2xl backdrop-blur-sm">
          <Button
            className="w-full bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"
            size="lg"
            onClick={login}
            disabled={loading}
          >
            {signInLabel(loading)}
          </Button>
          <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/45">
            SQL Server ⇄ Databricks
          </p>
        </div>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
          {PIPELINE_STAGES.map((stage, i) => (
            <li
              key={stage}
              className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/40"
            >
              {i > 0 && <span aria-hidden="true">→</span>}
              {stage}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

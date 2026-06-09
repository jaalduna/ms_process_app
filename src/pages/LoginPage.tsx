import { Navigate } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

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

export default function LoginPage() {
  const { isAuthenticated, login, loading } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold">MS Process App</CardTitle>
          <CardDescription>
            Data sync operations for LATAM countries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            className="w-full"
            size="lg"
            onClick={login}
            disabled={loading}
          >
            {signInLabel(loading)}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

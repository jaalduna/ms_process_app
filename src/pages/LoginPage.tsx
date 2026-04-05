import { Navigate } from "react-router-dom"
import { useAuth } from "@/hooks/useAuth"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function LoginPage() {
  const { isAuthenticated, login, loading } = useAuth()

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-semibold">SQL-Databricks Bridge</CardTitle>
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
            {loading
              ? "Signing in..."
              : (window as any).__APP_CONFIG__?.authProvider === "github"
                ? "Sign in with GitHub"
                : "Sign in with Microsoft"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

import { Suspense, lazy } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout"
import { useModuleConfig } from "@/hooks/useModuleConfig"
import { useAuth } from "@/hooks/useAuth"
import { allModules } from "@/modules/registry"
import { Skeleton } from "@/components/ui/skeleton"
import { authBypassed } from "@/lib/runtime-mode"

const LoginPage = lazy(() => import("@/pages/LoginPage"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

const isTauri = '__TAURI_INTERNALS__' in window
const basename = isTauri ? "/" : import.meta.env.BASE_URL

// Resolve the auth provider at render time (NOT module scope): in the bundled
// single-exe build, mock mode is only known after config.json is read in main.tsx,
// so authBypassed()/authProvider must be evaluated after that runs.
// Only the selected provider's chunk is fetched (keeps MSAL ~220KB out of the bundle).
function loadAuthProvider() {
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
const AuthProvider = lazy(loadAuthProvider)

function AppRoutes() {
  const modules = useModuleConfig()
  const { roles } = useAuth()
  // Mirrors backend AuthorizedUser.has_role: admin implies every role.
  const isAdmin = roles.includes("admin")
  const enabledModules = allModules.filter((m) => {
    if (!modules[m.id]) return false
    if (m.requiredRoles && m.requiredRoles.length > 0) {
      return isAdmin || m.requiredRoles.some((r) => roles.includes(r))
    }
    return true
  })
  const defaultRoute = enabledModules[0]?.routes[0]?.path ?? "/"

  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense fallback={null}>
            <LoginPage />
          </Suspense>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AuthenticatedLayout modules={enabledModules} />
          </ProtectedRoute>
        }
      >
        {enabledModules.flatMap(m =>
          m.routes.map(r => (
            <Route
              key={r.path}
              path={r.path}
              element={
                <Suspense fallback={<div className="space-y-4 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>}>
                  <r.component />
                </Suspense>
              }
            />
          )),
        )}
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Suspense fallback={null}>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter basename={basename}>
              <AppRoutes />
              <Toaster />
            </BrowserRouter>
          </QueryClientProvider>
        </AuthProvider>
      </Suspense>
    </ThemeProvider>
  )
}

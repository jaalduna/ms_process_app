import { Suspense, lazy, useEffect } from "react"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { useModuleConfig } from "@/hooks/useModuleConfig"
import { useAuth } from "@/hooks/useAuth"
import { allModules, hasModuleAccess } from "@/modules/registry"
import { Skeleton } from "@/components/ui/skeleton"
import { loadAuthProvider } from "@/lib/auth-provider"
import { setTelemetryUser, trackPageView } from "@/lib/telemetry"

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

// loadAuthProvider() lives in @/lib/auth-provider so it can be unit-tested in
// isolation (JAA-656). It is evaluated lazily, at render time — NOT module scope —
// because in the bundled single-exe build mock mode is only known after main.tsx
// reads config.json. Only the selected provider's chunk is fetched.
const AuthProvider = lazy(loadAuthProvider)

/**
 * Feeds telemetry from inside the router + auth context: keeps the identified
 * user in sync and emits a page_view on every route change (JAA-429).
 */
function TelemetryRouteListener() {
  const location = useLocation()
  const { user } = useAuth()

  useEffect(() => {
    setTelemetryUser(user)
  }, [user])

  useEffect(() => {
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])

  return null
}

function AppRoutes() {
  const modules = useModuleConfig()
  const { roles } = useAuth()
  // A module shows only when its config toggle is on AND the user passes the
  // role gate (hasModuleAccess: admin implies every role).
  const enabledModules = allModules.filter((m) => modules[m.id] && hasModuleAccess(m, roles))
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
    <ErrorBoundary>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <Suspense fallback={null}>
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <BrowserRouter basename={basename}>
                <TelemetryRouteListener />
                <AppRoutes />
                <Toaster />
              </BrowserRouter>
            </QueryClientProvider>
          </AuthProvider>
        </Suspense>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

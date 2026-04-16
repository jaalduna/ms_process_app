/**
 * Auth provider using Azure Static Web Apps built-in authentication.
 * Uses /.auth/me to check session and /.auth/login/aad for Microsoft login.
 * See: https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization
 */
import { useCallback, useEffect, useState } from "react"
import { AuthContext } from "@/hooks/useAuth"

interface AzureClientPrincipal {
  identityProvider: string
  userId: string
  userDetails: string
  userRoles: string[]
  claims: { typ: string; val: string }[]
}

export function AzureBuiltInAuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [principal, setPrincipal] = useState<AzureClientPrincipal | null>(null)

  useEffect(() => {
    fetch("/.auth/me")
      .then((r) => r.json())
      .then((data) => {
        const cp = data?.clientPrincipal as AzureClientPrincipal | null
        setPrincipal(cp)
      })
      .catch(() => setPrincipal(null))
      .finally(() => setLoading(false))
  }, [])

  const isAuthenticated = !!principal
  const user = principal
    ? { email: principal.userDetails, name: principal.userDetails }
    : null

  const roles = principal?.userRoles?.filter((r) => r !== "anonymous" && r !== "authenticated") ?? []
  const countries = ["CL", "CO", "MX", "PE", "BR", "BO", "EC", "PY"]

  const login = useCallback(async () => {
    const returnUrl = window.location.pathname + window.location.search
    window.location.href = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(returnUrl || "/overview")}`
  }, [])

  const logout = useCallback(async () => {
    window.location.href = "/.auth/logout?post_logout_redirect_uri=/"
  }, [])

  const getAccessToken = useCallback(async () => {
    // Azure built-in auth doesn't expose tokens to the client.
    // The session cookie is sent automatically with same-origin requests.
    return "azure-builtin-session"
  }, [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        roles,
        countries,
        loading,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

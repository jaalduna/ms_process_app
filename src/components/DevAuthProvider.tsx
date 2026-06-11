import { useState, useCallback, useMemo } from "react"
import { AuthContext } from "@/hooks/useAuth"

// Override with VITE_DEV_ROLES="prices_specialist,analyst" to preview
// role-restricted navigation during development.
const DEV_ROLES = (import.meta.env.VITE_DEV_ROLES ?? "admin")
  .split(",")
  .map((r: string) => r.trim())
  .filter(Boolean)
const DEV_COUNTRIES = ["CL", "CO", "MX", "PE", "BR", "BO", "EC", "PY"]

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const user = useMemo(
    () => (isAuthenticated ? { email: "dev@localhost", name: "Dev User" } : null),
    [isAuthenticated],
  )

  const login = useCallback(async () => {
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(async () => {
    setIsAuthenticated(false)
  }, [])

  const getAccessToken = useCallback(async () => "dev-bypass-token", [])

  const contextValue = useMemo(
    () => ({
      isAuthenticated,
      user,
      roles: isAuthenticated ? DEV_ROLES : [],
      countries: isAuthenticated ? DEV_COUNTRIES : [],
      loading: false as const,
      login,
      logout,
      getAccessToken,
    }),
    [isAuthenticated, user, login, logout, getAccessToken],
  )

  return (
    <AuthContext.Provider
      value={contextValue}
    >
      {children}
    </AuthContext.Provider>
  )
}

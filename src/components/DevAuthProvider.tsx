import { useState, useCallback } from "react"
import { AuthContext } from "@/hooks/useAuth"

const DEV_ROLES = ["admin"]
const DEV_COUNTRIES = ["CL", "CO", "MX", "PE", "BR", "BO", "EC", "PY"]

export function DevAuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const user = isAuthenticated
    ? { email: "dev@localhost", name: "Dev User" }
    : null

  const login = useCallback(async () => {
    setIsAuthenticated(true)
  }, [])

  const logout = useCallback(async () => {
    setIsAuthenticated(false)
  }, [])

  const getAccessToken = useCallback(async () => "dev-bypass-token", [])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        roles: isAuthenticated ? DEV_ROLES : [],
        countries: isAuthenticated ? DEV_COUNTRIES : [],
        loading: false,
        login,
        logout,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

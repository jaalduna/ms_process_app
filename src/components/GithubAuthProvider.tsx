import { useState, useCallback, useEffect, useMemo } from "react"
import { AuthContext } from "@/hooks/useAuth"
import { ApiTokenBinder } from "@/components/ApiTokenBinder"
import { api } from "@/lib/api"
import type { UserInfo } from "@/types/api"

const TOKEN_KEY = "github_auth_token"

export function GithubAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)

  // On mount: check URL for ?token=<jwt> set by backend after OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get("token")
    if (urlToken) {
      localStorage.setItem(TOKEN_KEY, urlToken)
      setToken(urlToken)
      params.delete("token")
      const newSearch = params.toString()
      const newUrl =
        window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash
      window.history.replaceState({}, "", newUrl)
    }
  }, [])

  // Fetch user info whenever token changes
  useEffect(() => {
    if (!token) {
      setUserInfo(null)
      setLoading(false)
      return
    }

    setLoading(true)
    let cancelled = false
    ;(async () => {
      try {
        const info = await api
          .get<UserInfo>("/auth/me", {
            headers: { Authorization: `Bearer ${token}` },
          })
          .then((r) => r.data)
        if (!cancelled) setUserInfo(info)
      } catch {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY)
          setToken(null)
          setUserInfo(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token])

  const isAuthenticated = !!token && !!userInfo

  const user = useMemo(() => {
    if (!userInfo) return null
    return { email: userInfo.email, name: userInfo.name }
  }, [userInfo])

  const login = useCallback(async () => {
    // Derive server root from the API URL (strip /api/v1 suffix)
    const apiUrl: string =
      (window as unknown as { __BRIDGE_CONFIG__?: { API_URL?: string } }).__BRIDGE_CONFIG__?.API_URL ??
      import.meta.env.VITE_BRIDGE_API_URL ??
      "http://localhost:5000/api/v1"
    const serverRoot = apiUrl.replace(/\/api\/v1$/, "")
    window.location.href = `${serverRoot}/auth/github`
  }, [])

  const logout = useCallback(async () => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUserInfo(null)
    window.location.href = "/"
  }, [])

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!token) throw new Error("No authenticated token")
    return token
  }, [token])

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        roles: userInfo?.roles ?? [],
        countries: userInfo?.countries ?? [],
        loading,
        login,
        logout,
        getAccessToken,
      }}
    >
      <ApiTokenBinder />
      {children}
    </AuthContext.Provider>
  )
}

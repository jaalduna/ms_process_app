import { useCallback, useEffect, useMemo, useState } from "react"
import { PublicClientApplication } from "@azure/msal-browser"
import { MsalProvider, useMsal, useIsAuthenticated } from "@azure/msal-react"
import { InteractionStatus } from "@azure/msal-browser"
import { msalConfig, loginRequest } from "@/lib/auth-config"
import { AuthContext } from "@/hooks/useAuth"
import { ApiTokenBinder } from "@/components/ApiTokenBinder"
import { api } from "@/lib/api"
import type { UserInfo } from "@/types/api"

const msalInstance = new PublicClientApplication(msalConfig)
msalInstance.initialize()

function MsalAuthInner({ children }: { children: React.ReactNode }) {
  const { instance, accounts, inProgress } = useMsal()
  const isAuthenticated = useIsAuthenticated()
  const [userInfo, setUserInfo] = useState<{ roles: string[]; countries: string[] } | null>(null)

  const account = accounts[0] ?? null

  const user = useMemo(() => {
    if (!account) return null
    return { email: account.username, name: account.name ?? account.username }
  }, [account])

  const loading = inProgress !== InteractionStatus.None

  useEffect(() => {
    if (!isAuthenticated || !account) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pre-existing, preserving behavior
      setUserInfo(null)
      return
    }

    let cancelled = false
    ;(async () => {
      try {
        const tokenResponse = await instance.acquireTokenSilent({ ...loginRequest, account })
        const info = await api
          .get<UserInfo>("/auth/me", {
            headers: { Authorization: `Bearer ${tokenResponse.accessToken}` },
          })
          .then((r) => r.data)
        if (!cancelled) setUserInfo({ roles: info.roles, countries: info.countries })
      } catch {
        if (!cancelled) setUserInfo({ roles: [], countries: [] })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, account, instance])

  const login = useCallback(async () => {
    await instance.loginRedirect(loginRequest)
  }, [instance])

  // No pasamos postLogoutRedirectUri acá: msalConfig ya lo define como el mismo
  // `redirectUri` que está registrado en el app registration. Pasarlo explícito
  // como origin + BASE_URL agregaba un slash final ("https://host/"), que Entra
  // compara de forma exacta contra los redirect URIs y no calza → el logout
  // fallaba con AADSTS50011 aunque el login funcionara.
  const logout = useCallback(async () => {
    await instance.logoutRedirect()
  }, [instance])

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!account) throw new Error("No authenticated account")
    try {
      const response = await instance.acquireTokenSilent({ ...loginRequest, account })
      return response.accessToken
    } catch {
      const response = await instance.acquireTokenRedirect(loginRequest)
      return (response as unknown as { accessToken: string })?.accessToken ?? ""
    }
  }, [instance, account])

  // Roles = app roles de Entra ID (claim `roles` del ID token, asignados en el
  // app registration del tenant). Fallback a /auth/me mientras el registration
  // no tenga appRoles configurados, para no dejar a nadie sin perfil durante la
  // transición. Todo autenticado sin rol explícito es perfil base "usuario".
  const claimRoles = useMemo(() => {
    const claims = account?.idTokenClaims as { roles?: string[] } | undefined
    return claims?.roles ?? []
  }, [account])

  const contextValue = useMemo(
    () => ({
      isAuthenticated,
      user,
      roles: claimRoles.length > 0 ? claimRoles : (userInfo?.roles ?? []),
      countries: userInfo?.countries ?? [],
      loading,
      login,
      logout,
      getAccessToken,
    }),
    [isAuthenticated, user, claimRoles, userInfo, loading, login, logout, getAccessToken],
  )

  return (
    <AuthContext.Provider
      value={contextValue}
    >
      <ApiTokenBinder />
      {children}
    </AuthContext.Provider>
  )
}

export function MsalAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuthInner>{children}</MsalAuthInner>
    </MsalProvider>
  )
}

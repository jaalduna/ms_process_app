import { useCallback, useEffect, useMemo, useState } from "react"
import { PublicClientApplication } from "@azure/msal-browser"
import { MsalProvider, useMsal, useIsAuthenticated } from "@azure/msal-react"
import { InteractionStatus } from "@azure/msal-browser"
import { apiScopeConfigured, msalConfig, loginRequest } from "@/lib/auth-config"
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
            headers: { Authorization: `Bearer ${bearerDe(tokenResponse)}` },
          })
          .then((r) => r.data)
        if (!cancelled) setUserInfo({ roles: info.roles, countries: info.countries })
      } catch {
        // null, no `{roles: []}`: el contexto cae al claim del token cuando
        // /auth/me no responde, y una lista vacía no es lo mismo que "no sé".
        if (!cancelled) setUserInfo(null)
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
      return bearerDe(response)
    } catch {
      // acquireTokenRedirect navega fuera de la página y devuelve void: no hay
      // token que retornar, la sesión se rearma cuando el navegador vuelve.
      await instance.acquireTokenRedirect(loginRequest)
      return ""
    }
  }, [instance, account])

  // Roles: manda /auth/me, no el claim del ID token.
  //
  // El backend hace dos cosas que el claim crudo no tiene (JAA-1148): normaliza a
  // minúsculas —Entra emite "Admin" y todo el front compara contra "admin", así
  // que usar el claim tal cual dejaba el menú VACÍO para un admin del tenant— y
  // suma los roles de módulo de config_users, que es donde se asignan los
  // `<stage>_specialist` sin tocar el tenant.
  //
  // El claim queda de respaldo por si /auth/me falla (red, 5xx): sin él un admin
  // se quedaría sin nada. Se normaliza igual, por la misma razón.
  const claimRoles = useMemo(() => {
    const claims = account?.idTokenClaims as { roles?: string[] } | undefined
    return (claims?.roles ?? []).map((r) => r.toLowerCase())
  }, [account])

  const contextValue = useMemo(
    () => ({
      isAuthenticated,
      user,
      roles: userInfo?.roles ?? claimRoles,
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

/** Los dos tokens que devuelve MSAL; sólo interesa cuál se manda al backend. */
type TokenPair = { accessToken: string; idToken: string }

/**
 * Qué token va en el header Authorization.
 *
 * Sin scope de API configurado el access token de MSAL es para Graph y la API lo
 * rechaza ("Signature verification failed"); el ID token, en cambio, viene con
 * `aud` = el client id que la API valida. Ver `apiScopeConfigured`.
 */
function bearerDe(t: TokenPair): string {
  return apiScopeConfigured ? t.accessToken : (t.idToken ?? "")
}

export function MsalAuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <MsalProvider instance={msalInstance}>
      <MsalAuthInner>{children}</MsalAuthInner>
    </MsalProvider>
  )
}

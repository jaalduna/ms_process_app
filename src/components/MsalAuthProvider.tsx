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

// STOPGAP (JAA-347): until SSO fase 2 grants the SPA→API delegated permission
// there is no API access token, so the backend validates the ID token
// (aud = SPA client id). acquireTokenSilent only checks the ACCESS token's
// expiry (60–90 min, randomized) while the cached ID token expires at a fixed
// ~1h, so it can hand back an already-expired ID token — force a refresh when
// that happens. Revert to accessToken once fase 2 is applied and the build
// sets VITE_AZURE_AD_API_SCOPE.
function idTokenIsFresh(token: string): boolean {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1])) as { exp?: number }
    return typeof exp === "number" && exp * 1000 > Date.now() + 60_000
  } catch {
    return false
  }
}

async function acquireIdToken(
  instance: PublicClientApplication | ReturnType<typeof useMsal>["instance"],
  account: NonNullable<ReturnType<typeof useMsal>["accounts"][0]>,
): Promise<string> {
  let response = await instance.acquireTokenSilent({ ...loginRequest, account })
  if (!idTokenIsFresh(response.idToken)) {
    response = await instance.acquireTokenSilent({ ...loginRequest, account, forceRefresh: true })
  }
  return response.idToken
}

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
        const idToken = await acquireIdToken(instance, account)
        const info = await api
          .get<UserInfo>("/auth/me", {
            headers: { Authorization: `Bearer ${idToken}` },
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

  const logout = useCallback(async () => {
    await instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin + import.meta.env.BASE_URL,
    })
  }, [instance])

  const getAccessToken = useCallback(async (): Promise<string> => {
    if (!account) throw new Error("No authenticated account")
    try {
      return await acquireIdToken(instance, account)
    } catch {
      const response = await instance.acquireTokenRedirect(loginRequest)
      return (response as unknown as { idToken: string })?.idToken ?? ""
    }
  }, [instance, account])

  const contextValue = useMemo(
    () => ({
      isAuthenticated,
      user,
      roles: userInfo?.roles ?? [],
      countries: userInfo?.countries ?? [],
      loading,
      login,
      logout,
      getAccessToken,
    }),
    [isAuthenticated, user, userInfo, loading, login, logout, getAccessToken],
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

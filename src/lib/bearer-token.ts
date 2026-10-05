import type { AccountInfo, SilentRequest } from "@azure/msal-browser"

/** Los dos tokens que devuelve MSAL; sólo interesa cuál se manda al backend. */
type TokenPair = { accessToken: string; idToken: string }

type SilentClient = { acquireTokenSilent(request: SilentRequest): Promise<TokenPair> }

/** Margen para no mandar un token que vence en vuelo. */
const MARGEN_MS = 60_000

/** ¿El `exp` del JWT está al menos MARGEN_MS en el futuro? Un token ilegible cuenta como vencido. */
export function idTokenVigente(token: string, ahora: number = Date.now()): boolean {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1])) as { exp?: number }
    return typeof exp === "number" && exp * 1000 > ahora + MARGEN_MS
  } catch {
    return false
  }
}

/**
 * El token que va en el header Authorization.
 *
 * Con scope de API se manda el access token. Sin él (ver `apiScopeConfigured`)
 * se manda el ID token, y ahí `acquireTokenSilent` no basta: MSAL decide si
 * refrescar mirando sólo el vencimiento del ACCESS token (60–90 min,
 * aleatorio), mientras el ID token cacheado vence fijo a ~1 h. Entre medio
 * devuelve un ID token ya vencido y toda la API responde 401 hasta re-loguear.
 * Por eso, si el ID token no está vigente, se pide de nuevo con forceRefresh.
 * (Era el parche 41d8d19 de main, que develop había perdido — JAA-1415.)
 */
export async function adquirirBearer(
  client: SilentClient,
  request: SilentRequest & { account: AccountInfo },
  apiScopeConfigured: boolean,
): Promise<string> {
  const respuesta = await client.acquireTokenSilent(request)
  if (apiScopeConfigured) return respuesta.accessToken
  if (idTokenVigente(respuesta.idToken)) return respuesta.idToken
  const refrescada = await client.acquireTokenSilent({ ...request, forceRefresh: true })
  return refrescada.idToken
}

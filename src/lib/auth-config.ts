import type { Configuration, RedirectRequest } from "@azure/msal-browser"

const clientId = import.meta.env.VITE_AZURE_AD_CLIENT_ID ?? ""
const tenantId = import.meta.env.VITE_AZURE_AD_TENANT_ID ?? ""
const redirectUri = import.meta.env.VITE_AZURE_AD_REDIRECT_URI ?? window.location.origin

// The API access-token scope lives on the API app registration, NOT the SPA's
// own client id. It must be provided explicitly (e.g.
// api://<API_CLIENT_ID>/Jobs.Execute); defaulting to api://<SPA_id>/access_as_user
// is wrong — that resource does not exist → AADSTS500011. Until the SPA→API
// delegated permission is wired (SSO phase 2, JAA-347), leave it unset so login
// requests only identity scopes and completes; set it once the permission exists.
const apiScope = import.meta.env.VITE_AZURE_AD_API_SCOPE ?? ""

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: "sessionStorage",
  },
}

export const loginRequest: RedirectRequest = {
  scopes: apiScope ? [apiScope] : ["openid", "profile", "offline_access"],
}

/**
 * ¿Hay un scope de API configurado? Decide QUÉ token se manda al backend.
 *
 * Sin scope, MSAL sólo puede emitir un access token para Microsoft Graph, y la
 * API lo rechaza con "Invalid token: Signature verification failed" — Graph
 * firma con llaves que no están en el JWKS del tenant para esta app. En ese caso
 * se manda el ID TOKEN, que sí sirve acá: el SPA y la API comparten app
 * registration, así que su `aud` es exactamente el client id que valida
 * `azure_ad.py`, y su emisor es el v2.0 del tenant.
 *
 * No es el diseño definitivo —lo correcto es exponer `api://<client-id>/...` y
 * pedirlo— pero eso requiere un Application Administrator (JAA-347). Cuando el
 * scope exista, basta setear VITE_AZURE_AD_API_SCOPE y esto pasa solo al access
 * token, sin tocar más código.
 */
export const apiScopeConfigured = Boolean(apiScope)

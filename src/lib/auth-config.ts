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

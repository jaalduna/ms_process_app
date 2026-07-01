// Signed-download-token contract seam (JAA-757/758).
//
// Mirrors the real backend's short-lived, resource-bound download token: the
// frontend calls a "download-url" endpoint (authenticated as usual) to get a
// URL, then navigates the browser to it directly (no Authorization header —
// native downloads can't send one). The mock doesn't need real HMAC signing,
// just the same shape: a token good for exactly one resource, for a short TTL.

const DEFAULT_TTL_SECONDS = 60

const tokens = new Map() // token -> { resource, expiresAt }

export function issueDownloadToken(resource, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const token = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  tokens.set(token, { resource, expiresAt: Date.now() + ttlSeconds * 1000 })
  return { token, expiresIn: ttlSeconds }
}

// Returns null when valid, otherwise { status, error, message } for the caller to send.
export function validateDownloadToken(token, resource) {
  if (!token) {
    return { status: 401, error: "unauthorized", message: "Missing download token" }
  }
  const entry = tokens.get(token)
  if (!entry) {
    return { status: 403, error: "forbidden", message: "Invalid download token" }
  }
  if (Date.now() > entry.expiresAt) {
    return { status: 401, error: "unauthorized", message: "Download token expired" }
  }
  if (entry.resource !== resource) {
    return { status: 403, error: "forbidden", message: "Download token not valid for this resource" }
  }
  return null
}

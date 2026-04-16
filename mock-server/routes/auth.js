import { Router } from "express"
import jwt from "jsonwebtoken"

const router = Router()

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET
const GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL ?? "http://localhost:5000/auth/github/callback"
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-production"
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173"

// GET /auth/github — redirect to GitHub OAuth authorization
router.get("/auth/github", (_req, res) => {
  if (!GITHUB_CLIENT_ID) {
    return res.status(500).json({ error: "GITHUB_CLIENT_ID not configured" })
  }
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: "user:email",
  })
  res.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

// GET /auth/github/callback — exchange code, fetch profile, issue app JWT
router.get("/auth/github/callback", async (req, res) => {
  const { code } = req.query
  if (!code) {
    return res.status(400).json({ error: "missing_code", message: "No code in callback" })
  }

  try {
    // Exchange code for GitHub access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: GITHUB_CALLBACK_URL,
      }),
    })
    const tokenData = await tokenRes.json()

    if (tokenData.error) {
      console.error("GitHub token exchange error:", tokenData)
      return res
        .status(400)
        .json({ error: tokenData.error, message: tokenData.error_description })
    }

    const ghToken = tokenData.access_token

    // Fetch user profile and emails in parallel
    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
      fetch("https://api.github.com/user/emails", {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
    ])

    const ghUser = await userRes.json()
    const ghEmails = await emailsRes.json()

    // Prefer primary verified email; fall back to public email on profile
    const primaryEmail = Array.isArray(ghEmails)
      ? (ghEmails.find((e) => e.primary && e.verified)?.email ?? ghUser.email ?? "")
      : (ghUser.email ?? "")

    const { roles, countries } = resolveUserPermissions(primaryEmail)

    const payload = {
      email: primaryEmail,
      name: ghUser.name ?? ghUser.login,
      roles,
      countries,
    }

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "8h" })

    // Redirect back to frontend with token as query param
    const frontendUrl = new URL("/", FRONTEND_URL)
    frontendUrl.searchParams.set("token", token)
    res.redirect(frontendUrl.toString())
  } catch (err) {
    console.error("GitHub OAuth callback error:", err)
    res.status(500).json({ error: "oauth_callback_failed", message: String(err) })
  }
})

// ---------------------------------------------------------------------------
// Permission resolution
// In production, replace with a real user/role store lookup.
// ---------------------------------------------------------------------------

function resolveUserPermissions(email) {
  const adminEmails = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim()).filter(Boolean)
    : []

  // If no admin whitelist is configured, grant full access to any authenticated user
  if (adminEmails.length === 0 || adminEmails.includes(email)) {
    return { roles: ["admin"], countries: ["*"] }
  }

  return { roles: ["viewer"], countries: [] }
}

// ---------------------------------------------------------------------------
// JWT verification helper (used by server.js /auth/me)
// ---------------------------------------------------------------------------

export function verifyAppToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

export default router

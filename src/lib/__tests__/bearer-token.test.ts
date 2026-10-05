import { describe, expect, it, vi } from "vitest"
import type { AccountInfo } from "@azure/msal-browser"
import { adquirirBearer, idTokenVigente } from "../bearer-token"

const AHORA = Date.UTC(2026, 9, 5, 12, 0, 0)

function jwt(expMs: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(expMs / 1000) }))
  return `h.${payload}.s`
}

const account = { homeAccountId: "x", username: "u@wp.numerator.com" } as AccountInfo
const request = { scopes: ["openid"], account }

describe("idTokenVigente", () => {
  it("vigente si vence después del margen", () => {
    expect(idTokenVigente(jwt(AHORA + 10 * 60_000), AHORA)).toBe(true)
  })

  it("vencido si ya pasó el exp", () => {
    expect(idTokenVigente(jwt(AHORA - 1_000), AHORA)).toBe(false)
  })

  it("vencido si vence dentro del margen de un minuto", () => {
    expect(idTokenVigente(jwt(AHORA + 30_000), AHORA)).toBe(false)
  })

  it("un token ilegible cuenta como vencido", () => {
    expect(idTokenVigente("no-es-un-jwt", AHORA)).toBe(false)
  })
})

describe("adquirirBearer", () => {
  it("con scope de API manda el access token sin forzar refresh", async () => {
    const client = { acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: "AT", idToken: jwt(0) }) }
    expect(await adquirirBearer(client, request, true)).toBe("AT")
    expect(client.acquireTokenSilent).toHaveBeenCalledTimes(1)
  })

  it("sin scope manda el ID token cacheado si está vigente", async () => {
    const vigente = jwt(Date.now() + 30 * 60_000)
    const client = { acquireTokenSilent: vi.fn().mockResolvedValue({ accessToken: "AT", idToken: vigente }) }
    expect(await adquirirBearer(client, request, false)).toBe(vigente)
    expect(client.acquireTokenSilent).toHaveBeenCalledTimes(1)
  })

  it("sin scope, un ID token vencido se pide de nuevo con forceRefresh", async () => {
    const nuevo = jwt(Date.now() + 60 * 60_000)
    const client = {
      acquireTokenSilent: vi
        .fn()
        .mockResolvedValueOnce({ accessToken: "AT", idToken: jwt(Date.now() - 1_000) })
        .mockResolvedValueOnce({ accessToken: "AT2", idToken: nuevo }),
    }
    expect(await adquirirBearer(client, request, false)).toBe(nuevo)
    expect(client.acquireTokenSilent).toHaveBeenLastCalledWith({ ...request, forceRefresh: true })
  })
})

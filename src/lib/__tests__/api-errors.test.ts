import { describe, expect, it } from "vitest"
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios"
import { api, detailMessage } from "../api"

function responder(status: number, data: unknown): AxiosAdapter {
  return (config: InternalAxiosRequestConfig) =>
    Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), {
      isAxiosError: true,
      config,
      response: { status, data, headers: {}, config, statusText: "" },
    }))
}

async function rechazo(status: number, data: unknown) {
  return api.get("/x", { adapter: responder(status, data) }).catch((e) => e)
}

describe("detailMessage", () => {
  it("lee detail como string o como lista de {msg}", () => {
    expect(detailMessage("No autorizado")).toBe("No autorizado")
    expect(detailMessage([{ msg: "Field required", loc: ["body", "pais"] }, { msg: "value is not a valid integer" }]))
      .toBe("Field required; value is not a valid integer")
    expect(detailMessage([])).toBeUndefined()
    expect(detailMessage(undefined)).toBeUndefined()
  })
})

describe("interceptor de errores", () => {
  it("422 estándar de FastAPI muestra los msg de detail", async () => {
    expect(await rechazo(422, { detail: [{ msg: "Field required", loc: ["body", "pais"] }] }))
      .toEqual({ error: "unknown", message: "Field required" })
  })
  it("{error, message} sigue mandando sobre detail", async () => {
    expect(await rechazo(409, { error: "conflict", message: "Ya existe", detail: "otro" }))
      .toEqual({ error: "conflict", message: "Ya existe" })
  })
  it("sin message ni detail cae al mensaje de axios", async () => {
    expect(await rechazo(500, { error: "boom" })).toEqual({ error: "boom", message: "Request failed with status code 500" })
  })
})

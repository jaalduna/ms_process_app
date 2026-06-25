import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import processConfigRouter from "../routes/process_config.js"

// JAA-642 / JAA-667: the mock-server must honor the shared process-config
// contract — including per-scope rows (PK `(process, scope)`) — so the calibration
// per-country group_by UI can be built + e2e-tested without the real backend.
describe("GET/PUT /config/processes/:process (mock-server)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    const app = express()
    app.use(express.json())
    app.use("/api/v1", processConfigRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  const get = (process, scope) =>
    fetch(
      `${baseUrl}/config/processes/${process}` + (scope ? `?scope=${scope}` : ""),
    )
  const put = (process, config, scope) =>
    fetch(
      `${baseUrl}/config/processes/${process}` + (scope ? `?scope=${scope}` : ""),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      },
    )

  it("defaults to scope=default and empty config", async () => {
    const res = await get("calibration")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ process: "calibration", scope: "default", editable: true })
    expect(body.config).toEqual({})
  })

  it("upserts and reads back a per-scope (per-country) row", async () => {
    const putRes = await put("calibration", { group_by: "IdProduto_Calib;Region" }, "chile")
    expect(putRes.status).toBe(200)
    const putBody = await putRes.json()
    expect(putBody.scope).toBe("chile")
    expect(putBody.config).toEqual({ group_by: "IdProduto_Calib;Region" })

    const getRes = await get("calibration", "chile")
    const getBody = await getRes.json()
    expect(getBody.scope).toBe("chile")
    expect(getBody.config).toEqual({ group_by: "IdProduto_Calib;Region" })
  })

  it("isolates scopes — a per-country row does not leak into default or another country", async () => {
    await put("calibration", { group_by: "A;B" }, "peru")

    const def = await (await get("calibration")).json()
    expect(def.config).toEqual({})

    const bolivia = await (await get("calibration", "bolivia")).json()
    expect(bolivia.config).toEqual({})

    const peru = await (await get("calibration", "peru")).json()
    expect(peru.config).toEqual({ group_by: "A;B" })
  })

  it("returns 422 when config is not a JSON object", async () => {
    const res = await put("calibration", "not-an-object", "chile")
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("validation_error")
  })
})

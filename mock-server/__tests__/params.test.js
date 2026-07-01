import { afterAll, beforeAll, describe, expect, it } from "vitest"
import express from "express"
import paramsRouter, { seedParams, PARAMS_TABLES } from "../routes/params.js"

// JAA-547: the mock-server must honor the JAA-546 params contract so the
// eligibility-params editor UI can be built + e2e-tested without the real
// FastAPI backend. Endpoints (base /api/v1):
//   GET    /params/{tabla}/{pais}
//   PUT    /params/{tabla}/{pais}
//   POST   /params/{tabla}/{pais}/validate
//   POST   /params/{tabla}/{pais}/publish
describe("params API (mock-server, JAA-546 contract)", () => {
  let server
  let baseUrl

  beforeAll(async () => {
    seedParams()
    const app = express()
    app.use(express.json())
    app.use("/api/v1", paramsRouter)
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://localhost:${server.address().port}/api/v1`
        resolve()
      })
    })
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  it("exposes the 15 eligibility table names", () => {
    expect(PARAMS_TABLES).toContain("Code_Parametros")
    expect(PARAMS_TABLES).toContain("Criterios_Elegibilidad")
    expect(PARAMS_TABLES).toContain("Q_Variables")
    expect(PARAMS_TABLES).toContain("Estructura")
    expect(PARAMS_TABLES.length).toBe(15)
  })

  it("GET returns the ParamsTableData envelope with seeded rows", async () => {
    const res = await fetch(`${baseUrl}/params/Code_Parametros/CL`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.country).toBe("CL")
    expect(body.table).toBe("Code_Parametros")
    expect(Array.isArray(body.rows)).toBe(true)
    expect(body.rows.length).toBeGreaterThan(0)
    expect(body).toHaveProperty("updated_at")
    expect(body).toHaveProperty("updated_by")
  })

  it("GET seeds all 9 countries", async () => {
    for (const cc of ["BO", "BR", "BR_MOSAICO", "CAM", "CL", "CO", "EC", "MX", "PE"]) {
      const res = await fetch(`${baseUrl}/params/Code_Parametros/${cc}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.rows.length).toBeGreaterThan(0)
    }
  })

  it("GET returns 404 for an unknown table", async () => {
    const res = await fetch(`${baseUrl}/params/Nope_Table/CL`)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe("not_found")
  })

  it("PUT then GET round-trips the saved rows", async () => {
    const rows = [
      { Variable: "umbral_actos", Valor: 7, "Observación": "edited" },
      { Variable: "umbral_semanas", Valor: 12, "Observación": "" },
    ]
    const put = await fetch(`${baseUrl}/params/Code_Parametros/PE`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    expect(put.status).toBe(200)
    const putBody = await put.json()
    expect(putBody.rows).toEqual(rows)
    expect(putBody.updated_at).toBeTruthy()

    const get = await fetch(`${baseUrl}/params/Code_Parametros/PE`)
    const getBody = await get.json()
    expect(getBody.rows).toEqual(rows)
  })

  it("validate flags a duplicate key as an error string", async () => {
    const rows = [
      { Variable: "dup", Valor: 1 },
      { Variable: "dup", Valor: 2 },
    ]
    const res = await fetch(`${baseUrl}/params/Code_Parametros/CL/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(Array.isArray(body.errors)).toBe(true)
    expect(body.errors.length).toBeGreaterThan(0)
    expect(body.errors.join(" ").toLowerCase()).toContain("dup")
  })

  it("validate flags a non-integer value as an error", async () => {
    const rows = [{ Variable: "x", Valor: "not-a-number" }]
    const res = await fetch(`${baseUrl}/params/Code_Parametros/CL/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.errors.length).toBeGreaterThan(0)
  })

  it("validate flags an out-of-range Semanas in Criterios_Elegibilidad", async () => {
    const rows = [{ IdRegla: 1, Categorias: 2, Semanas: 999, ExCateg: "", Actos: 3 }]
    const res = await fetch(`${baseUrl}/params/Criterios_Elegibilidad/CL/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.errors.join(" ").toLowerCase()).toContain("semanas")
  })

  it("validate flags an out-of-vocabulary variable in Q_Variables", async () => {
    const rows = [{ Q_Vars: "__does_not_exist__" }]
    const res = await fetch(`${baseUrl}/params/Q_Variables/CL/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.errors.length).toBeGreaterThan(0)
  })

  it("validate passes for clean rows", async () => {
    const rows = [{ Variable: "ok", Valor: 1 }]
    const res = await fetch(`${baseUrl}/params/Code_Parametros/CL/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.errors).toEqual([])
  })

  it("publish with validation errors returns 422 and does not publish", async () => {
    const rows = [
      { Variable: "dup", Valor: 1 },
      { Variable: "dup", Valor: 2 },
    ]
    const res = await fetch(`${baseUrl}/params/Code_Parametros/CO/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("validation_error")
    expect(body.errors.length).toBeGreaterThan(0)
  })

  it("publish (happy path) returns PublishResult with diff + parquet paths", async () => {
    // First publish establishes a baseline.
    await fetch(`${baseUrl}/params/Code_Parametros/MX/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: [{ Variable: "a", Valor: 1 }] }),
    })
    // Second publish adds a row -> diff should report it.
    const res = await fetch(`${baseUrl}/params/Code_Parametros/MX/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows: [
          { Variable: "a", Valor: 1 },
          { Variable: "b", Valor: 2 },
        ],
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.country).toBe("MX")
    expect(body.table).toBe("Code_Parametros")
    expect(typeof body.publish_id).toBe("string")
    expect(typeof body.published_at).toBe("string")
    expect(body.parquet_path).toContain("MX/Parametros/Code_Parametros.parquet")
    expect(body.versioned_path).toContain(".versions")
    expect(body.row_count).toBe(2)
    expect(body.diff.row_count_before).toBe(1)
    expect(body.diff.row_count_after).toBe(2)
    expect(body.diff.added_count).toBe(1)
    expect(body.diff.added).toEqual([{ Variable: "b", Valor: 2 }])
    expect(Array.isArray(body.warnings)).toBe(true)
  })
})
